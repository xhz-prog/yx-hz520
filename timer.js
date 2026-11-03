/* ============================================================
   timer.js · 计时模块（纪念日）
   职责：
     - 计算「在一起第几天」与已共同走过的精确时长
     - 计算距离下一个周年的倒计时
     - 编辑双方名字与纪念日日期，并写入本地存储
     - 同步更新 Hero 区（名字 / SINCE / 天数）与顶部统计里的天数
   依赖：LoveUtils、LoveStore
   ============================================================ */
(function (global) {
  "use strict";

  var Utils = global.LoveUtils;
  var Store = global.LoveStore;

  var els = {};
  var tickTimer = null;
  var lastRenderedDay = null;
  var lastCountdownKey = "";
  var lastCoupleRef = null;

  /* ---------- 1. 元素缓存 ---------- */
  function cacheElements() {
    els.form = document.getElementById("timerForm");
    els.editBtn = document.getElementById("timerEditBtn");
    els.cancelBtn = document.getElementById("timerCancelBtn");
    els.inputNameA = document.getElementById("inputNameA");
    els.inputNameB = document.getElementById("inputNameB");
    els.inputStartDate = document.getElementById("inputStartDate");

    els.days = document.getElementById("timerDays");
    els.precise = document.getElementById("timerPrecise");
    els.since = document.getElementById("timerSince");
    els.countdownLabel = document.getElementById("countdownLabel");
    els.countdownDays = document.getElementById("countdownDays");
    els.countdownHint = document.getElementById("countdownHint");

    els.heroDayNumber = document.getElementById("heroDayNumber");
    els.heroDayCaption = document.getElementById("heroDayCaption");
    els.heroSinceText = document.getElementById("heroSinceText");
    els.heroNames = document.getElementById("heroNames");
  }

  /* ---------- 2. 计算：在一起多久 ---------- */
  function getStartDate() {
    var state = Store.getState();
    return (
      Utils.parseISODate(state.couple.startDate) || Utils.startOfDay(new Date())
    );
  }

  /**
   * @returns {{dayNumber:number, elapsedDays:number, hours:number, minutes:number, seconds:number}}
   */
  function computeTogether() {
    var start = getStartDate();
    var now = new Date();
    var elapsedDays = Math.max(0, Utils.diffInDays(start, now));

    // 精确时长从纪念日当天 00:00 起算
    var diffMs = Math.max(0, now.getTime() - start.getTime());
    var totalSeconds = Math.floor(diffMs / 1000);
    var days = Math.floor(totalSeconds / 86400);
    var hours = Math.floor((totalSeconds % 86400) / 3600);
    var minutes = Math.floor((totalSeconds % 3600) / 60);
    var seconds = totalSeconds % 60;

    return {
      dayNumber: elapsedDays + 1, // 「第 N 天」包含当天
      elapsedDays: days,
      hours: hours,
      minutes: minutes,
      seconds: seconds
    };
  }

  /* ---------- 3. 计算：下一个周年纪念日 ---------- */
  function getNextAnniversary() {
    var start = getStartDate();
    var today = Utils.startOfDay(new Date());

    // 纪念日还在未来：按「距离纪念日」展示
    if (start.getTime() > today.getTime()) {
      return {
        label: "距离我们的纪念日",
        days: Utils.diffInDays(today, start),
        hint: "日子还没到，先把期待存起来。",
        isToday: false
      };
    }

    var year = today.getFullYear();
    var candidate = new Date(year, start.getMonth(), start.getDate());
    var guard = 0;
    while (candidate.getTime() < today.getTime() && guard < 10) {
      year += 1;
      candidate = new Date(year, start.getMonth(), start.getDate());
      guard += 1;
    }

    var years = Math.max(1, candidate.getFullYear() - start.getFullYear());
    var days = Utils.diffInDays(today, candidate);

    if (days === 0) {
      return {
        label: "今天就是我们的纪念日",
        days: 0,
        hint: years + " 周年快乐，记得抱一下。",
        isToday: true
      };
    }

    var hint =
      days <= 30
        ? "快到了，可以偷偷准备一个小惊喜。"
        : "日子慢慢走，我们慢慢爱。";

    return {
      label: "距离 " + years + " 周年纪念日",
      days: days,
      hint: hint,
      isToday: false
    };
  }

  /* ---------- 4. 渲染 ---------- */
  function setText(el, text) {
    if (el && el.textContent !== String(text)) el.textContent = String(text);
  }

  /** 天数变化时给数字一个轻轻的跳动（尊重减少动效设置） */
  function pulseNumber(el) {
    if (!el || Utils.prefersReducedMotion()) return;
    el.classList.remove("is-ticking");
    // 强制重排，保证同一元素连续变化时动画可重复触发
    void el.offsetWidth;
    el.classList.add("is-ticking");
    global.setTimeout(function () {
      el.classList.remove("is-ticking");
    }, 600);
  }

  function renderNames() {
    var couple = Store.getState().couple;
    var start = getStartDate();

    if (els.heroNames) {
      els.heroNames.innerHTML =
        Utils.escapeHTML(couple.nameA) +
        ' <span class="heart-sep" aria-hidden="true">♥</span> ' +
        Utils.escapeHTML(couple.nameB);
    }
    setText(els.heroSinceText, "SINCE " + Utils.formatDotDate(start));
    setText(els.since, "从 " + Utils.formatChineseDate(start) + " 开始，认真记录每一天。");
  }

  function renderCounter() {
    var info = computeTogether();
    var state = Store.getState();

    if (els.days) {
      var dayText = String(info.dayNumber);
      if (els.days.textContent !== dayText) {
        els.days.textContent = dayText;
        pulseNumber(els.days);
      }
    }

    setText(
      els.precise,
      "已共同走过 " +
        info.elapsedDays +
        " 天 " +
        pad(info.hours) +
        " 时 " +
        pad(info.minutes) +
        " 分 " +
        pad(info.seconds) +
        " 秒"
    );

    if (els.heroDayNumber) {
      var heroText = String(info.dayNumber);
      if (els.heroDayNumber.textContent !== heroText) {
        els.heroDayNumber.textContent = heroText;
      }
    }
    if (els.heroDayCaption) {
      setText(
        els.heroDayCaption,
        "天 · 从 " + Utils.formatDotDate(getStartDate()) + " 起"
      );
    }

    // 顶部计时卡片的小标题跟随状态
    var labelEl = els.days ? els.days.closest(".timer-card__days") : null;
    if (labelEl) {
      var cardLabel = labelEl.previousElementSibling;
      if (cardLabel && cardLabel.classList.contains("timer-card__label")) {
        setText(cardLabel, "我们已经在一起的第");
      }
    }

    // 名字变化后同步 Hero
    if (lastCoupleRef !== state.couple) {
      lastCoupleRef = state.couple;
      renderNames();
    }

    renderCountdown(info);
  }

  function renderCountdown() {
    var next = getNextAnniversary();
    var key = next.label + "|" + next.days + "|" + next.hint;
    if (key === lastCountdownKey) return;
    lastCountdownKey = key;

    setText(els.countdownLabel, next.label);
    if (els.countdownDays && els.countdownDays.textContent !== String(next.days)) {
      els.countdownDays.textContent = String(next.days);
      pulseNumber(els.countdownDays);
    }
    setText(els.countdownHint, next.hint);
  }

  function pad(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function renderAll() {
    lastRenderedDay = null;
    renderNames();
    lastCountdownKey = "";
    renderCounter();
  }

  /* ---------- 5. 编辑面板 ---------- */
  function syncFormFromState() {
    var couple = Store.getState().couple;
    if (els.inputNameA) els.inputNameA.value = couple.nameA;
    if (els.inputNameB) els.inputNameB.value = couple.nameB;
    if (els.inputStartDate) els.inputStartDate.value = couple.startDate;
  }

  function openEditor() {
    if (!els.form) return;
    syncFormFromState();
    els.form.hidden = false;
    els.form.classList.add("is-open");
    if (els.editBtn) els.editBtn.setAttribute("aria-expanded", "true");
    if (els.inputNameA) {
      els.inputNameA.focus();
      els.inputNameA.select();
    }
  }

  function closeEditor() {
    if (!els.form) return;
    els.form.hidden = true;
    els.form.classList.remove("is-open");
    if (els.editBtn) els.editBtn.setAttribute("aria-expanded", "false");
  }

  function handleSubmit(event) {
    event.preventDefault();

    var nameA = Utils.cleanText(els.inputNameA ? els.inputNameA.value : "", 12) || "我";
    var nameB = Utils.cleanText(els.inputNameB ? els.inputNameB.value : "", 12) || "你";
    var startDate = els.inputStartDate ? els.inputStartDate.value : "";
    var parsed = Utils.parseISODate(startDate);

    if (!parsed) {
      Utils.toast("请选择一个有效的纪念日日期", "error");
      return;
    }

    var today = Utils.startOfDay(new Date());
    if (parsed.getTime() > today.getTime()) {
      Utils.toast("纪念日不能设在未来哦", "error");
      return;
    }

    var ok = Store.commit(function (state) {
      state.couple = { nameA: nameA, nameB: nameB, startDate: startDate };
    });

    if (ok) {
      Utils.toast("纪念日已保存", "success");
      closeEditor();
    } else {
      Utils.toast("保存失败：浏览器存储空间可能已满", "error");
    }
  }

  /* ---------- 6. 事件与生命周期 ---------- */
  function bindEvents() {
    if (els.editBtn) {
      els.editBtn.addEventListener("click", function () {
        if (els.form && els.form.hidden) openEditor();
        else closeEditor();
      });
    }

    if (els.cancelBtn) els.cancelBtn.addEventListener("click", closeEditor);

    if (els.form) els.form.addEventListener("submit", handleSubmit);

    // 表单里按 Esc 关闭
    if (els.form) {
      els.form.addEventListener("keydown", function (event) {
        if (event.key === "Escape") {
          event.preventDefault();
          closeEditor();
        }
      });
    }

    // 任一数据提交后重新渲染（自己保存纪念日、或跨标签页变化都需要刷新天数）
    Store.subscribe(function () {
      renderAll();
    });
  }

  function startTicking() {
    if (tickTimer) global.clearInterval(tickTimer);
    tickTimer = global.setInterval(renderCounter, 1000);

    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) renderCounter();
    });
  }

  function init() {
    cacheElements();
    bindEvents();
    syncFormFromState();
    renderAll();
    startTicking();
  }

  global.LoveTimer = {
    init: init,
    render: renderAll
  };
})(window);
