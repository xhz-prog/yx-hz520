/* ============================================================
   main.js · 启动与页面级交互
   职责：
     1. 启动顺序：先load数据，再依次初始化各业务模块
     2. 首屏统计数字、分区入场动画、导航高亮、快捷跳转
     3. 存储异常提示条（容量不足时出现，恢复正常后自动收起）
   依赖：LoveUtils、LoveStore 及四个业务模块、爱心动画
   ============================================================ */
(function (global) {
  "use strict";

  var Utils = global.LoveUtils;
  var Store = global.LoveStore;

  var SECTION_IDS = ["timer", "gallery", "wishes", "messages"];

  var els = {
    statPhotos: null,
    statWishes: null,
    statMessages: null,
    storageAlert: null,
    storageAlertText: null,
    storageAlertClose: null,
    navLinks: []
  };

  /* ---------- 1. 统计数字 ---------- */
  function refreshStats() {
    var state = Store.getState();
    if (els.statPhotos) els.statPhotos.textContent = String(state.gallery.length);
    if (els.statWishes) els.statWishes.textContent = String(state.wishes.length);
    if (els.statMessages) els.statMessages.textContent = String(state.messages.length);
  }

  /* ---------- 2. 入场动画（IntersectionObserver 只触发一次） ---------- */
  function initReveal() {
    var items = Utils.$$(".reveal");
    if (!items.length) return;

    // 同一容器内的多个元素依次入场，形成柔和错落
    items.forEach(function (el) {
      var parent = el.parentElement;
      if (!parent) return;
      var siblings = Array.prototype.filter.call(parent.children, function (child) {
        return child.classList.contains("reveal");
      });
      var index = siblings.indexOf(el);
      if (index > 0) {
        el.style.setProperty("--reveal-delay", Math.min(index, 6) * 70 + "ms");
      }
    });

    if (typeof global.IntersectionObserver !== "function") {
      items.forEach(function (el) {
        el.classList.add("is-visible");
      });
      return;
    }

    var pending = items.slice();

    function markVisible(el) {
      el.classList.add("is-visible");
      observer.unobserve(el);
      var index = pending.indexOf(el);
      if (index >= 0) pending.splice(index, 1);
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) markVisible(entry.target);
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" }
    );

    items.forEach(function (el) {
      observer.observe(el);
    });

    /**
     * 兜底扫一遍：极快的跳跃滚动（或某些无头浏览器里）可能让
     * IntersectionObserver 漏掉某次进入视口，这里用 getBoundingClientRect
     * 补一次判断，保证内容不会永远停在 opacity:0。
     */
    function sweep() {
      var viewportHeight = global.innerHeight || 0;
      pending.slice().forEach(function (el) {
        var rect = el.getBoundingClientRect();
        // 已经滚过去的内容也直接显示，避免来回滚动时出现空白
        if (rect.bottom <= 0 || (rect.top < viewportHeight * 0.94 && rect.bottom > 0)) {
          markVisible(el);
        }
      });
    }

    sweep();
    global.setTimeout(sweep, 400);

    var ticking = false;
    global.addEventListener(
      "scroll",
      function () {
        if (ticking) return;
        ticking = true;
        global.requestAnimationFrame(function () {
          ticking = false;
          if (pending.length) sweep();
        });
      },
      { passive: true }
    );

    global.addEventListener("resize", Utils.debounce(sweep, 200));
  }

  /* ---------- 3. 导航高亮（滚动到哪个分区就亮哪个） ---------- */
  function initScrollSpy() {
    if (typeof global.IntersectionObserver !== "function") return;

    var links = {};
    els.navLinks.forEach(function (link) {
      links[link.dataset.nav] = link;
    });

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          els.navLinks.forEach(function (link) {
            link.classList.toggle("is-active", link.dataset.nav === entry.target.id);
          });
        });
      },
      // 只看视口中部的一条窄带，避免多个分区同时命中
      { rootMargin: "-42% 0px -54% 0px", threshold: 0 }
    );

    SECTION_IDS.forEach(function (id) {
      var section = document.getElementById(id);
      if (section) observer.observe(section);
    });
  }

  /* ---------- 4. 快捷跳转按钮 ---------- */
  function initJumpButtons() {
    Utils.$$("[data-jump]").forEach(function (button) {
      button.addEventListener("click", function () {
        var target = document.querySelector(button.dataset.jump);
        if (!target) return;
        var reduce = Utils.prefersReducedMotion();
        target.scrollIntoView({
          behavior: reduce ? "auto" : "smooth",
          block: "start"
        });
      });
    });
  }

  /* ---------- 5. 存储异常提示条 ---------- */
  function showStorageAlert(text) {
    if (!els.storageAlert) return;
    if (els.storageAlertText && text) els.storageAlertText.textContent = text;
    els.storageAlert.hidden = false;
  }

  function hideStorageAlert() {
    if (!els.storageAlert) return;
    els.storageAlert.hidden = true;
  }

  function initStorageAlert() {
    if (els.storageAlertClose) {
      els.storageAlertClose.addEventListener("click", hideStorageAlert);
    }

    Store.subscribe(function (payload) {
      refreshStats();
      if (!payload) return;

      if (payload.silent) return;

      if (payload.ok) {
        hideStorageAlert();
        return;
      }

      if (payload.quotaExceeded) {
        showStorageAlert("浏览器存储空间不足，最新内容可能没有保存。可以删除部分照片后再试。");
      } else if (!Store.isStorageAvailable()) {
        showStorageAlert("当前浏览器不允许本地存储，内容只在本次打开期间有效。");
      } else {
        showStorageAlert("保存失败，内容可能没有写入本地存储。");
      }
    });
  }

  /* ---------- 6. 启动 ---------- */
  function initElements() {
    els.statPhotos = document.getElementById("statPhotos");
    els.statWishes = document.getElementById("statWishes");
    els.statMessages = document.getElementById("statMessages");
    els.storageAlert = document.getElementById("storageAlert");
    els.storageAlertText = document.getElementById("storageAlertText");
    els.storageAlertClose = document.getElementById("storageAlertClose");
    els.navLinks = Utils.$$("[data-nav]");
  }

  function boot() {
    initElements();

    // 先读数据，再初始化模块，避免各模块拿到默认值
    Store.load();

    global.LoveTimer.init();
    global.LoveGallery.init();
    global.LoveWishes.init();
    global.LoveMessages.init();
    global.LoveHearts.init();

    refreshStats();
    initReveal();
    initScrollSpy();
    initJumpButtons();
    initStorageAlert();

    // 多标签页之间保持同步
    Store.bindStorageSync();

    // 数据损坏 / 隐私模式等启动提示，等页面稳定后再弹
    var warning = Store.getLoadWarning();
    if (warning) {
      global.setTimeout(function () {
        Utils.toast(warning, "error");
      }, 700);
    }

    if (!Store.isStorageAvailable()) {
      showStorageAlert("当前浏览器不允许本地存储，内容只在本次打开期间有效。");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", runSafely);
  } else {
    runSafely();
  }

  /**
   * 启动兜底：万一某个模块初始化报错，也要保证页面内容可见，
   * 而不是因为入场动画的初始 opacity:0 变成一片空白。
   */
  function runSafely() {
    try {
      boot();
    } catch (error) {
      document.documentElement.classList.remove("js");
      if (global.console) console.error("[LoveSpace] 初始化失败：", error);
    }
  }
})(window);
