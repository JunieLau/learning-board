(function () {
  var KEY = "learning-board-local-v1";
  var NOTE_MAX = 2000;
  var FILE_MAX = 500000;
  var board = document.querySelector(".board");
  var stateEl = document.getElementById("save-state");
  var dateBtn = document.getElementById("sort-date");
  var manualBtn = document.getElementById("sort-manual");
  var exportBtn = document.getElementById("export-local");
  var importInput = document.getElementById("import-local");
  if (!board || !stateEl) return;

  var state = { manualOrder: null, notes: {}, view: "date" };
  var canStore = true;
  var drag = null;

  function cards() {
    return Array.prototype.slice.call(board.querySelectorAll("article.card[data-id]"));
  }

  function idsOf(list) {
    return list.map(function (card) { return card.dataset.id; });
  }

  function byPublishedDesc(a, b) {
    return b.dataset.published.localeCompare(a.dataset.published);
  }

  function dateIds() {
    return idsOf(cards().slice().sort(byPublishedDesc));
  }

  function place(ids) {
    var all = cards();
    var map = {};
    all.forEach(function (card) { map[card.dataset.id] = card; });
    var seen = {};
    var frag = document.createDocumentFragment();
    ids.forEach(function (id) {
      if (map[id] && !seen[id]) {
        frag.appendChild(map[id]);
        seen[id] = true;
      }
    });
    all.forEach(function (card) {
      if (!seen[card.dataset.id]) frag.appendChild(card);
    });
    board.appendChild(frag);
  }

  function mergedOrder(manualIds) {
    var all = cards();
    var map = {};
    all.forEach(function (card) { map[card.dataset.id] = card; });
    var saved = (manualIds || []).filter(function (id) { return map[id]; });
    var savedSet = {};
    saved.forEach(function (id) { savedSet[id] = true; });
    var extras = all.filter(function (card) { return !savedSet[card.dataset.id]; }).sort(byPublishedDesc);
    var result = [];
    var extraIndex = 0;
    saved.forEach(function (id) {
      while (extraIndex < extras.length && extras[extraIndex].dataset.published > map[id].dataset.published) {
        result.push(extras[extraIndex].dataset.id);
        extraIndex += 1;
      }
      result.push(id);
    });
    while (extraIndex < extras.length) {
      result.push(extras[extraIndex].dataset.id);
      extraIndex += 1;
    }
    return result;
  }

  function setStatus(text) {
    stateEl.textContent = text;
  }

  function markMode() {
    dateBtn.setAttribute("aria-pressed", state.view === "date" ? "true" : "false");
    manualBtn.setAttribute("aria-pressed", state.view === "manual" ? "true" : "false");
  }

  function persist() {
    var payload = {
      v: 1,
      view: state.view,
      manualOrder: state.manualOrder,
      notes: state.notes
    };
    try {
      localStorage.setItem(KEY, JSON.stringify(payload));
      canStore = true;
      setStatus("已写在这台浏览器。");
      markMode();
      return true;
    } catch (err) {
      canStore = false;
      setStatus("这台浏览器拒绝保存。当前修改在刷新后会丢失。");
      markMode();
      return false;
    }
  }

  function cleanNote(value) {
    if (typeof value !== "string") return null;
    return value.replace(/\u0000/g, "").slice(0, NOTE_MAX);
  }

  function cleanOrder(value) {
    if (!Array.isArray(value)) return null;
    var out = [];
    var seen = {};
    value.forEach(function (id) {
      if (typeof id !== "string" || id.length < 1 || id.length > 80 || seen[id]) return;
      if (!/^[a-z0-9-]+$/.test(id)) return;
      seen[id] = true;
      out.push(id);
    });
    return out;
  }

  function validate(data) {
    if (!data || typeof data !== "object" || Array.isArray(data)) return null;
    if (data.v !== 1) return null;
    var view = data.view === "manual" ? "manual" : "date";
    var manualOrder = data.manualOrder == null ? null : cleanOrder(data.manualOrder);
    if (data.manualOrder != null && !manualOrder) return null;
    var notes = {};
    if (data.notes != null) {
      if (typeof data.notes !== "object" || Array.isArray(data.notes)) return null;
      var keys = Object.keys(data.notes);
      for (var i = 0; i < keys.length; i += 1) {
        var key = keys[i];
        if (key === "__proto__" || key === "constructor" || key === "prototype") return null;
        if (!/^[a-z0-9-]+$/.test(key)) return null;
        var text = cleanNote(data.notes[key]);
        if (text == null) return null;
        if (text) notes[key] = text;
      }
    }
    return { v: 1, view: view, manualOrder: manualOrder, notes: notes };
  }

  function readStorage() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return { empty: true };
      var parsed = JSON.parse(raw);
      var clean = validate(parsed);
      if (!clean) return { corrupt: true };
      return { data: clean };
    } catch (err) {
      if (err && err.name === "SyntaxError") return { corrupt: true };
      return { blocked: true };
    }
  }

  function applyNotes() {
    cards().forEach(function (card) {
      var field = card.querySelector(".note");
      if (!field) return;
      var text = state.notes[card.dataset.id] || "";
      if (field.value !== text) field.value = text;
    });
  }

  function currentOrder() {
    return idsOf(cards());
  }

  function rememberManual() {
    state.view = "manual";
    state.manualOrder = currentOrder();
    persist();
  }

  function moveCard(card, dir) {
    var list = cards();
    var index = list.indexOf(card);
    var next = index + dir;
    if (index < 0 || next < 0 || next >= list.length) return;
    if (dir < 0) board.insertBefore(card, list[next]);
    else board.insertBefore(card, list[next].nextElementSibling);
    rememberManual();
  }

  function onPointerDown(event) {
    if (event.button != null && event.button !== 0) return;
    var handle = event.currentTarget;
    var card = handle.closest("article.card[data-id]");
    if (!card) return;
    drag = {
      card: card,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      active: false
    };
    handle.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (!drag.active) {
      if (Math.abs(event.clientX - drag.x) + Math.abs(event.clientY - drag.y) < 8) return;
      drag.active = true;
      drag.card.classList.add("dragging");
    }
    event.preventDefault();
    var hit = document.elementFromPoint(event.clientX, event.clientY);
    var over = hit && hit.closest ? hit.closest("article.card[data-id]") : null;
    if (!over || over === drag.card) return;
    var rect = over.getBoundingClientRect();
    var dx = event.clientX - (rect.left + rect.width / 2);
    var dy = event.clientY - (rect.top + rect.height / 2);
    var after = Math.abs(dx) > Math.abs(dy) ? dx > 0 : dy > 0;
    if (after) board.insertBefore(drag.card, over.nextElementSibling);
    else board.insertBefore(drag.card, over);
  }

  function endDrag(event) {
    if (!drag || (event && event.pointerId !== drag.pointerId)) return;
    var moved = drag.active;
    drag.card.classList.remove("dragging");
    drag = null;
    if (moved) rememberManual();
  }

  function bindCard(card) {
    var title = card.querySelector("h2");
    var name = title ? title.textContent : card.dataset.id;
    var meta = card.querySelector(".meta");
    var mine = document.createElement("div");
    mine.className = "mine";
    mine.innerHTML =
      '<div class="move">' +
        '<button type="button" class="handle">拖动</button>' +
        '<button type="button" class="step" data-dir="-1">前移</button>' +
        '<button type="button" class="step" data-dir="1">后移</button>' +
      "</div>" +
      '<label class="note-label">我的标注' +
        '<textarea class="note" rows="2" maxlength="2000" autocomplete="off" placeholder="写在这台浏览器里"></textarea>' +
      "</label>";
    meta.appendChild(mine);
    var handle = mine.querySelector(".handle");
    handle.setAttribute("aria-label", "拖动调整「" + name + "」。也可以用方向键。");
    mine.querySelector('[data-dir="-1"]').setAttribute("aria-label", "把「" + name + "」前移");
    mine.querySelector('[data-dir="1"]').setAttribute("aria-label", "把「" + name + "」后移");
    handle.addEventListener("pointerdown", onPointerDown);
    handle.addEventListener("pointermove", onPointerMove, { passive: false });
    handle.addEventListener("pointerup", endDrag);
    handle.addEventListener("pointercancel", endDrag);
    handle.addEventListener("keydown", function (event) {
      if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault();
        moveCard(card, -1);
      } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        event.preventDefault();
        moveCard(card, 1);
      }
    });
    mine.querySelectorAll(".step").forEach(function (button) {
      button.addEventListener("click", function () {
        moveCard(card, Number(button.dataset.dir));
      });
    });
    var field = mine.querySelector(".note");
    function storeNote() {
      var text = cleanNote(field.value) || "";
      if (text) state.notes[card.dataset.id] = text;
      else delete state.notes[card.dataset.id];
      persist();
    }
    field.addEventListener("input", storeNote);
    field.addEventListener("change", storeNote);
  }

  function showDate() {
    state.view = "date";
    place(dateIds());
    if (!persist()) return;
    setStatus("已按从新到旧排列。自己排过的顺序和标注还在。");
  }

  function showManual() {
    if (!state.manualOrder || !state.manualOrder.length) {
      setStatus("还没有自己排过的顺序。");
      markMode();
      return;
    }
    state.view = "manual";
    place(mergedOrder(state.manualOrder));
    if (!persist()) return;
    setStatus("已回到自己排过的顺序。标注还在。");
  }

  function exportBackup() {
    var payload = {
      v: 1,
      view: state.view,
      manualOrder: state.manualOrder,
      notes: state.notes
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = "learning-board-local.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setStatus("已导出这台浏览器里的顺序和标注。");
  }

  function importBackup(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var text = String(reader.result || "");
      if (text.length > FILE_MAX) {
        setStatus("这份备份太大，没有导入。");
        return;
      }
      var clean = null;
      try {
        clean = validate(JSON.parse(text));
      } catch (err) {
        clean = null;
      }
      if (!clean) {
        setStatus("这份备份无法使用，没有导入。");
        return;
      }
      state.view = clean.view;
      state.manualOrder = clean.manualOrder;
      state.notes = clean.notes;
      if (state.view === "manual" && state.manualOrder) place(mergedOrder(state.manualOrder));
      else place(dateIds());
      applyNotes();
      if (!persist()) return;
      setStatus("已用备份覆盖这台浏览器里的顺序和标注。");
    };
    reader.onerror = function () {
      setStatus("这份备份读不出来，没有导入。");
    };
    reader.readAsText(file);
  }

  cards().forEach(bindCard);

  var loaded = readStorage();
  if (loaded.blocked) {
    canStore = false;
    setStatus("这台浏览器不能读取本地保存。标注和顺序在刷新后不会留下。");
  } else if (loaded.corrupt) {
    setStatus("这台浏览器里的记录读不出来。没有覆盖它，先按从新到旧显示。");
  } else if (loaded.data) {
    state.view = loaded.data.view;
    state.manualOrder = loaded.data.manualOrder;
    state.notes = loaded.data.notes;
    if (state.view === "manual" && state.manualOrder) place(mergedOrder(state.manualOrder));
    applyNotes();
    setStatus("已读到这台浏览器里的顺序和标注。");
  } else {
    setStatus("还没有保存在这台浏览器的顺序或标注。");
  }
  markMode();

  window.addEventListener("pagehide", function () {
    persist();
  });

  dateBtn.addEventListener("click", showDate);
  manualBtn.addEventListener("click", showManual);
  exportBtn.addEventListener("click", exportBackup);
  importInput.addEventListener("change", function () {
    var file = importInput.files && importInput.files[0];
    importInput.value = "";
    importBackup(file);
  });
})();
