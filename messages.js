/* ============================================================
   messages.js · 留言板模块
   职责：
     1. 写留言（落款 + 内容，做长度与空值过滤）
     2. 留言按时间倒序展示，自动记录上次落款
     3. 删除留言（带柔和退场动画）
   依赖：LoveUtils、LoveStore
   数据结构：state.messages = [{ id, author, text, createdAt }]
   ============================================================ */
(function (global) {
  "use strict";

  var Utils = global.LoveUtils;
  var Store = global.LoveStore;

  var MAX_MESSAGES = 500;
  var NAME_MAX = 12;
  var TEXT_MAX = 200;
  var REMOVE_DELAY = 280;

  var els = {};
  var busyId = null;

  /* ---------- 1. 元素缓存 ---------- */
  function cacheElements() {
    els.form = document.getElementById("messageForm");
    els.name = document.getElementById("messageName");
    els.text = document.getElementById("messageText");
    els.counter = document.getElementById("messageCounter");
    els.list = document.getElementById("messageList");
    els.empty = document.getElementById("messageEmpty");
    els.countPill = document.getElementById("messageCountPill");
  }

  /* ---------- 2. 渲染 ---------- */
  function getMessages() {
    return Store.getState().messages;
  }

  function createMessageCard(message) {
    var card = document.createElement("article");
    card.className = "message-card";
    card.dataset.messageId = message.id;

    var text = document.createElement("p");
    text.className = "message-card__text";
    text.textContent = message.text;
    card.appendChild(text);

    var footer = document.createElement("footer");
    footer.className = "message-card__footer";

    var author = document.createElement("span");
    author.className = "message-card__author";

    var avatar = document.createElement("span");
    avatar.className = "message-card__avatar";
    avatar.setAttribute("aria-hidden", "true");
    avatar.textContent = (message.author || "我").slice(0, 1);
    author.appendChild(avatar);

    var name = document.createElement("span");
    name.className = "message-card__name";
    name.textContent = message.author || "我";
    author.appendChild(name);

    footer.appendChild(author);

    var right = document.createElement("div");
    right.className = "message-card__meta";

    var time = document.createElement("time");
    time.className = "message-card__time";
    time.dateTime = new Date(message.createdAt).toISOString();
    time.textContent = Utils.formatMessageTime(message.createdAt);
    right.appendChild(time);

    var remove = document.createElement("button");
    remove.className = "message-card__delete";
    remove.type = "button";
    remove.dataset.messageDelete = message.id;
    remove.setAttribute("aria-label", "删除这条留言");
    remove.textContent = "×";
    right.appendChild(remove);

    footer.appendChild(right);
    card.appendChild(footer);

    return card;
  }

  function render() {
    var messages = getMessages().slice().sort(function (a, b) {
      return b.createdAt - a.createdAt;
    });

    if (els.list) {
      var fragment = document.createDocumentFragment();
      messages.forEach(function (message, index) {
        var card = createMessageCard(message);
        card.style.setProperty("--reveal-delay", Math.min(index, 8) * 40 + "ms");
        fragment.appendChild(card);
      });
      els.list.textContent = "";
      els.list.appendChild(fragment);
    }

    if (els.empty) els.empty.hidden = messages.length > 0;
    if (els.countPill) els.countPill.textContent = messages.length + " 条留言";
  }

  /* ---------- 3. 新增 / 删除 ---------- */
  function addMessage() {
    var name = Utils.cleanText(els.name ? els.name.value : "", NAME_MAX);
    var text = Utils.cleanText(els.text ? els.text.value : "", TEXT_MAX, true);

    if (!text) {
      Utils.toast("留言内容还没写呢", "error");
      if (els.text) els.text.focus();
      return false;
    }

    if (getMessages().length >= MAX_MESSAGES) {
      Utils.toast("留言已满（最多 " + MAX_MESSAGES + " 条）", "error");
      return false;
    }

    var author = name || (Store.getState().lastAuthor || "我");

    var message = {
      id: Utils.uid("msg"),
      author: author,
      text: text,
      createdAt: Date.now()
    };

    var ok = Store.commit(function (state) {
      state.messages = [message].concat(state.messages);
      state.lastAuthor = author;
    });

    if (!ok) {
      Utils.toast("保存失败，请检查浏览器存储空间", "error");
      return false;
    }

    Utils.toast("留言已寄出", "success");
    return true;
  }

  function removeMessage(id, cardEl) {
    if (busyId) return;
    busyId = id;

    function remove() {
      var ok = Store.commit(function (state) {
        state.messages = state.messages.filter(function (message) {
          return message.id !== id;
        });
      });
      busyId = null;
      if (ok) Utils.toast("已删除这条留言", "success");
      else Utils.toast("删除失败，请稍后重试", "error");
    }

    if (cardEl) {
      cardEl.classList.add("is-removing");
      global.setTimeout(remove, REMOVE_DELAY);
    } else {
      remove();
    }
  }

  /* ---------- 4. 输入辅助 ---------- */
  function updateCounter() {
    if (!els.counter || !els.text) return;
    var length = els.text.value.length;
    els.counter.textContent = length + " / " + TEXT_MAX;
    els.counter.classList.toggle("is-near-limit", length >= TEXT_MAX - 20);
  }

  /* ---------- 5. 事件绑定 ---------- */
  function bindEvents() {
    if (els.form) {
      els.form.addEventListener("submit", function (event) {
        event.preventDefault();
        if (!addMessage()) return;

        if (els.text) {
          els.text.value = "";
          els.text.focus();
        }
        if (els.name) els.name.value = Store.getState().lastAuthor || "我";
        updateCounter();
      });
    }

    if (els.text) {
      els.text.addEventListener("input", updateCounter);
    }

    if (els.list) {
      els.list.addEventListener("click", function (event) {
        var remove = event.target.closest("[data-message-delete]");
        if (!remove) return;
        removeMessage(remove.dataset.messageDelete, remove.closest(".message-card"));
      });
    }

    Store.subscribe(function () {
      render();
    });
  }

  /* ---------- 6. 初始化 ---------- */
  function init() {
    cacheElements();

    // 回填上次落款，省去重复输入
    var lastAuthor = Store.getState().lastAuthor;
    if (els.name && lastAuthor) els.name.value = lastAuthor;

    bindEvents();
    render();
    updateCounter();
  }

  global.LoveMessages = {
    init: init,
    render: render
  };
})(window);
