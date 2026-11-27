(function () {
function boot(section) {
  var KEY = "learning-board-freeform-v1-" + (section.getAttribute("data-board") || "claude");
  var OLD_KEY = "learning-board-local-v1";
  var LAYOUT_REVISION = "2026-11-27-gsplat-10";
  var CYCLE = "2026-11-27-gsplat-10";
  var NOTE_MAX = 2000;
  var FILE_MAX = 500000;
  var CARD_W = 280;
  var GAP = 28;
  var COLUMNS = 8;
  var ORIGIN_X = 48;
  var ORIGIN_Y = 48;
  var board = section.querySelector(".board");
  var stage = section.querySelector(".stage");
  var world = section.querySelector(".world");
  var stateEl = document.getElementById("save-state");
  if (!board || !stage || !world || !stateEl) return null;

  var state = {
    positions: {},
    notes: {},
    learned: {},
    camera: { x: 36, y: 28, z: 1 }
  };
  var canStore = true;
  var selected = null;
  var zTop = 2;
  var autoPlaced = false;
  var loadNotice = "";
  var displayCamera = null;
  var pointers = new Map();
  var pinch = null;

  function cards() {
    return Array.prototype.slice.call(board.querySelectorAll("article.card"));
  }

  function works() {
    return cards().filter(function (card) { return !card.classList.contains("intro"); });
  }

  function unknownDate(card) {
    return !card.dataset.published || card.dataset.datePrecision === "unknown";
  }

  function byPublishedDesc(a, b) {
    var aUnknown = unknownDate(a);
    var bUnknown = unknownDate(b);
    if (aUnknown !== bUnknown) return aUnknown ? 1 : -1;
    if (!aUnknown) {
      var byDate = b.dataset.published.localeCompare(a.dataset.published);
      if (byDate) return byDate;
    }
    return Number(a.dataset.tie || 0) - Number(b.dataset.tie || 0);
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

  function cleanLearned(value) {
    if (value == null) return {};
    if (typeof value !== "object" || Array.isArray(value)) return null;
    var learned = {};
    var keys = Object.keys(value);
    for (var i = 0; i < keys.length; i += 1) {
      var key = keys[i];
      if (key === "__proto__" || key === "constructor" || key === "prototype") return null;
      if (!/^[a-z0-9-]+$/.test(key)) return null;
      if (value[key] === true) learned[key] = true;
    }
    return learned;
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
    var learned = cleanLearned(data.learned);
    if (!learned) learned = {};
    var positions = data.positions == null ? null : cleanPositions(data.positions);
    if (data.positions != null && !positions) return null;
    var camera = data.camera == null ? { x: 36, y: 28, z: 1 } : cleanCamera(data.camera);
    if (!camera) return null;
    var manualOrder = data.manualOrder == null ? null : cleanOrder(data.manualOrder);
    if (data.manualOrder != null && !manualOrder) return null;
    var revision = typeof data.revision === "string" ? data.revision : "";
    return { v: 1, positions: positions, notes: notes, learned: learned, camera: camera, manualOrder: manualOrder, revision: revision };
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

  function notesForSave() {
    var notes = {};
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && parsed.notes && typeof parsed.notes === "object" && !Array.isArray(parsed.notes)) {
          var kept = cleanNotes(parsed.notes);
          if (kept) notes = kept;
        }
      }
    } catch (err) {}
    Object.keys(state.notes).forEach(function (id) {
      if (state.notes[id]) notes[id] = state.notes[id];
    });
    return notes;
  }

  function persist() {
    var notes = notesForSave();
    state.notes = notes;
    try {
      localStorage.setItem(KEY, JSON.stringify({
        v: 1,
        revision: LAYOUT_REVISION,
        positions: state.positions,
        notes: notes,
        learned: state.learned,
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

  function shownCamera() {
    return displayCamera || state.camera;
  }

  function applyCamera(cam) {
    var c = cam || shownCamera();
    world.style.transform = "translate(" + c.x + "px," + c.y + "px) scale(" + c.z + ")";
  }

  function keepDisplayedCamera() {
    if (!displayCamera) return;
    state.camera = { x: displayCamera.x, y: displayCamera.y, z: displayCamera.z };
    displayCamera = null;
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

  function rowRight() {
    return ORIGIN_X + COLUMNS * (CARD_W + GAP) - GAP;
  }

  function arrange(list) {
    var intro = board.querySelector(".intro");
    var content = list.filter(function (card) { return card && card !== intro; });
    var contentTop = ORIGIN_Y;
    if (intro) {
      state.positions[intro.dataset.id] = { x: ORIGIN_X, y: ORIGIN_Y };
      applyPosition(intro);
      contentTop = ORIGIN_Y + (intro.offsetHeight || 160) + GAP;
    }
    var x = ORIGIN_X;
    var y = contentTop;
    var rowH = 0;
    var col = 0;
    content.forEach(function (card) {
      if (col === COLUMNS) {
        col = 0;
        x = ORIGIN_X;
        y += rowH + GAP;
        rowH = 0;
      }
      state.positions[card.dataset.id] = { x: x, y: y };
      applyPosition(card);
      rowH = Math.max(rowH, card.offsetHeight || 360);
      x += CARD_W + GAP;
      col += 1;
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
    var missing = dateList().filter(function (card) { return !state.positions[card.dataset.id]; });
    if (!missing.length) return;
    function overlaps(x, y, ignoreId) {
      return cards().some(function (card) {
        if (card.dataset.id === ignoreId) return false;
        var pos = state.positions[card.dataset.id];
        if (!pos) return false;
        var h = card.offsetHeight || 340;
        return x < pos.x + CARD_W + 8 && x + CARD_W + 8 > pos.x && y < pos.y + h + 8 && y + 340 > pos.y;
      });
    }
    missing.forEach(function (card) {
      var list = dateList();
      var index = list.indexOf(card);
      var anchor = null;
      var after = true;
      var i;
      for (i = index - 1; i >= 0; i -= 1) {
        if (state.positions[list[i].dataset.id]) {
          anchor = list[i];
          after = true;
          break;
        }
      }
      if (!anchor) {
        for (i = index + 1; i < list.length; i += 1) {
          if (state.positions[list[i].dataset.id]) {
            anchor = list[i];
            after = false;
            break;
          }
        }
      }
      var x = 48;
      var y = 48;
      if (anchor) {
        var pos = state.positions[anchor.dataset.id];
        if (anchor.classList.contains("intro")) {
          x = ORIGIN_X;
          y = pos.y + (anchor.offsetHeight || 160) + GAP;
        } else if (after) {
          x = pos.x + CARD_W + GAP;
          y = pos.y;
          if (x + CARD_W > rowRight()) {
            x = ORIGIN_X;
            y = pos.y + (anchor.offsetHeight || 360) + GAP;
          }
        } else {
          x = pos.x;
          y = Math.max(ORIGIN_Y, pos.y - 380);
        }
      }
      var guard = 0;
      while (overlaps(x, y, card.dataset.id) && guard < 24) {
        y += 80;
        guard += 1;
      }
      state.positions[card.dataset.id] = { x: x, y: y };
      applyPosition(card);
    });
  }

  function showNewest() {
    var list = works().slice().sort(byPublishedDesc);
    var row = [];
    var y0 = null;
    list.forEach(function (card) {
      if (row.length >= COLUMNS) return;
      var pos = state.positions[card.dataset.id];
      if (!pos) return;
      if (y0 == null) y0 = pos.y;
      if (Math.abs(pos.y - y0) > 2) return;
      row.push(card);
    });
    if (!row.length) {
      state.camera.x = 16;
      state.camera.y = 12;
      state.camera.z = 1;
      applyCamera();
      return;
    }
    var minX = Infinity;
    var minY = Infinity;
    var maxX = -Infinity;
    row.forEach(function (card) {
      var pos = state.positions[card.dataset.id];
      minX = Math.min(minX, pos.x);
      minY = Math.min(minY, pos.y);
      maxX = Math.max(maxX, pos.x + (card.offsetWidth || CARD_W));
    });
    var pad = 12;
    var sw = stage.clientWidth || window.innerWidth || 1280;
    var rowW = Math.max(maxX - minX, CARD_W);
    var z = (sw - pad * 2) / rowW;
    if (sw < 1000) {
      var twoW = CARD_W * 2 + GAP;
      var zTwo = (sw - pad * 2) / twoW;
      var zOne = Math.min((sw - pad * 2) / CARD_W, 1);
      z = zTwo * CARD_W >= 150 ? Math.min(zTwo, 1.2) : zOne;
    }
    z = clamp(z, 0.18, 1.6);
    state.camera.z = z;
    state.camera.x = pad - minX * z;
    state.camera.y = pad - minY * z;
    applyCamera();
  }

  function fit() {
    keepDisplayedCamera();
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
    keepDisplayedCamera();
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
      keepDisplayedCamera();
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
    if (tag === "TEXTAREA" || tag === "INPUT" || tag === "BUTTON") return;
    if (event.target && event.target.closest && event.target.closest(".learned-toggle")) return;
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
    showNewest();
    if (!persist()) return;
    setStatus("已按发布日期排开，这一行八张放进了窗口。这次会换掉之前摆放的位置。还不会同步到其他设备。");
  }

  function exportBackup() {
    var blob = new Blob([JSON.stringify({
      v: 1,
      revision: LAYOUT_REVISION,
      positions: state.positions,
      notes: state.notes,
      learned: state.learned,
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
    setStatus("已导出这台浏览器里的位置。这不是跨设备同步。");
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
      state.learned = clean.learned || {};
      state.camera = clean.camera;
      if (clean.positions) {
        state.positions = clean.positions;
        placeMissing();
        cards().forEach(applyPosition);
      } else if (clean.manualOrder) {
        arrange(listFromOrder(clean.manualOrder));
      }
      applyAllLearned();
      applyCamera();
      if (!persist()) return;
      setStatus("已用备份覆盖这台浏览器里的位置。还不会同步到其他设备。");
    };
    reader.onerror = function () {
      setStatus("这份备份读不出来，没有导入。");
    };
    reader.readAsText(file);
  }

  document.body.classList.add("is-freeform");

  var loaded = readKey(KEY);
  var old = readKey(OLD_KEY);
  if (loaded.blocked || old.blocked) {
    canStore = false;
    arrange(dateList());
    showNewest();
    applyCamera();
    setStatus("这台浏览器不能读取本地保存。位置在刷新后不会留下。还不会同步到其他设备。");
  } else if (loaded.corrupt) {
    arrange(dateList());
    showNewest();
    applyCamera();
    setStatus("这台浏览器里的自由摆放记录读不出来。没有覆盖它，先按日期排开。");
  } else {
    function takeNotes(bag) {
      if (!bag || !bag.notes) return;
      cards().forEach(function (card) {
        var id = card.dataset.id;
        if (!state.notes[id] && bag.notes[id]) state.notes[id] = bag.notes[id];
      });
    }
    function takeLearned(bag) {
      if (!bag || !bag.learned) return;
      cards().forEach(function (card) {
        var id = card.dataset.id;
        if (!state.learned[id] && bag.learned[id] === true) state.learned[id] = true;
      });
    }
    takeNotes(old.data);
    takeNotes(readKey("learning-board-freeform-v1").data);
    takeLearned(old.data);
    takeLearned(readKey("learning-board-freeform-v1").data);
    if (loaded.data) {
      state.notes = Object.assign({}, old.data && old.data.notes, loaded.data.notes);
      state.learned = Object.assign({}, old.data && old.data.learned, loaded.data.learned);
      state.camera = loaded.data.camera;
      if (loaded.data.positions) state.positions = loaded.data.positions;
    } else if (old.data) {
      state.notes = old.data.notes || {};
      state.learned = Object.assign({}, state.learned, old.data.learned || {});
    }
    var revisionMatches = !!(loaded.data && loaded.data.revision === LAYOUT_REVISION);
    var hadSavedLayout = Object.keys(state.positions).length > 0;
    if (!revisionMatches || !hadSavedLayout) {
      state.positions = {};
      arrange(dateList());
      showNewest();
      autoPlaced = true;
      loadNotice = hadSavedLayout
        ? "这次打开已按原发布日期从新到旧排开，并把这一行八张放进窗口。以前保存的摆放和视角已让位，标注还留在这台浏览器里。还不会同步到其他设备。"
        : "已按发布日期排开，这一行八张放进了窗口，并写在这台浏览器。还不会同步到其他设备。";
    } else {
      var beforeCount = Object.keys(state.positions).length;
      placeMissing();
      cards().forEach(applyPosition);
      if (Object.keys(state.positions).length !== beforeCount) persist();
    }
    applyCamera();
    if (autoPlaced) persist();
    if (loadNotice) setStatus(loadNotice);
    else setStatus("已读到这台浏览器里的位置。还不会同步到其他设备。");
  }

  function applyLearned(card) {
    if (!card) return;
    var on = !!state.learned[card.dataset.id];
    card.classList.toggle("is-learned", on);
    var btn = card.querySelector(".learned-toggle");
    if (!btn) return;
    btn.setAttribute("aria-checked", on ? "true" : "false");
    btn.setAttribute("aria-label", on ? "已学，滑到左边可改为未学" : "未学，滑到右边记为已学");
    var label = btn.querySelector(".learned-label");
    if (label) label.textContent = on ? "已学" : "未学";
  }

  function applyAllLearned() {
    cards().forEach(applyLearned);
  }

  function setLearned(id, on) {
    if (on) state.learned[id] = true;
    else delete state.learned[id];
    applyLearned(board.querySelector('article.card[data-id="' + id + '"]'));
    persist();
  }

  function bindLearnedToggle(btn, card) {
    var drag = null;

    function learnedFromClientX(clientX, track) {
      var rect = track.getBoundingClientRect();
      var width = rect.width || 1;
      return clientX >= rect.left + width / 2;
    }

    function onDown(event) {
      event.preventDefault();
      event.stopPropagation();
      if (event.button != null && event.button !== 0) return;
      drag = {
        startX: event.clientX,
        startOn: !!state.learned[card.dataset.id],
        moved: false,
        track: btn.querySelector(".learned-track")
      };
      try { btn.setPointerCapture(event.pointerId); } catch (err) {}
    }

    function onMove(event) {
      event.stopPropagation();
      if (!drag) return;
      if (!drag.moved && Math.abs(event.clientX - drag.startX) < 4) return;
      drag.moved = true;
      event.preventDefault();
      var on = learnedFromClientX(event.clientX, drag.track);
      if (on) state.learned[card.dataset.id] = true;
      else delete state.learned[card.dataset.id];
      applyLearned(card);
    }

    function onUp(event) {
      event.preventDefault();
      event.stopPropagation();
      if (!drag) return;
      if (!drag.moved) setLearned(card.dataset.id, !drag.startOn);
      else setLearned(card.dataset.id, learnedFromClientX(event.clientX, drag.track));
      drag = null;
    }

    function onClick(event) {
      event.preventDefault();
      event.stopPropagation();
    }

    function onToggleKey(event) {
      if (event.key === "ArrowRight" || event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        setLearned(card.dataset.id, true);
      } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
        event.preventDefault();
        event.stopPropagation();
        setLearned(card.dataset.id, false);
      } else if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        setLearned(card.dataset.id, !state.learned[card.dataset.id]);
      } else {
        event.stopPropagation();
      }
    }

    btn.addEventListener("pointerdown", onDown);
    btn.addEventListener("pointermove", onMove);
    btn.addEventListener("pointerup", onUp);
    btn.addEventListener("pointercancel", onUp);
    btn.addEventListener("click", onClick);
    btn.addEventListener("keydown", onToggleKey);
  }

  function mountLearnedToggles() {
    cards().forEach(function (card) {
      if (card.querySelector(".learned-toggle")) {
        applyLearned(card);
        return;
      }
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "learned-toggle";
      btn.setAttribute("role", "switch");
      btn.setAttribute("aria-checked", "false");
      btn.setAttribute("aria-label", "未学，滑到右边记为已学");
      btn.innerHTML = '<span class="learned-label">未学</span><span class="learned-track" aria-hidden="true"><span class="learned-knob"></span></span>';
      card.appendChild(btn);
      bindLearnedToggle(btn, card);
      applyLearned(card);
    });
  }

  mountLearnedToggles();

  stage.addEventListener("pointerdown", onPointerDown);
  stage.addEventListener("pointermove", onPointerMove);
  stage.addEventListener("pointerup", onPointerUp);
  stage.addEventListener("pointercancel", onPointerUp);
  stage.addEventListener("wheel", onWheel, { passive: false });
  stage.addEventListener("keydown", onKey);
  function focusCycle() {
    var targets = cards().filter(function (card) { return card.dataset.cycle === CYCLE; });
    if (!targets.length) {
      setStatus("这一轮没有标成新增的卡片。");
      return;
    }
    var minX = Infinity;
    var minY = Infinity;
    var maxX = -Infinity;
    var maxY = -Infinity;
    targets.forEach(function (card) {
      var pos = state.positions[card.dataset.id];
      if (!pos) return;
      minX = Math.min(minX, pos.x);
      minY = Math.min(minY, pos.y);
      maxX = Math.max(maxX, pos.x + (card.offsetWidth || CARD_W));
      maxY = Math.max(maxY, pos.y + (card.offsetHeight || 360));
    });
    if (!isFinite(minX)) return;
    var pad = 36;
    var sw = stage.clientWidth;
    var sh = stage.clientHeight;
    var z = Math.min(sw / (maxX - minX + pad * 2), sh / (maxY - minY + pad * 2), 1.15);
    z = clamp(z, 0.16, 1.6);
    applyCamera({
      z: z,
      x: (sw - (maxX - minX) * z) / 2 - minX * z,
      y: pad - minY * z
    });
    displayCamera = {
      z: z,
      x: (sw - (maxX - minX) * z) / 2 - minX * z,
      y: pad - minY * z
    };
    setStatus("已把本轮新增放到窗口里。没有改卡片位置，也没有覆盖已保存的视角。");
  }

  var needsReflow = false;
  function remeasure() {
    if (stage.clientWidth < 200) {
      needsReflow = true;
      return;
    }
    if (!autoPlaced && !needsReflow) return;
    arrange(dateList());
    showNewest();
    autoPlaced = false;
    needsReflow = false;
    persist();
    if (loadNotice) setStatus(loadNotice);
  }
  if (autoPlaced) needsReflow = true;
  if (document.readyState === "complete") remeasure();
  else window.addEventListener("load", remeasure);
  window.addEventListener("pagehide", function () { persist(); });
  return {
    section: section,
    focusCycle: focusCycle,
    arrangeByDate: arrangeByDate,
    zoomAt: zoomAt,
    fit: fit,
    exportBackup: exportBackup,
    importBackup: importBackup,
    onShow: remeasure,
    persist: persist
  };
}

var mounts = {};
document.querySelectorAll(".board-view").forEach(function (section) {
  var api = boot(section);
  if (api) mounts[section.id] = api;
});

function isBoardId(id) {
  return id === "claude" || id === "openai" || id === "gsplat";
}

function boardIdFromLocation() {
  var hash = (location.hash || "").replace(/^#/, "");
  if (isBoardId(hash)) return hash;
  try {
    var query = new URLSearchParams(location.search).get("board");
    if (isBoardId(query)) return query;
  } catch (err) {}
  return "claude";
}

function active() {
  return mounts[boardIdFromLocation()] || mounts.claude || null;
}

function markNav() {
  var id = boardIdFromLocation();
  document.querySelectorAll(".board-nav a").forEach(function (link) {
    if (link.getAttribute("href") === "#" + id) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
}

window.addEventListener("hashchange", function () {
  markNav();
  var api = active();
  if (api) api.onShow();
});
markNav();

var showCycle = document.getElementById("show-cycle");
if (showCycle) showCycle.addEventListener("click", function () {
  // Each board has its own new card in this revision; frame the one on the board in view.
  var api = active();
  if (api) api.focusCycle();
});
var arrangeBtn = document.getElementById("arrange-date");
if (arrangeBtn) arrangeBtn.addEventListener("click", function () {
  var api = active();
  if (api) api.arrangeByDate();
});
var zoomIn = document.getElementById("zoom-in");
if (zoomIn) zoomIn.addEventListener("click", function () {
  var api = active();
  if (!api) return;
  var stage = api.section.querySelector(".stage");
  api.zoomAt(stage.clientWidth / 2 + stage.getBoundingClientRect().left, stage.clientHeight / 2 + stage.getBoundingClientRect().top, 1.12);
  api.persist();
});
var zoomOut = document.getElementById("zoom-out");
if (zoomOut) zoomOut.addEventListener("click", function () {
  var api = active();
  if (!api) return;
  var stage = api.section.querySelector(".stage");
  api.zoomAt(stage.clientWidth / 2 + stage.getBoundingClientRect().left, stage.clientHeight / 2 + stage.getBoundingClientRect().top, 1 / 1.12);
  api.persist();
});
var fitBtn = document.getElementById("fit-board");
if (fitBtn) fitBtn.addEventListener("click", function () {
  var api = active();
  if (!api) return;
  api.fit();
  api.persist();
});
var exportBtn = document.getElementById("export-local");
if (exportBtn) exportBtn.addEventListener("click", function () {
  var api = active();
  if (api) api.exportBackup();
});
var importInput = document.getElementById("import-local");
if (importInput) importInput.addEventListener("change", function (event) {
  var api = active();
  var file = event.target.files && event.target.files[0];
  event.target.value = "";
  if (api) api.importBackup(file);
});
})();
