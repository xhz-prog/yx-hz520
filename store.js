/* ============================================================
   store.js · 本地存储层（唯一的数据入口）
   职责：
     1. 定义数据结构和默认值
     2. 读取 localStorage → 校验/清洗 → 得到可信 state
     3. commit(mutator) 修改数据并整包持久化，成功后通知所有订阅者
     4. 捕获空间不足、隐私模式等异常，向上层抛出可展示的错误
   约定：
     - 业务模块只通过 LoveStore.getState() 读、commit() 写
     - commit 里的 mutator 必须「替换」数组/对象，不要原地 push，
       方便后续做撤销、对比与渲染
   ============================================================ */
(function (global) {
  "use strict";

  var Utils = global.LoveUtils;
  var STORAGE_KEY = "loveSpace.v1";
  var BACKUP_KEY = "loveSpace.v1.backup";
  var SCHEMA_VERSION = 1;

  var MAX_GALLERY = 200;
  var MAX_WISHES = 500;
  var MAX_MESSAGES = 500;

  /* ---------- 1. 默认数据结构 ---------- */
  // 首次打开时的默认情侣信息：改这里即可换掉默认名字 / 纪念日
  var DEFAULT_COUPLE = {
    nameA: "雨欣",
    nameB: "海钊",
    startDate: "2026-07-03"
  };

  function createDefaultState() {
    return {
      version: SCHEMA_VERSION,
      couple: {
        nameA: DEFAULT_COUPLE.nameA,
        nameB: DEFAULT_COUPLE.nameB,
        startDate: DEFAULT_COUPLE.startDate
      },
      gallery: [],
      wishes: [],
      messages: [],
      lastAuthor: ""
    };
  }

  /* ---------- 2. 数据清洗：任何读入的数据都可能是坏的 ---------- */
  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function safeTimestamp(value) {
    var ts = Number(value);
    return isFinite(ts) && ts > 0 ? ts : Date.now();
  }

  function normalizeGalleryItem(raw) {
    if (!isObject(raw)) return null;
    var dataUrl = typeof raw.dataUrl === "string" ? raw.dataUrl : "";
    if (!/^data:image\//i.test(dataUrl)) return null;
    return {
      id: typeof raw.id === "string" && raw.id ? raw.id : Utils.uid("photo"),
      dataUrl: dataUrl,
      name: Utils.cleanText(raw.name, 80) || "未命名照片",
      width: Math.max(0, Number(raw.width) || 0),
      height: Math.max(0, Number(raw.height) || 0),
      createdAt: safeTimestamp(raw.createdAt)
    };
  }

  function normalizeWish(raw, index) {
    if (!isObject(raw)) return null;
    var text = Utils.cleanText(raw.text, 60);
    if (!text) return null;
    var done = raw.done === true;
    return {
      id: typeof raw.id === "string" && raw.id ? raw.id : Utils.uid("wish"),
      text: text,
      done: done,
      createdAt: safeTimestamp(raw.createdAt),
      doneAt: done ? safeTimestamp(raw.doneAt) : 0,
      order: index
    };
  }

  function normalizeMessage(raw) {
    if (!isObject(raw)) return null;
    var text = Utils.cleanText(raw.text, 200, true);
    if (!text) return null;
    // 兼容旧字段名 name，统一输出 author 供留言板使用
    var author = Utils.cleanText(raw.author || raw.name, 12) || "我";
    return {
      id: typeof raw.id === "string" && raw.id ? raw.id : Utils.uid("msg"),
      author: author,
      text: text,
      createdAt: safeTimestamp(raw.createdAt)
    };
  }

  /**
   * 把任意来源的数据整理成合法 state
   * @param {*} raw JSON.parse 的结果
   * @returns {object} 合法的 state
   */
  function sanitizeState(raw) {
    var defaults = createDefaultState();
    if (!isObject(raw)) return defaults;

    var state = createDefaultState();
    state.version = SCHEMA_VERSION;

    if (isObject(raw.couple)) {
      state.couple = {
        nameA: Utils.cleanText(raw.couple.nameA, 12) || DEFAULT_COUPLE.nameA,
        nameB: Utils.cleanText(raw.couple.nameB, 12) || DEFAULT_COUPLE.nameB,
        startDate: Utils.parseISODate(raw.couple.startDate)
          ? raw.couple.startDate
          : DEFAULT_COUPLE.startDate
      };
    }

    state.gallery = Array.isArray(raw.gallery)
      ? raw.gallery
          .slice(0, MAX_GALLERY)
          .map(normalizeGalleryItem)
          .filter(Boolean)
      : [];

    state.wishes = Array.isArray(raw.wishes)
      ? raw.wishes
          .slice(0, MAX_WISHES)
          .map(normalizeWish)
          .filter(Boolean)
      : [];

    state.messages = Array.isArray(raw.messages)
      ? raw.messages
          .slice(0, MAX_MESSAGES)
          .map(normalizeMessage)
          .filter(Boolean)
      : [];

    state.lastAuthor = Utils.cleanText(raw.lastAuthor, 12) || "";
    return state;
  }

  /* ---------- 3. 内部状态 ---------- */
  var state = createDefaultState();
  var listeners = [];
  var lastError = null;
  var storageAvailable = true;
  var loadWarning = "";

  function notify(payload) {
    listeners.slice().forEach(function (fn) {
      try {
        fn(payload);
      } catch (error) {
        // 单个订阅者报错不影响其他模块渲染
        if (global.console) console.error("[LoveStore] 订阅者执行失败：", error);
      }
    });
  }

  /** 检测 localStorage 是否可用（隐私模式 / 被禁用时会抛错） */
  function detectStorage() {
    try {
      var probe = "__love_space_probe__";
      global.localStorage.setItem(probe, "1");
      global.localStorage.removeItem(probe);
      storageAvailable = true;
    } catch (error) {
      storageAvailable = false;
      lastError = error;
    }
  }

  /* ---------- 4. 读取 ---------- */
  function load() {
    detectStorage();
    loadWarning = "";

    if (!storageAvailable) {
      state = createDefaultState();
      loadWarning = "当前浏览器不允许使用本地存储，内容只在本次打开期间有效。";
      return state;
    }

    var raw = null;
    try {
      raw = global.localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      lastError = error;
      state = createDefaultState();
      return state;
    }

    if (!raw) {
      state = createDefaultState();
      return state;
    }

    try {
      state = sanitizeState(JSON.parse(raw));
    } catch (error) {
      // 数据损坏：先备份原始字符串，尽量不静默丢掉用户数据
      try {
        global.localStorage.setItem(BACKUP_KEY, raw);
      } catch (backupError) {
        /* 备份失败也不阻塞启动 */
      }
      state = createDefaultState();
      loadWarning = "旧数据读取失败，已备份到浏览器里，页面以全新状态启动。";
    }

    return state;
  }

  /* ---------- 5. 写入 ---------- */
  function persist() {
    if (!storageAvailable) {
      lastError = new Error("当前浏览器不支持本地存储");
      return false;
    }
    try {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      lastError = null;
      return true;
    } catch (error) {
      lastError = error;
      return false;
    }
  }

  /** 浅拷贝一份状态：数组按引用复制、couple 逐字段复制，足够用于失败回滚 */
  function snapshotState() {
    return {
      version: state.version,
      couple: {
        nameA: state.couple.nameA,
        nameB: state.couple.nameB,
        startDate: state.couple.startDate
      },
      gallery: state.gallery.slice(),
      wishes: state.wishes.slice(),
      messages: state.messages.slice(),
      lastAuthor: state.lastAuthor
    };
  }

  /**
   * 修改并保存数据
   * 写入 localStorage 失败（最常见是容量不足）时会立刻回滚内存状态，
   * 保证「界面上的内容」和「真正存下来的内容」永远一致。
   * @param {(state:object)=>void} mutator 修改函数，必须替换数组/对象而不是原地 push
   * @param {{silent?:boolean}} options
   * @returns {boolean} 是否成功写入 localStorage
   */
  function commit(mutator, options) {
    var backup = snapshotState();

    if (typeof mutator === "function") {
      try {
        mutator(state);
      } catch (error) {
        state = backup;
        if (global.console) console.error("[LoveStore] 数据修改失败：", error);
        return false;
      }
    }

    var ok = persist();
    if (!ok) {
      // 保存失败：回滚，避免出现「页面显示成功、刷新就消失」的假保存
      state = backup;
    }

    var payload = {
      ok: ok,
      error: ok ? null : lastError,
      quotaExceeded: !ok && isQuotaError(lastError),
      silent: !!(options && options.silent)
    };
    notify(payload);
    return ok;
  }

  function isQuotaError(error) {
    if (!error) return false;
    return (
      error.name === "QuotaExceededError" ||
      error.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
      error.code === 22 ||
      error.code === 1014
    );
  }

  function subscribe(fn) {
    if (typeof fn !== "function") return function () {};
    listeners.push(fn);
    return function unsubscribe() {
      var index = listeners.indexOf(fn);
      if (index >= 0) listeners.splice(index, 1);
    };
  }

  function getState() {
    return state;
  }

  function getLastError() {
    return lastError;
  }

  function isQuotaExceeded() {
    return isQuotaError(lastError);
  }

  function getLoadWarning() {
    return loadWarning;
  }

  /** 当前数据大约占用多少字符（1 个字符≈2 字节），用于容量提示 */
  function estimateSize() {
    try {
      return JSON.stringify(state).length;
    } catch (error) {
      return 0;
    }
  }

  /** 监听其他标签页的修改，保持数据同步（同一浏览器多开时生效） */
  function bindStorageSync() {
    if (typeof global.addEventListener !== "function") return;
    global.addEventListener("storage", function (event) {
      if (event.key !== STORAGE_KEY || !event.newValue) return;
      try {
        state = sanitizeState(JSON.parse(event.newValue));
        lastError = null;
        notify({ ok: true, error: null, quotaExceeded: false, external: true });
      } catch (error) {
        /* 其他标签页写入异常数据时保持当前状态 */
      }
    });
  }

  /* ---------- 6. 导出接口 ---------- */
  global.LoveStore = {
    STORAGE_KEY: STORAGE_KEY,
    getState: getState,
    load: load,
    commit: commit,
    subscribe: subscribe,
    getLastError: getLastError,
    isQuotaExceeded: isQuotaExceeded,
    getLoadWarning: getLoadWarning,
    estimateSize: estimateSize,
    bindStorageSync: bindStorageSync,
    isStorageAvailable: function () {
      return storageAvailable;
    }
  };
})(window);
