/* ============================================================
   wishes.js · 愿望清单模块
   职责：
     1. 添加愿望（输入过滤 + 长度限制）
     2. 勾选完成 / 取消完成（带柔和庆祝动画）
     3. 删除愿望
     4. 待完成 / 已完成 两个分区切换，计数实时统计
   依赖：LoveUtils、LoveStore
   数据结构：state.wishes = [{ id, text, done, createdAt, doneAt }]
   ============================================================ */
(function (global) {
  "use strict";

  var Utils = global.LoveUtils;
  var Store = global.LoveStore;

  var MAX_WISHES = 500;
  var TOGGLE_DELAY = 460; // 勾选后等待庆祝动画的时长（毫秒）
  var REMOVE_DELAY = 300; // 取消完成/删除时等待退场动画的时长

  var els = {};
  var activeTab = "pending"; // 'pending' | 'done'
  var busyId = null; // 正在播放动画的愿望 id，避免重复点击

  /* ---------- 1. 元素缓存 ---------- */
  function cacheElements() {
    els.form = document.getElementById("wishForm");
    els.input = document.getElementById("wishInput");
    els.list = document.getElementById("wishList");
    els.empty = document.getElementById("wishEmpty");
    els.totalCount = document.getElementById("wishTotalCount");
    els.pendingCount = document.getElementById("wishPendingCount");
    els.doneCount = document.getElementById("wishDoneCount");
    els.tabPending = document.getElementById("wishTabPending");
    els.tabDone = document.getElementById("wishTabDone");
  }

  /* ---------- 2. 数据工具 ---------- */
  function getWishes() {
    return Store.getState().wishes;
  }

  /** 待完成按许愿时间倒序，已完成按完成时间倒序 */
  function getTabWishes() {
    var wishes = getWishes();
    if (activeTab === "done") {
      return wishes
        .filter(function (wish) {
          return wish.done;
        })
        .sort(function (a, b) {
          return (b.doneAt || b.createdAt) - (a.doneAt || a.createdAt);
        });
    }
    return wishes
      .filter(function (wish) {
        return !wish.done;
      })
      .sort(function (a, b) {
        return b.createdAt - a.createdAt;
      });
  }

  function countWishes() {
    var pending = 0;
    var done = 0;
    getWishes().forEach(function (wish) {
      if (wish.done) done += 1;
      else pending += 1;
    });
    return { pending: pending, done: done, total: pending + done };
  }

  /* ---------- 3. 渲染 ---------- */
  function createWishItem(wish) {
    var item = document.createElement("li");
    item.className = "wish-item" + (wish.done ? " is-done" : "");
    item.dataset.wishId = wish.id;

    // 勾选按钮
    var check = document.createElement("button");
    check.className = "wish-item__check";
    check.type = "button";
    check.dataset.wishToggle = wish.id;
    check.setAttribute("aria-pressed", wish.done ? "true" : "false");
    check.setAttribute(
      "aria-label",
      wish.done ? "取消完成：" + wish.text : "标记完成：" + wish.text
    );
    item.appendChild(check);

    // 文案
    var body = document.createElement("div");
    body.className = "wish-item__body";

    var text = document.createElement("p");
    text.className = "wish-item__text";
    text.textContent = wish.text;
    body.appendChild(text);

    var meta = document.createElement("p");
    meta.className = "wish-item__meta";
    meta.textContent = wish.done
      ? "完成于 " + Utils.formatDotDate(new Date(wish.doneAt || wish.createdAt))
      : "许下于 " + Utils.formatDotDate(new Date(wish.createdAt));
    body.appendChild(meta);

    item.appendChild(body);

    // 删除按钮
    var remove = document.createElement("button");
    remove.className = "wish-item__delete";
    remove.type = "button";
    remove.dataset.wishDelete = wish.id;
    remove.setAttribute("aria-label", "删除愿望：" + wish.text);
    remove.textContent = "×";
    item.appendChild(remove);

    return item;
  }

  function render() {
    var counts = countWishes();
    var list = getTabWishes();

    if (els.totalCount) els.totalCount.textContent = counts.total + " 个愿望";
    if (els.pendingCount) els.pendingCount.textContent = String(counts.pending);
    if (els.doneCount) els.doneCount.textContent = String(counts.done);

    if (els.list) {
      var fragment = document.createDocumentFragment();
      list.forEach(function (wish, index) {
        var item = createWishItem(wish);
        // 依次入场，形成柔和的错落感
        item.style.setProperty("--reveal-delay", Math.min(index, 8) * 40 + "ms");
        fragment.appendChild(item);
      });
      els.list.textContent = "";
      els.list.appendChild(fragment);
    }

    if (els.empty) {
      els.empty.hidden = list.length > 0;
      var tip = els.empty.querySelector("p");
      if (tip) {
        tip.textContent =
          activeTab === "done"
            ? "还没有完成的愿望。去待完成里勾选一件小事，这里就会亮起来。"
            : "这里还空着。写下第一个愿望吧，哪怕只是「一起看一场日落」。";
      }
    }

    updateTabs();
  }

  function updateTabs() {
    [
      [els.tabPending, "pending"],
      [els.tabDone, "done"]
    ].forEach(function (pair) {
      var tab = pair[0];
      if (!tab) return;
      var isActive = pair[1] === activeTab;
      tab.classList.toggle("is-active", isActive);
      tab.setAttribute("aria-selected", isActive ? "true" : "false");
    });
  }

  /* ---------- 4. 增删改 ---------- */
  function commitWishes(nextWishes) {
    return Store.commit(function (state) {
      state.wishes = nextWishes;
    });
  }

  function addWish(rawText) {
    var text = Utils.cleanText(rawText, 60);
    if (!text) {
      Utils.toast("先写下一个愿望吧", "error");
      if (els.input) els.input.focus();
      return false;
    }

    if (getWishes().length >= MAX_WISHES) {
      Utils.toast("愿望清单已满（最多 " + MAX_WISHES + " 个）", "error");
      return false;
    }

    // 待完成里已有同名愿望时给出提示，避免重复添加
    var duplicated = getWishes().some(function (wish) {
      return !wish.done && wish.text === text;
    });
    if (duplicated) {
      Utils.toast("这个愿望已经在清单里啦", "error");
      return false;
    }

    var wish = {
      id: Utils.uid("wish"),
      text: text,
      done: false,
      createdAt: Date.now(),
      doneAt: null
    };

    var ok = commitWishes([wish].concat(getWishes()));
    if (!ok) {
      Utils.toast("保存失败，请检查浏览器存储空间", "error");
      return false;
    }

    // 新愿望总在待完成区，自动切过去让用户看到
    if (activeTab !== "pending") {
      activeTab = "pending";
      render();
    }

    Utils.toast("愿望已加入清单", "success");
    return true;
  }

  /** 勾选 / 取消勾选：先播动画，再落库 */
  function toggleWish(id, itemEl) {
    if (busyId || !itemEl) return;
    var wish = getWishes().filter(function (entry) {
      return entry.id === id;
    })[0];
    if (!wish) return;

    busyId = id;

    if (!wish.done) {
      // 勾选：爱心绽放 + 轻微上浮，动画结束后落库并移动到「已完成」
      itemEl.classList.add("is-celebrating");
      itemEl.classList.add("is-done");
      global.setTimeout(function () {
        var next = getWishes().map(function (entry) {
          if (entry.id !== id) return entry;
          return Object.assign({}, entry, { done: true, doneAt: Date.now() });
        });
        var ok = commitWishes(next);
        busyId = null;
        if (!ok) Utils.toast("状态保存失败，请稍后重试", "error");
      }, TOGGLE_DELAY);
      return;
    }

    // 取消完成：轻柔退场后再落库
    itemEl.classList.add("is-removing");
    global.setTimeout(function () {
      var next = getWishes().map(function (entry) {
        if (entry.id !== id) return entry;
        return Object.assign({}, entry, { done: false, doneAt: null });
      });
      var ok = commitWishes(next);
      busyId = null;
      if (!ok) Utils.toast("状态保存失败，请稍后重试", "error");
    }, REMOVE_DELAY);
  }

  function removeWish(id, itemEl) {
    if (busyId) return;
    busyId = id;

    function remove() {
      var next = getWishes().filter(function (wish) {
        return wish.id !== id;
      });
      var ok = commitWishes(next);
      busyId = null;
      if (ok) Utils.toast("已删除这个愿望", "success");
      else Utils.toast("删除失败，请稍后重试", "error");
    }

    if (itemEl) {
      itemEl.classList.add("is-removing");
      global.setTimeout(remove, REMOVE_DELAY);
    } else {
      remove();
    }
  }

  /* ---------- 5. 事件绑定 ---------- */
  function bindEvents() {
    // 提交新愿望
    if (els.form) {
      els.form.addEventListener("submit", function (event) {
        event.preventDefault();
        if (addWish(els.input ? els.input.value : "")) {
          if (els.input) {
            els.input.value = "";
            els.input.focus();
          }
        }
      });
    }

    // 分区切换
    [els.tabPending, els.tabDone].forEach(function (tab) {
      if (!tab) return;
      tab.addEventListener("click", function () {
        var next = tab.dataset.wishTab;
        if (!next || next === activeTab) return;
        activeTab = next;
        render();
      });
    });

    // 列表内的勾选与删除（事件委托）
    if (els.list) {
      els.list.addEventListener("click", function (event) {
        var check = event.target.closest("[data-wish-toggle]");
        if (check) {
          var item = check.closest(".wish-item");
          toggleWish(check.dataset.wishToggle, item);
          return;
        }

        var remove = event.target.closest("[data-wish-delete]");
        if (remove) {
          removeWish(remove.dataset.wishDelete, remove.closest(".wish-item"));
        }
      });
    }

    // 数据变化（含其他标签页）时重渲染
    Store.subscribe(function () {
      render();
    });
  }

  /* ---------- 6. 初始化 ---------- */
  function init() {
    cacheElements();
    bindEvents();
    render();
  }

  global.LoveWishes = {
    init: init,
    render: render
  };
})(window);
