/* ============================================================
   utils.js · 通用工具模块
   职责：DOM 查询、文本清洗、日期格式化、图片压缩、轻提示
   约定：不直接读写业务数据，也不操作业务 DOM，只提供纯函数能力
   ============================================================ */
(function (global) {
  "use strict";

  /* ---------- 1. DOM 快捷方法 ---------- */
  function $(selector, root) {
    return (root || document).querySelector(selector);
  }

  function $$(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  /* ---------- 2. 通用小工具 ---------- */
  var idSeed = 0;

  /** 生成稳定唯一 id：时间戳 + 自增序号，刷新后也不会重复 */
  function uid(prefix) {
    idSeed += 1;
    return (prefix || "id") + "-" + Date.now().toString(36) + "-" + idSeed.toString(36);
  }

  /** 限制数值范围 */
  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  /** 转义 HTML，仅在不得不使用 innerHTML 时使用 */
  function escapeHTML(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /**
   * 输入清洗（所有用户输入都必须经过这里）
   * - 去首尾空白、合并多余空行
   * - 去控制字符
   * - 按字符数截断（Array.from 保证 emoji 不被截半）
   */
  function cleanText(value, maxLength, allowMultiline) {
    if (value === null || value === undefined) return "";
    var text = String(value).replace(/\u0000/g, "").replace(/\r\n?/g, "\n");
    text = allowMultiline
      ? text.replace(/[^\S\n]+/g, " ").replace(/\n{3,}/g, "\n\n")
      : text.replace(/\s+/g, " ");
    text = text.trim();
    if (maxLength && maxLength > 0) {
      var chars = Array.from(text);
      if (chars.length > maxLength) text = chars.slice(0, maxLength).join("");
    }
    return text;
  }

  function debounce(fn, wait) {
    var timer = null;
    return function () {
      var args = arguments;
      var context = this;
      clearTimeout(timer);
      timer = setTimeout(function () {
        fn.apply(context, args);
      }, wait);
    };
  }

  /* ---------- 3. 日期工具（全部使用本地时区，避免跨时区偏移） ---------- */
  function pad2(n) {
    return n < 10 ? "0" + n : String(n);
  }

  /** Date -> 'YYYY-MM-DD' */
  function toISODate(date) {
    return date.getFullYear() + "-" + pad2(date.getMonth() + 1) + "-" + pad2(date.getDate());
  }

  /** 'YYYY-MM-DD' -> 当天 00:00 的 Date；非法返回 null */
  function parseISODate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    var parts = value.split("-").map(Number);
    var date = new Date(parts[0], parts[1] - 1, parts[2]);
    if (
      date.getFullYear() !== parts[0] ||
      date.getMonth() !== parts[1] - 1 ||
      date.getDate() !== parts[2]
    ) {
      return null;
    }
    return date;
  }

  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  /** 'YYYY.MM.DD'，用于纪念日展示 */
  function formatDotDate(date) {
    return date.getFullYear() + "." + pad2(date.getMonth() + 1) + "." + pad2(date.getDate());
  }

  /** '2024 年 5 月 20 日' */
  function formatChineseDate(date) {
    return date.getFullYear() + " 年 " + (date.getMonth() + 1) + " 月 " + date.getDate() + " 日";
  }

  /** 留言时间：今天 / 昨天 / 具体日期 + 时分 */
  function formatMessageTime(timestamp) {
    var date = new Date(timestamp);
    if (!isFinite(date.getTime())) return "";
    var now = new Date();
    var today = startOfDay(now);
    var target = startOfDay(date);
    var diffDays = Math.round((today - target) / 86400000);
    var time = pad2(date.getHours()) + ":" + pad2(date.getMinutes());

    if (diffDays === 0) return "今天 " + time;
    if (diffDays === 1) return "昨天 " + time;
    if (date.getFullYear() === now.getFullYear()) {
      return date.getMonth() + 1 + " 月 " + date.getDate() + " 日 " + time;
    }
    return date.getFullYear() + " 年 " + (date.getMonth() + 1) + " 月 " + date.getDate() + " 日";
  }

  /** 两天之间的整天差（按本地零点计算） */
  function diffInDays(fromDate, toDate) {
    return Math.round((startOfDay(toDate) - startOfDay(fromDate)) / 86400000);
  }

  function prefersReducedMotion() {
    return (
      typeof global.matchMedia === "function" &&
      global.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }

  /* ---------- 4. 图片处理：读取 + 压缩 ---------- */

  /** 读取图片文件为可绘制对象（优先 createImageBitmap，失败回退 <img>） */
  function loadDrawable(file) {
    return new Promise(function (resolve, reject) {
      var fallback = function () {
        var url = URL.createObjectURL(file);
        var img = new Image();
        img.onload = function () {
          URL.revokeObjectURL(url);
          resolve(img);
        };
        img.onerror = function () {
          URL.revokeObjectURL(url);
          reject(new Error("图片读取失败"));
        };
        img.src = url;
      };

      if (typeof createImageBitmap === "function") {
        createImageBitmap(file).then(resolve).catch(fallback);
      } else {
        fallback();
      }
    });
  }

  /** base64 字符串的近似字节数 */
  function estimateBytes(dataUrl) {
    return Math.ceil((dataUrl.length * 3) / 4);
  }

  /**
   * 压缩图片为 JPEG dataURL（用于 localStorage 存储）
   * 策略：先按最大边 1280 + 质量 0.82；若仍偏大，逐级降尺寸/质量。
   * @param {File} file
   * @param {{maxEdge?:number, quality?:number, targetBytes?:number}} options
   * @returns {Promise<{dataUrl:string, width:number, height:number, bytes:number}>}
   */
  function compressImage(file, options) {
    var opts = Object.assign(
      { maxEdge: 1280, quality: 0.82, targetBytes: 280 * 1024, minEdge: 720 },
      options || {}
    );

    return loadDrawable(file).then(function (source) {
      var sourceWidth = source.width || source.naturalWidth;
      var sourceHeight = source.height || source.naturalHeight;
      if (!sourceWidth || !sourceHeight) throw new Error("图片尺寸异常");

      var attempts = [
        { edge: opts.maxEdge, quality: opts.quality },
        { edge: Math.round(opts.maxEdge * 0.8), quality: 0.72 },
        { edge: opts.minEdge, quality: 0.66 }
      ];

      var best = null;
      attempts.forEach(function (attempt) {
        if (best && best.bytes <= opts.targetBytes) return;
        var scale = Math.min(1, attempt.edge / Math.max(sourceWidth, sourceHeight));
        var width = Math.max(1, Math.round(sourceWidth * scale));
        var height = Math.max(1, Math.round(sourceHeight * scale));
        var canvas = document.createElement("canvas");
        var ctx = null;
        try {
          canvas.width = width;
          canvas.height = height;
          ctx = canvas.getContext("2d");
          if (!ctx) return;
          // PNG 透明背景统一铺白，避免转 JPEG 后出现黑底
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, width, height);
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(source, 0, 0, width, height);

          var dataUrl = canvas.toDataURL("image/jpeg", attempt.quality);
          // 画布过大/内存不足时 toDataURL 可能返回 "data:," 而不抛错，
          // 这种「空图」必须当作失败处理，否则会存进 localStorage 后刷新即消失
          if (
            typeof dataUrl !== "string" ||
            dataUrl.indexOf("data:image/") !== 0 ||
            dataUrl.length < 1024
          ) {
            return;
          }
          var bytes = estimateBytes(dataUrl);
          if (!best || bytes < best.bytes) {
            best = { dataUrl: dataUrl, width: width, height: height, bytes: bytes };
          }
        } finally {
          // 释放画布内存（即使 toDataURL 抛错也要执行）
          canvas.width = 0;
          canvas.height = 0;
        }
      });

      if (source.close) source.close();
      if (!best) throw new Error("图片压缩失败");
      return best;
    });
  }

  /** 判断是否图片文件（部分系统 MIME 为空，退回后缀判断） */
  function isImageFile(file) {
    if (!file) return false;
    if (file.type && /^image\//i.test(file.type)) return true;
    return /\.(jpe?g|png|webp|gif|bmp|avif|heic|heif)$/i.test(file.name || "");
  }

  /* ---------- 5. 轻提示 toast ---------- */
  /**
   * @param {string} message 文案
   * @param {'success'|'error'|''} type 类型（影响左侧圆点颜色）
   */
  function toast(message, type) {
    var stack = document.getElementById("toastStack");
    if (!stack || !message) return;

    var el = document.createElement("div");
    el.className = "toast" + (type ? " toast--" + type : "");
    el.textContent = message;
    stack.appendChild(el);

    while (stack.children.length > 3) {
      stack.removeChild(stack.firstElementChild);
    }

    var dismiss = function () {
      if (!el.parentNode) return;
      el.classList.add("is-leaving");
      el.addEventListener(
        "animationend",
        function () {
          if (el.parentNode) el.parentNode.removeChild(el);
        },
        { once: true }
      );
      // 兜底：动画被系统关闭时也能移除
      global.setTimeout(function () {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 400);
    };

    // 每条 toast 使用自己的定时器，多条同时存在时互不取消
    global.setTimeout(dismiss, 3200);
  }

  /* ---------- 6. 导出工具命名空间 ---------- */
  global.LoveUtils = {
    $: $,
    $$: $$,
    uid: uid,
    clamp: clamp,
    escapeHTML: escapeHTML,
    cleanText: cleanText,
    debounce: debounce,
    toISODate: toISODate,
    parseISODate: parseISODate,
    startOfDay: startOfDay,
    formatDotDate: formatDotDate,
    formatChineseDate: formatChineseDate,
    formatMessageTime: formatMessageTime,
    diffInDays: diffInDays,
    prefersReducedMotion: prefersReducedMotion,
    compressImage: compressImage,
    estimateBytes: estimateBytes,
    isImageFile: isImageFile,
    toast: toast
  };
})(window);
