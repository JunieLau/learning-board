(function () {
  var KEY = "learning-board-freeform-v1";
  var OLD_KEY = "learning-board-local-v1";
  var NOTE_MAX = 2000;
  var FILE_MAX = 500000;
  var CARD_W = 280;
  var GAP = 28;
  var board = document.querySelector(".board");
  var stage = document.getElementById("stage");
  var world = document.getElementById("world");
  var stateEl = document.getElementById("save-state");
  if (!board || !stage || !world || !stateEl) return;

  var state = {
    positions: {},
    notes: {},
    camera: { x: 36, y: 28, z: 1 }
  };
  var canStore = true;
  var selected = null;
  var zTop = 2;
  var autoPlaced = false;
  var pointers = new Map();
  var pinch = null;

  function cards() {
    return Array.prototype.slice.call(board.querySelectorAll("article.card"));
  }

  function works() {
    return cards().filter(function (card) { return card.dataset.published; });
  }

  function byPublishedDesc(a, b) {
    return b.dataset.published.localeCompare(a.dataset.published);
  }

  function setStatus(text) {
    stateEl.textContent = text;
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function cleanNote(value) {
    if (typeof value !== "string") return null;
    return value.replace(/\u0000/g, "").slice(0, NOTE_MAX);
  }

  function finite(n, min, max) {
    return typeof n === "number" && isFinite(n) && n >= min && n <= max;
  }

  function cleanPositions(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    var out = {};
    var keys = Object.keys(value);
    for (var i = 0; i < keys.length; i += 1) {
      var key = keys[i];
      if (key === "__proto__" || key === "constructor" || key === "prototype") return null;
      if (!/^[a-z0-9-]+$/.test(key)) return null;
      var pos = value[key];
      if (!pos || !finite(pos.x, -20000, 20000) || !finite(pos.y, -20000, 20000)) return null;
      out[key] = { x: pos.x, y: pos.y };
    }
    return out;
  }

  function cleanNotes(value) {
    if (value == null) return {};
    if (typeof value !== "object" || Array.isArray(value)) return null;
    var notes = {};
    var keys = Object.keys(value);
    for (var i = 0; i < keys.length; i += 1) {
      var key = keys[i];
      if (key === "__proto__" || key === "constructor" || key === "prototype") return null;
      if (!/^[a-z0-9-]+$/.test(key)) return null;
      var text = cleanNote(value[key]);
      if (text == null) return null;
      if (text) notes[key] = text;
    }
    return notes;
  }

  function cleanOrder(value) {
    if (!Array.isArray(value)) return null;
    var out = [];
    var seen = {};
    value.forEach(function (id) {
      if (typeof id !== "string" || !/^[a-z0-9-]+$/.test(id) || seen[id]) return;
      seen[id] = true;
      out.push(id);
    });
    return out;
  }

  function cleanCamera(value) {
    if (!value || typeof value !== "object") return { x: 36, y: 28, z: 1 };
    if (!finite(value.x, -20000, 20000) || !finite(value.y, -20000, 20000) || !finite(value.z, 0.25, 2.5)) {
      return null;
    }
    return { x: value.x, y: value.y, z: value.z };
  }

  function validate(data) {
    if (!data || typeof data !== "object" || Array.isArray(data) || data.v !== 1) return null;
    var notes = cleanNotes(data.notes);
    if (!notes) return null;
    var positions = data.positions == null ? null : cleanPositions(data.positions);
    if (data.positions != null && !positions) return null;
    var camera = data.camera == null ? { x: 36, y: 28, z: 1 } : cleanCamera(data.camera);
    if (!camera) return null;
    var manualOrder = data.manualOrder == null ? null : cleanOrder(data.manualOrder);
    if (data.manualOrder != null && !manualOrder) return null;
    return { v: 1, positions: positions, notes: notes, camera: camera, manualOrder: manualOrder };
  }

  function readKey(key) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return { empty: true };
      var clean = validate(JSON.parse(raw));
      if (!clean) return { corrupt: true };
      return { data: clean };
    } catch (err) {
      if (err && err.name === "SyntaxError") return { corrupt: true };
      return { blocked: true };
    }
  }

  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        v: 1,
        positions: state.positions,
        notes: state.notes,
        camera: state.camera
      }));
      canStore = true;
      setStatus("已写在这台浏览器。还不会同步到其他设备。");
      return true;
    } catch (err) {
      canStore = false;
      setStatus("这台浏览器拒绝保存。当前修改在刷新后会丢失。还不会同步到其他设备。");
      return false;
    }
  }

  function applyCamera() {
    world.style.transform = "translate(" + state.camera.x + "px," + state.camera.y + "px) scale(" + state.camera.z + ")";
  }

  function applyPosition(card) {
    var pos = state.positions[card.dataset.id];
    if (!pos) return;
    card.style.left = pos.x + "px";
    card.style.top = pos.y + "px";
  }

  function raise(card) {
    zTop += 1;
    card.style.zIndex = String(zTop);
  }

  function select(card) {
    if (selected) selected.classList.remove("is-selected");
    selected = card;
    if (card) {
      card.classList.add("is-selected");
      raise(card);
    }
  }

  function arrange(list) {
    var x = 48;
    var y = 48;
    var rowH = 0;
    var maxW = 1560;
    list.forEach(function (card) {
      if (x > 48 && x + CARD_W > maxW) {
        x = 48;
        y += rowH + GAP;
        rowH = 0;
      }
      state.positions[card.dataset.id] = { x: x, y: y };
      applyPosition(card);
      rowH = Math.max(rowH, card.offsetHeight || 360);
      x += CARD_W + GAP;
    });
  }

  function dateList() {
    var intro = board.querySelector(".intro");
    return [intro].concat(works().slice().sort(byPublishedDesc));
  }

  function listFromOrder(ids) {
    var map = {};
    cards().forEach(function (card) { map[card.dataset.id] = card; });
    var seen = {};
    var list = [];
    (ids || []).forEach(function (id) {
      if (map[id] && !seen[id]) {
        list.push(map[id]);
        seen[id] = true;
      }
    });
    dateList().forEach(function (card) {
      if (!seen[card.dataset.id]) list.push(card);
    });
    return list;
  }

  function placeMissing() {
    var missing = cards().filter(function (card) { return !state.positions[card.dataset.id]; });
    if (!missing.length) return;
    var maxX = 48;
    var maxY = 48;
    cards().forEach(function (card) {
      var pos = state.positions[card.dataset.id];
      if (!pos) return;
      maxX = Math.max(maxX, pos.x + CARD_W + GAP);
      maxY = Math.max(maxY, pos.y);
    });
    missing.forEach(function (card, index) {
      state.positions[card.dataset.id] = { x: 48 + (index % 4) * (CARD_W + GAP), y: maxY + 420 };
      applyPosition(card);
    });
  }

  function fit() {
    var list = cards();
    if (!list.length) return;
    var minX = Infinity;
    var minY = Infinity;
    var maxX = -Infinity;
    var maxY = -Infinity;
    list.forEach(function (card) {
      var pos = state.positions[card.dataset.id];
      if (!pos) return;
      minX = Math.min(minX, pos.x);
      minY = Math.min(minY, pos.y);
      maxX = Math.max(maxX, pos.x + card.offsetWidth);
      maxY = Math.max(maxY, pos.y + card.offsetHeight);
    });
    var pad = 36;
    var sw = stage.clientWidth;
    var sh = stage.clientHeight;
    var z = Math.min(sw / (maxX - minX + pad * 2), sh / (maxY - minY + pad * 2), 1);
    z = clamp(z, 0.25, 1.4);
    state.camera.z = z;
    state.camera.x = (sw - (maxX - minX) * z) / 2 - minX * z;
    state.camera.y = pad - minY * z;
    applyCamera();
  }

  function zoomAt(clientX, clientY, factor) {
    var rect = stage.getBoundingClientRect();
    var px = clientX - rect.left;
    var py = clientY - rect.top;
    var next = clamp(state.camera.z * factor, 0.25, 2.5);
    var worldX = (px - state.camera.x) / state.camera.z;
    var worldY = (py - state.camera.y) / state.camera.z;
    state.camera.z = next;
    state.camera.x = px - worldX * next;
    state.camera.y = py - worldY * next;
    applyCamera();
  }

  function bindNotes(card) {
    if (!card.dataset.published) return;
    var title = card.querySelector("h2");
    var name = title ? title.textContent : card.dataset.id;
    var meta = card.querySelector(".meta");
    var mine = document.createElement("div");
    mine.className = "mine";
    var label = document.createElement("label");
    label.className = "note-label";
    label.textContent = "我的标注";
    var field = document.createElement("textarea");
    field.className = "note";
    field.rows = 2;
    field.maxLength = NOTE_MAX;
    field.autocomplete = "off";
    field.placeholder = "写在这台浏览器里";
    field.setAttribute("aria-label", "给「" + name + "」写标注，只留在这台浏览器");
    label.appendChild(field);
    mine.appendChild(label);
    meta.appendChild(mine);
    function storeNote() {
      var text = cleanNote(field.value) || "";
      if (text) state.notes[card.dataset.id] = text;
      else delete state.notes[card.dataset.id];
      persist();
    }
    field.addEventListener("input", storeNote);
    field.addEventListener("change", storeNote);
  }

  function applyNotes() {
    cards().forEach(function (card) {
      var field = card.querySelector(".note");
      if (!field) return;
      var text = state.notes[card.dataset.id] || "";
      if (field.value !== text) field.value = text;
    });
  }

  function pointerRecord(event) {
    return pointers.get(event.pointerId);
  }

  function onPointerDown(event) {
    if (event.button != null && event.button !== 0) return;
    if (event.target.closest && event.target.closest("a, button, textarea, input, label")) return;
    var card = event.target.closest ? event.target.closest("article.card") : null;
    pointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
      card: card,
      moved: false
    });
    if (card) {
      select(card);
      card.classList.add("is-lifting");
    } else {
      stage.classList.add("is-panning");
    }
    if (pointers.size === 2) pinch = null;
    try { stage.setPointerCapture(event.pointerId); } catch (err) {}
  }

  function onPointerMove(event) {
    var rec = pointerRecord(event);
    if (!rec) return;
    if (pointers.size >= 2) {
      rec.x = event.clientX;
      rec.y = event.clientY;
      event.preventDefault();
      movePinch();
      return;
    }
    var dx = event.clientX - rec.x;
    var dy = event.clientY - rec.y;
    if (!rec.moved && Math.abs(dx) + Math.abs(dy) < 5) return;
    rec.moved = true;
    rec.x = event.clientX;
    rec.y = event.clientY;
    event.preventDefault();
    if (rec.card) {
      var pos = state.positions[rec.card.dataset.id];
      if (!pos) pos = state.positions[rec.card.dataset.id] = { x: 0, y: 0 };
      pos.x += dx / state.camera.z;
      pos.y += dy / state.camera.z;
      applyPosition(rec.card);
    } else {
      state.camera.x += dx;
      state.camera.y += dy;
      applyCamera();
    }
  }

  function movePinch() {
    var pts = Array.from(pointers.values());
    if (pts.length < 2) return;
    var dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    var cx = (pts[0].x + pts[1].x) / 2;
    var cy = (pts[0].y + pts[1].y) / 2;
    if (!pinch || dist < 1) {
      pinch = { dist: Math.max(dist, 1), cx: cx, cy: cy };
      return;
    }
    zoomAt(cx, cy, dist / pinch.dist);
    state.camera.x += cx - pinch.cx;
    state.camera.y += cy - pinch.cy;
    applyCamera();
    pinch = { dist: dist, cx: cx, cy: cy };
  }

  function onPointerUp(event) {
    var rec = pointerRecord(event);
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinch = null;
    if (!rec) return;
    if (rec.card) rec.card.classList.remove("is-lifting");
    if (!pointers.size) stage.classList.remove("is-panning");
    if (rec.moved) {
      autoPlaced = false;
      persist();
    }
  }

  function onWheel(event) {
    event.preventDefault();
    var factor = event.deltaY < 0 ? 1.08 : 1 / 1.08;
    zoomAt(event.clientX, event.clientY, factor);
    persist();
  }

  function onKey(event) {
    var tag = event.target && event.target.tagName;
    if (tag === "TEXTAREA" || tag === "INPUT") return;
    if (!selected) return;
    var step = event.shiftKey ? 40 : 12;
    var pos = state.positions[selected.dataset.id];
    if (!pos) return;
    if (event.key === "ArrowLeft") pos.x -= step;
    else if (event.key === "ArrowRight") pos.x += step;
    else if (event.key === "ArrowUp") pos.y -= step;
    else if (event.key === "ArrowDown") pos.y += step;
    else return;
    event.preventDefault();
    applyPosition(selected);
    persist();
  }

  function arrangeByDate() {
    arrange(dateList());
    fit();
    if (!persist()) return;
    setStatus("已按发布日期排开。标注还在。这次会换掉之前摆放的位置。还不会同步到其他设备。");
  }

  function exportBackup() {
    var blob = new Blob([JSON.stringify({
      v: 1,
      positions: state.positions,
      notes: state.notes,
      camera: state.camera
    }, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = "learning-board-freeform.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setStatus("已导出这台浏览器里的位置和标注。这不是跨设备同步。");
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
      try { clean = validate(JSON.parse(text)); } catch (err) { clean = null; }
      if (!clean) {
        setStatus("这份备份无法使用，没有导入。");
        return;
      }
      state.notes = clean.notes;
      state.camera = clean.camera;
      if (clean.positions) {
        state.positions = clean.positions;
        placeMissing();
        cards().forEach(applyPosition);
      } else if (clean.manualOrder) {
        arrange(listFromOrder(clean.manualOrder));
      }
      applyNotes();
      applyCamera();
      if (!persist()) return;
      setStatus("已用备份覆盖这台浏览器里的位置和标注。还不会同步到其他设备。");
    };
    reader.onerror = function () {
      setStatus("这份备份读不出来，没有导入。");
    };
    reader.readAsText(file);
  }

  document.body.classList.add("is-freeform");
  works().forEach(bindNotes);

  var loaded = readKey(KEY);
  var old = readKey(OLD_KEY);
  if (loaded.blocked || old.blocked) {
    canStore = false;
    arrange(dateList());
    fit();
    applyCamera();
    setStatus("这台浏览器不能读取本地保存。位置和标注在刷新后不会留下。还不会同步到其他设备。");
  } else if (loaded.corrupt) {
    arrange(dateList());
    fit();
    applyCamera();
    setStatus("这台浏览器里的自由摆放记录读不出来。没有覆盖它，先按日期排开。");
  } else {
    if (old.data && old.data.notes) {
      Object.keys(old.data.notes).forEach(function (id) {
        if (!state.notes[id]) state.notes[id] = old.data.notes[id];
      });
    }
    if (loaded.data) {
      state.notes = Object.assign({}, old.data && old.data.notes, loaded.data.notes);
      state.camera = loaded.data.camera;
      if (loaded.data.positions) state.positions = loaded.data.positions;
    } else if (old.data) {
      state.notes = old.data.notes || {};
    }
    if (!Object.keys(state.positions).length) {
      if (old.data && old.data.manualOrder && old.data.view === "manual") arrange(listFromOrder(old.data.manualOrder));
      else arrange(dateList());
      fit();
      autoPlaced = true;
    } else {
      placeMissing();
      cards().forEach(applyPosition);
    }
    applyNotes();
    applyCamera();
    if (loaded.empty && !loaded.corrupt) {
      persist();
      setStatus(old.data ? "已把这台浏览器里原有的标注带到自由摆放。旧记录还留着。还不会同步到其他设备。" : "已按发布日期排开，并写在这台浏览器。还不会同步到其他设备。");
    } else {
      setStatus("已读到这台浏览器里的位置和标注。还不会同步到其他设备。");
    }
  }

  stage.addEventListener("pointerdown", onPointerDown);
  stage.addEventListener("pointermove", onPointerMove);
  stage.addEventListener("pointerup", onPointerUp);
  stage.addEventListener("pointercancel", onPointerUp);
  stage.addEventListener("wheel", onWheel, { passive: false });
  stage.addEventListener("keydown", onKey);
  document.getElementById("arrange-date").addEventListener("click", arrangeByDate);
  document.getElementById("zoom-in").addEventListener("click", function () {
    zoomAt(stage.clientWidth / 2 + stage.getBoundingClientRect().left, stage.clientHeight / 2 + stage.getBoundingClientRect().top, 1.12);
    persist();
  });
  document.getElementById("zoom-out").addEventListener("click", function () {
    zoomAt(stage.clientWidth / 2 + stage.getBoundingClientRect().left, stage.clientHeight / 2 + stage.getBoundingClientRect().top, 1 / 1.12);
    persist();
  });
  document.getElementById("fit-board").addEventListener("click", function () {
    fit();
    persist();
    setStatus("已把整块板放进窗口。还不会同步到其他设备。");
  });
  document.getElementById("export-local").addEventListener("click", exportBackup);
  document.getElementById("import-local").addEventListener("change", function (event) {
    var file = event.target.files && event.target.files[0];
    event.target.value = "";
    importBackup(file);
  });
  function remeasure() {
    if (!autoPlaced) return;
    if (old.data && old.data.manualOrder && old.data.view === "manual") arrange(listFromOrder(old.data.manualOrder));
    else arrange(dateList());
    fit();
    autoPlaced = false;
    persist();
  }
  if (document.readyState === "complete") remeasure();
  else window.addEventListener("load", remeasure);
  window.addEventListener("pagehide", function () { persist(); });
})();
