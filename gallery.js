/* ============================================================
   gallery.js · 相册模块
   职责：
     1. 单张上传 / 多选批量导入 / 拖拽导入
     2. 图片自动压缩后写入 localStorage（防止超出容量）
     3. 瀑布流网格渲染、点击打开灯箱、左右切换
     4. 单张删除（列表内二次确认；灯箱内直接删除）
   依赖：LoveUtils、LoveStore
   数据结构：state.gallery = [{ id, dataUrl, name, width, height, createdAt }]
   ============================================================ */
(function (global) {
  "use strict";

  var Utils = global.LoveUtils;
  var Store = global.LoveStore;

  var MAX_BATCH = 30; // 一次最多导入多少张
  var MAX_PHOTOS = 200; // 相册最多保存多少张
  var MAX_FILE_MB = 30; // 单张原图大小上限（压缩前），避免解码超大图卡死

  var els = {};
  var visiblePhotos = []; // 当前展示顺序（最新在前）
  var lastGalleryRef = null;
  var isImporting = false;
  var lightboxIndex = -1;
  var lightboxOpen = false;
  var closeTimer = null;
  var confirmDeleteId = null;
  var confirmTimer = null;

  /* ---------- 1. 元素缓存 ---------- */
  function cacheElements() {
    els.grid = document.getElementById("galleryGrid");
    els.empty = document.getElementById("galleryEmpty");
    els.count = document.getElementById("galleryCount");
    els.dropzone = document.getElementById("dropzone");
    els.singleInput = document.getElementById("fileInputSingle");
    els.multiInput = document.getElementById("fileInputMulti");
    els.singleBtn = document.getElementById("uploadSingleBtn");
    els.multiBtn = document.getElementById("uploadMultiBtn");
    els.progress = document.getElementById("importProgress");
    els.progressText = document.getElementById("importProgressText");

    els.lightbox = document.getElementById("lightbox");
    els.lightboxImage = document.getElementById("lightboxImage");
    els.lightboxCaption = document.getElementById("lightboxCaption");
    els.lightboxClose = document.getElementById("lightboxClose");
    els.lightboxPrev = document.getElementById("lightboxPrev");
    els.lightboxNext = document.getElementById("lightboxNext");
    els.lightboxDelete = document.getElementById("lightboxDelete");
  }

  /* ---------- 2. 渲染相册 ---------- */
  function getSortedPhotos(gallery) {
    return gallery.slice().sort(function (a, b) {
      return b.createdAt - a.createdAt;
    });
  }

  function createTile(photo, index) {
    var tile = document.createElement("div");
    tile.className = "gallery-item";
    tile.setAttribute("role", "button");
    tile.setAttribute("tabindex", "0");
    tile.dataset.id = photo.id;
    tile.dataset.index = String(index);
    tile.setAttribute("aria-label", "预览照片：" + photo.name);

    var img = document.createElement("img");
    img.className = "gallery-item__img";
    img.src = photo.dataUrl;
    img.alt = photo.name || "我们的照片";
    img.loading = "lazy";
    img.decoding = "async";
    img.draggable = false;
    tile.appendChild(img);

    var date = document.createElement("span");
    date.className = "gallery-item__date";
    date.textContent = Utils.formatDotDate(new Date(photo.createdAt));
    tile.appendChild(date);

    var del = document.createElement("button");
    del.className = "gallery-item__delete";
    del.type = "button";
    del.dataset.deleteId = photo.id;
    del.setAttribute("aria-label", "删除照片：" + photo.name);
    del.textContent = "×";
    tile.appendChild(del);

    return tile;
  }

  function render() {
    var gallery = Store.getState().gallery;
    if (gallery === lastGalleryRef) return;
    lastGalleryRef = gallery;

    visiblePhotos = getSortedPhotos(gallery);

    if (els.grid) {
      var fragment = document.createDocumentFragment();
      visiblePhotos.forEach(function (photo, index) {
        fragment.appendChild(createTile(photo, index));
      });
      els.grid.textContent = "";
      els.grid.appendChild(fragment);
    }

    if (els.empty) els.empty.hidden = visiblePhotos.length > 0;
    if (els.count) els.count.textContent = visiblePhotos.length + " 张照片";

    // 灯箱开着时同步当前图片
    if (lightboxOpen) {
      if (!visiblePhotos.length) {
        closeLightbox();
      } else {
        lightboxIndex = Math.min(lightboxIndex, visiblePhotos.length - 1);
        updateLightbox();
      }
    }
  }

  /* ---------- 3. 导入流程 ---------- */
  function setProgress(visible, text) {
    if (!els.progress) return;
    els.progress.hidden = !visible;
    if (els.progressText && text) els.progressText.textContent = text;
  }

  /**
   * 把一张压缩后的图片写入 store；
   * Store.commit 在写入失败时会自动回滚内存状态（见 store.js），
   * 所以这里只需要返回结果，界面不会出现「假保存」的照片。
   */
  function addPhoto(photo) {
    return Store.commit(function (state) {
      state.gallery = [photo].concat(state.gallery);
    });
  }

  async function importFiles(fileList) {
    if (isImporting) {
      Utils.toast("正在导入照片，请稍等一下");
      return;
    }

    var files = Array.prototype.slice.call(fileList || []).filter(Utils.isImageFile);
    if (!files.length) {
      Utils.toast("请选择图片文件（JPG / PNG / WebP / GIF）", "error");
      return;
    }

    var oversized = files.filter(function (file) {
      return file.size > MAX_FILE_MB * 1024 * 1024;
    });
    if (oversized.length) {
      Utils.toast("有 " + oversized.length + " 张图片超过 " + MAX_FILE_MB + "MB，已跳过", "error");
      files = files.filter(function (file) {
        return file.size <= MAX_FILE_MB * 1024 * 1024;
      });
    }

    if (files.length > MAX_BATCH) {
      Utils.toast("一次最多导入 " + MAX_BATCH + " 张，已取前 " + MAX_BATCH + " 张", "error");
      files = files.slice(0, MAX_BATCH);
    }

    if (files.length === 0) return;

    var remaining = MAX_PHOTOS - Store.getState().gallery.length;
    if (remaining <= 0) {
      Utils.toast("相册已满（最多 " + MAX_PHOTOS + " 张），请先删除一些照片", "error");
      return;
    }
    if (files.length > remaining) {
      Utils.toast("相册剩余空间只够 " + remaining + " 张，已自动截取", "error");
      files = files.slice(0, remaining);
    }

    isImporting = true;
    if (els.singleBtn) els.singleBtn.disabled = true;
    if (els.multiBtn) els.multiBtn.disabled = true;
    setProgress(true, "正在压缩 0 / " + files.length);

    var added = 0;
    var skipped = 0;

    try {
      for (var i = 0; i < files.length; i++) {
        setProgress(true, "正在压缩 " + (i + 1) + " / " + files.length);

        var file = files[i];
        var result;
        try {
          result = await Utils.compressImage(file, {
            maxEdge: 1280,
            quality: 0.82,
            targetBytes: 260 * 1024
          });
        } catch (error) {
          skipped += 1;
          continue;
        }

        var photo = {
          id: Utils.uid("photo"),
          dataUrl: result.dataUrl,
          name: Utils.cleanText(file.name, 80) || "我们的照片",
          width: result.width,
          height: result.height,
          createdAt: Date.now()
        };

        var ok = addPhoto(photo);
        if (ok) {
          added += 1;
        } else {
          skipped += 1;
          // 容量不足时停止继续导入，避免无意义地反复失败
          if (Store.isQuotaExceeded() || !Store.isStorageAvailable()) break;
        }
      }
    } finally {
      isImporting = false;
      if (els.singleBtn) els.singleBtn.disabled = false;
      if (els.multiBtn) els.multiBtn.disabled = false;
      setProgress(false);
      if (els.singleInput) els.singleInput.value = "";
      if (els.multiInput) els.multiInput.value = "";
    }

    if (added > 0 && skipped === 0) {
      Utils.toast("已添加 " + added + " 张照片", "success");
    } else if (added > 0 && skipped > 0) {
      Utils.toast(
        "已添加 " + added + " 张，" +
          (Store.isQuotaExceeded()
            ? "存储空间不足，其余 " + skipped + " 张未保存"
            : skipped + " 张处理失败"),
        "error"
      );
    } else if (skipped > 0) {
      Utils.toast(
        Store.isQuotaExceeded()
          ? "存储空间不足，照片未能保存，请先删除部分照片"
          : "图片处理失败，换一张试试",
        "error"
      );
    }
  }

  /* ---------- 4. 删除 ---------- */
  function removePhoto(id) {
    var ok = Store.commit(function (state) {
      state.gallery = state.gallery.filter(function (item) {
        return item.id !== id;
      });
    });

    if (!ok) {
      Utils.toast("删除失败，请稍后重试", "error");
      return false;
    }

    // 删除后立即同步重渲染，保证灯箱里的「当前照片」指向正确
    render();
    return true;
  }

  /** 列表内删除：第一次点击变成「确认」，2.6 秒内再点一次才真正删除 */
  function handleTileDelete(button) {
    var id = button.dataset.deleteId;
    if (!id) return;

    if (confirmDeleteId === id) {
      clearTimeout(confirmTimer);
      confirmDeleteId = null;
      var tile = button.closest(".gallery-item");
      if (tile) {
        tile.classList.add("is-removing");
        global.setTimeout(function () {
          removePhoto(id);
        }, 300);
      } else {
        removePhoto(id);
      }
      return;
    }

    // 先清掉上一个待确认的按钮
    if (confirmDeleteId) resetDeleteConfirm();
    confirmDeleteId = id;
    button.classList.add("is-confirming");
    button.textContent = "确认?";
    button.setAttribute("aria-label", "再次点击确认删除这张照片");

    confirmTimer = global.setTimeout(resetDeleteConfirm, 2600);
  }

  function resetDeleteConfirm() {
    clearTimeout(confirmTimer);
    confirmDeleteId = null;
    Utils.$$(".gallery-item__delete.is-confirming").forEach(function (button) {
      button.classList.remove("is-confirming");
      button.textContent = "×";
      button.setAttribute("aria-label", "删除照片");
    });
  }

  /* ---------- 5. 灯箱 ---------- */
  var backgroundNodes = [];

  /** 灯箱打开时把背景设为 inert，Tab / 读屏都不会跑到页面后面 */
  function setBackgroundInert(on) {
    if (!backgroundNodes.length) {
      backgroundNodes = Utils.$$("main, .site-header, .site-footer");
    }
    backgroundNodes.forEach(function (node) {
      node.inert = on;
    });
  }

  function openLightbox(index) {
    if (!visiblePhotos[index] || !els.lightbox) return;
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
    lightboxIndex = index;
    lightboxOpen = true;

    els.lightbox.hidden = false;
    document.body.classList.add("is-lightbox-open");
    setBackgroundInert(true);
    updateLightbox();

    global.requestAnimationFrame(function () {
      if (els.lightbox) els.lightbox.classList.add("is-open");
    });

    if (els.lightboxClose) els.lightboxClose.focus();
  }

  function updateLightbox() {
    var photo = visiblePhotos[lightboxIndex];
    if (!photo || !els.lightboxImage) return;

    els.lightboxImage.src = photo.dataUrl;
    els.lightboxImage.alt = photo.name || "我们的照片";

    if (els.lightboxCaption) {
      els.lightboxCaption.textContent =
        lightboxIndex + 1 +
        " / " +
        visiblePhotos.length +
        " · " +
        Utils.formatDotDate(new Date(photo.createdAt));
    }

    var single = visiblePhotos.length <= 1;
    if (els.lightboxPrev) els.lightboxPrev.disabled = single;
    if (els.lightboxNext) els.lightboxNext.disabled = single;

    // 切换时给图片一个极短的淡入，避免生硬闪烁
    if (!Utils.prefersReducedMotion() && els.lightbox) {
      els.lightbox.classList.remove("is-switching");
      void els.lightbox.offsetWidth;
      els.lightbox.classList.add("is-switching");
    }
  }

  function closeLightbox() {
    if (!els.lightbox || !lightboxOpen) return;
    lightboxOpen = false;
    els.lightbox.classList.remove("is-open");
    els.lightbox.classList.remove("is-switching");
    document.body.classList.remove("is-lightbox-open");
    setBackgroundInert(false);

    closeTimer = global.setTimeout(function () {
      if (els.lightbox) els.lightbox.hidden = true;
      closeTimer = null;
    }, 450);

    // 焦点还给对应的缩略图
    var tile = els.grid ? els.grid.querySelector('[data-id="' + visiblePhotos[lightboxIndex]?.id + '"]') : null;
    if (tile) tile.focus();
  }

  function stepLightbox(direction) {
    if (!lightboxOpen || visiblePhotos.length < 2) return;
    lightboxIndex =
      (lightboxIndex + direction + visiblePhotos.length) % visiblePhotos.length;
    updateLightbox();
  }

  function deleteFromLightbox() {
    var photo = visiblePhotos[lightboxIndex];
    if (!photo) return;
    var photoId = photo.id;

    var ok = removePhoto(photoId);
    if (!ok) return;

    // store 通知已经同步了 visiblePhotos
    if (!visiblePhotos.length) {
      closeLightbox();
    } else {
      lightboxIndex = Math.min(lightboxIndex, visiblePhotos.length - 1);
      updateLightbox();
    }
    Utils.toast("已删除这张照片", "success");
  }

  /* ---------- 6. 事件绑定 ---------- */
  function bindEvents() {
    // 单张上传
    if (els.singleBtn && els.singleInput) {
      els.singleBtn.addEventListener("click", function (event) {
        event.stopPropagation();
        els.singleInput.click();
      });
    }

    // 批量导入
    if (els.multiBtn && els.multiInput) {
      els.multiBtn.addEventListener("click", function (event) {
        event.stopPropagation();
        els.multiInput.click();
      });
    }

    if (els.singleInput) {
      els.singleInput.addEventListener("change", function () {
        importFiles(els.singleInput.files);
      });
    }

    if (els.multiInput) {
      els.multiInput.addEventListener("change", function () {
        importFiles(els.multiInput.files);
      });
    }

    // 点击拖拽区空白处 = 批量选择
    if (els.dropzone) {
      els.dropzone.addEventListener("click", function () {
        if (els.multiInput) els.multiInput.click();
      });

      els.dropzone.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          if (els.multiInput) els.multiInput.click();
        }
      });

      // 拖拽状态
      ["dragenter", "dragover"].forEach(function (type) {
        els.dropzone.addEventListener(type, function (event) {
          event.preventDefault();
          event.stopPropagation();
          els.dropzone.classList.add("is-dragover");
        });
      });

      ["dragleave", "dragend"].forEach(function (type) {
        els.dropzone.addEventListener(type, function (event) {
          event.preventDefault();
          els.dropzone.classList.remove("is-dragover");
        });
      });

      els.dropzone.addEventListener("drop", function (event) {
        event.preventDefault();
        event.stopPropagation();
        els.dropzone.classList.remove("is-dragover");
        if (event.dataTransfer && event.dataTransfer.files) {
          importFiles(event.dataTransfer.files);
        }
      });
    }

    // 避免照片被拖到页面其他位置时浏览器直接打开图片
    ["dragover", "drop"].forEach(function (type) {
      document.addEventListener(type, function (event) {
        if (!els.dropzone || !els.dropzone.contains(event.target)) {
          event.preventDefault();
        }
      });
    });

    // 网格：点击放大 / 键盘打开 / 删除
    if (els.grid) {
      els.grid.addEventListener("click", function (event) {
        var deleteButton = event.target.closest(".gallery-item__delete");
        if (deleteButton) {
          event.stopPropagation();
          handleTileDelete(deleteButton);
          return;
        }

        var tile = event.target.closest(".gallery-item");
        if (!tile) return;
        var index = Number(tile.dataset.index);
        if (isFinite(index)) openLightbox(index);
      });

      els.grid.addEventListener("keydown", function (event) {
        var tile = event.target.closest(".gallery-item");
        if (!tile) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openLightbox(Number(tile.dataset.index));
        }
      });
    }

    // 灯箱按钮
    if (els.lightboxClose) els.lightboxClose.addEventListener("click", closeLightbox);
    if (els.lightboxPrev) {
      els.lightboxPrev.addEventListener("click", function (event) {
        event.stopPropagation();
        stepLightbox(-1);
      });
    }
    if (els.lightboxNext) {
      els.lightboxNext.addEventListener("click", function (event) {
        event.stopPropagation();
        stepLightbox(1);
      });
    }
    if (els.lightboxDelete) els.lightboxDelete.addEventListener("click", deleteFromLightbox);

    // 点击遮罩关闭（点图片和按钮不关闭）
    if (els.lightbox) {
      els.lightbox.addEventListener("click", function (event) {
        if (event.target === els.lightbox) closeLightbox();
      });
    }

    // 键盘：Esc 关闭，左右切换，Tab 在灯箱内循环
    document.addEventListener("keydown", function (event) {
      if (!lightboxOpen) return;
      if (event.key === "Escape") {
        event.preventDefault();
        closeLightbox();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        stepLightbox(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        stepLightbox(1);
      } else if (event.key === "Tab") {
        // 焦点陷阱：只在灯箱的四个按钮之间循环，避免 Tab 跑到背景页面
        var focusable = [
          els.lightboxClose,
          els.lightboxPrev,
          els.lightboxNext,
          els.lightboxDelete
        ].filter(function (node) {
          return node && !node.disabled && node.offsetParent !== null;
        });
        if (!focusable.length) return;

        var first = focusable[0];
        var last = focusable[focusable.length - 1];
        var active = document.activeElement;
        var inside = els.lightbox.contains(active);

        if (event.shiftKey && (!inside || active === first)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (!inside || active === last)) {
          event.preventDefault();
          first.focus();
        }
      }
    });

    // 手机端左右滑动切换
    var touchStartX = 0;
    var touchStartY = 0;
    if (els.lightbox) {
      els.lightbox.addEventListener(
        "touchstart",
        function (event) {
          if (!event.touches || event.touches.length !== 1) return;
          touchStartX = event.touches[0].clientX;
          touchStartY = event.touches[0].clientY;
        },
        { passive: true }
      );

      els.lightbox.addEventListener(
        "touchend",
        function (event) {
          if (!event.changedTouches || event.changedTouches.length !== 1) return;
          var dx = event.changedTouches[0].clientX - touchStartX;
          var dy = event.changedTouches[0].clientY - touchStartY;
          if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
          stepLightbox(dx < 0 ? 1 : -1);
        },
        { passive: true }
      );
    }

    // 数据变化时重渲染：批量导入会连续 commit，用 rAF 合并成一次重绘
    var renderScheduled = false;
    Store.subscribe(function (payload) {
      if (payload && payload.external) {
        render();
        return;
      }
      if (renderScheduled) return;
      renderScheduled = true;
      global.requestAnimationFrame(function () {
        renderScheduled = false;
        render();
      });
    });
  }

  /* ---------- 7. 初始化 ---------- */
  function init() {
    cacheElements();
    bindEvents();
    render();
  }

  global.LoveGallery = {
    init: init,
    render: render
  };
})(window);
