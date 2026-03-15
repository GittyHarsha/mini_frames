(function () {
  'use strict';

  var zCounter = 100;
  var spawnX = 50;
  var spawnY = 50;
  var windows = {};
  var windowState = {};
  var savedLayout = {};
  var canvas = null;
  var saveTimer = null;

  function getCanvas() {
    if (!canvas) {
      canvas = document.getElementById('canvas');
    }
    return canvas;
  }

  function nextSpawnPosition() {
    var pos = { x: spawnX, y: spawnY };
    spawnX += 30;
    spawnY += 30;
    if (spawnX >= 500 || spawnY >= 400) {
      spawnX = 50;
      spawnY = 50;
    }
    return pos;
  }

  // Transparent overlay to prevent iframe from stealing mouse events
  function addOverlay(windowEl) {
    var overlay = document.createElement('div');
    overlay.className = 'mf-drag-overlay';
    overlay.style.cssText =
      'position:absolute;top:0;left:0;width:100%;height:100%;z-index:9999;';
    windowEl.appendChild(overlay);
    return overlay;
  }

  function removeOverlay(windowEl) {
    var overlay = windowEl.querySelector('.mf-drag-overlay');
    if (overlay) overlay.remove();
  }

  var PIN_Z_BASE = 50000;
  var pinZCounter = PIN_Z_BASE;

  function bringToFront(id) {
    var win = windows[id];
    if (!win) return;
    var state = windowState[id] || {};
    if (state.pinned) {
      pinZCounter++;
      win.style.zIndex = pinZCounter;
    } else {
      zCounter++;
      win.style.zIndex = zCounter;
    }
  }

  // --- Layout persistence ------------------------------------

  function saveLayout() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      var layout = {};
      var ids = Object.keys(windows);
      for (var i = 0; i < ids.length; i++) {
        var id = ids[i];
        var el = windows[id];
        var state = windowState[id] || {};
        layout[id] = {
          x: el.offsetLeft,
          y: el.offsetTop,
          w: el.offsetWidth,
          h: el.offsetHeight,
          minimized: !!state.minimized,
          maximized: !!state.maximized,
          pinned: !!state.pinned,
        };
      }
      fetch('/api/storage/_window-layout', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(layout),
      }).catch(function () { /* silent */ });
    }, 500);
  }

  function loadLayout() {
    return fetch('/api/storage/_window-layout')
      .then(function (res) {
        if (!res.ok) return {};
        return res.json();
      })
      .then(function (data) {
        savedLayout = data || {};
        return savedLayout;
      })
      .catch(function () {
        savedLayout = {};
        return savedLayout;
      });
  }

  // --- Minimize / Maximize -----------------------------------

  function minimize(id) {
    var el = windows[id];
    if (!el) return;
    var state = windowState[id] || (windowState[id] = {});

    if (state.minimized) {
      // Restore from minimized
      el.classList.remove('mf-minimized');
      el.style.height = (state.prevHeight || 400) + 'px';
      state.minimized = false;
    } else {
      // If maximized, restore first
      if (state.maximized) maximize(id);
      state.prevHeight = el.offsetHeight;
      el.classList.add('mf-minimized');
      state.minimized = true;
    }
    saveLayout();
  }

  function maximize(id) {
    var el = windows[id];
    if (!el) return;
    var state = windowState[id] || (windowState[id] = {});
    var btn = el.querySelector('.mf-maximize');

    if (state.maximized) {
      // Restore from maximized
      el.classList.remove('mf-maximized');
      el.style.left = (state.prevX || 50) + 'px';
      el.style.top = (state.prevY || 50) + 'px';
      el.style.width = (state.prevW || 600) + 'px';
      el.style.height = (state.prevH || 400) + 'px';
      state.maximized = false;
      if (btn) btn.textContent = '\u25a1';
    } else {
      // If minimized, restore first
      if (state.minimized) minimize(id);
      state.prevX = el.offsetLeft;
      state.prevY = el.offsetTop;
      state.prevW = el.offsetWidth;
      state.prevH = el.offsetHeight;
      el.classList.add('mf-maximized');
      state.maximized = true;
      if (btn) btn.textContent = '\u274d';
    }
    saveLayout();
  }

  function pin(id) {
    var el = windows[id];
    if (!el) return;
    var state = windowState[id] || (windowState[id] = {});
    state.pinned = !state.pinned;

    var pinBtn = el.querySelector('.mf-pin');
    if (state.pinned) {
      pinZCounter++;
      el.style.zIndex = pinZCounter;
      el.classList.add('mf-pinned');
      if (pinBtn) pinBtn.textContent = '\uD83D\uDCCC'; // 📌
      if (pinBtn) pinBtn.style.opacity = '1';
    } else {
      zCounter++;
      el.style.zIndex = zCounter;
      el.classList.remove('mf-pinned');
      if (pinBtn) pinBtn.textContent = '\uD83D\uDCCC'; // 📌
      if (pinBtn) pinBtn.style.opacity = '0.4';
    }
    saveLayout();
  }

  // --- Tile layout -------------------------------------------

  function tile() {
    var ids = Object.keys(windows);
    if (ids.length === 0) return;

    var gap = 10;
    var canvasEl = getCanvas();
    var cw = canvasEl.clientWidth;
    var ch = canvasEl.clientHeight;
    var cols = Math.max(1, Math.floor(cw / 500));
    var rows = Math.ceil(ids.length / cols);
    var cellW = (cw - gap * (cols + 1)) / cols;
    var cellH = (ch - gap * (rows + 1)) / rows;

    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      var el = windows[id];
      var state = windowState[id] || (windowState[id] = {});

      // Restore if minimized or maximized
      if (state.minimized) minimize(id);
      if (state.maximized) maximize(id);

      var col = i % cols;
      var row = Math.floor(i / cols);

      el.classList.add('mf-tiling');
      el.style.left = (gap + col * (cellW + gap)) + 'px';
      el.style.top = (gap + row * (cellH + gap)) + 'px';
      el.style.width = cellW + 'px';
      el.style.height = cellH + 'px';
    }

    // Remove tiling class after animation completes
    setTimeout(function () {
      for (var j = 0; j < ids.length; j++) {
        windows[ids[j]].classList.remove('mf-tiling');
      }
      saveLayout();
    }, 350);
  }

  // --- Drag / Resize -----------------------------------------

  // Snap guide lines (visual feedback)
  var snapGuides = [];

  function showSnapGuide(orientation, position) {
    var guide = document.createElement('div');
    guide.className = 'mf-snap-guide';
    if (orientation === 'v') {
      guide.style.cssText = 'position:absolute;top:0;bottom:0;width:1px;background:var(--mf-accent);opacity:0.4;z-index:99998;pointer-events:none;left:' + position + 'px;';
    } else {
      guide.style.cssText = 'position:absolute;left:0;right:0;height:1px;background:var(--mf-accent);opacity:0.4;z-index:99998;pointer-events:none;top:' + position + 'px;';
    }
    getCanvas().appendChild(guide);
    snapGuides.push(guide);
  }

  function clearSnapGuides() {
    for (var i = 0; i < snapGuides.length; i++) {
      if (snapGuides[i].parentNode) snapGuides[i].parentNode.removeChild(snapGuides[i]);
    }
    snapGuides = [];
  }

  function setupDrag(windowEl, titlebar, id) {
    var dragging = false;
    var offsetX = 0;
    var offsetY = 0;

    titlebar.addEventListener('mousedown', function (e) {
      if (e.target.closest('button')) return;
      e.preventDefault();
      dragging = true;
      offsetX = e.clientX - windowEl.offsetLeft;
      offsetY = e.clientY - windowEl.offsetTop;
      bringToFront(id);
      addOverlay(windowEl);
    });

    document.addEventListener('mousemove', function (e) {
      if (!dragging) return;
      var newX = e.clientX - offsetX;
      var newY = e.clientY - offsetY;
      var w = windowEl.offsetWidth;
      var h = windowEl.offsetHeight;
      var SNAP = 12;

      var canvasEl = getCanvas();
      var cw = canvasEl.clientWidth;
      var ch = canvasEl.clientHeight;

      clearSnapGuides();
      var snappedX = false;
      var snappedY = false;

      // Snap to viewport edges
      if (Math.abs(newX) < SNAP) { newX = 0; snappedX = true; showSnapGuide('v', 0); }
      if (Math.abs(newY) < SNAP) { newY = 0; snappedY = true; showSnapGuide('h', 0); }
      if (Math.abs(newX + w - cw) < SNAP) { newX = cw - w; snappedX = true; showSnapGuide('v', cw); }
      if (Math.abs(newY + h - ch) < SNAP) { newY = ch - h; snappedY = true; showSnapGuide('h', ch); }

      // Snap to other windows
      var ids = Object.keys(windows);
      for (var i = 0; i < ids.length; i++) {
        if (ids[i] === id) continue;
        var other = windows[ids[i]];
        var ox = other.offsetLeft;
        var oy = other.offsetTop;
        var ow = other.offsetWidth;
        var oh = other.offsetHeight;

        // Horizontal snaps
        if (!snappedX && Math.abs(newX - (ox + ow)) < SNAP) { newX = ox + ow; snappedX = true; showSnapGuide('v', ox + ow); }
        if (!snappedX && Math.abs(newX + w - ox) < SNAP) { newX = ox - w; snappedX = true; showSnapGuide('v', ox); }
        if (!snappedX && Math.abs(newX - ox) < SNAP) { newX = ox; snappedX = true; showSnapGuide('v', ox); }
        if (!snappedX && Math.abs(newX + w - (ox + ow)) < SNAP) { newX = ox + ow - w; snappedX = true; showSnapGuide('v', ox + ow); }

        // Vertical snaps
        if (!snappedY && Math.abs(newY - (oy + oh)) < SNAP) { newY = oy + oh; snappedY = true; showSnapGuide('h', oy + oh); }
        if (!snappedY && Math.abs(newY + h - oy) < SNAP) { newY = oy - h; snappedY = true; showSnapGuide('h', oy); }
        if (!snappedY && Math.abs(newY - oy) < SNAP) { newY = oy; snappedY = true; showSnapGuide('h', oy); }
        if (!snappedY && Math.abs(newY + h - (oy + oh)) < SNAP) { newY = oy + oh - h; snappedY = true; showSnapGuide('h', oy + oh); }
      }

      windowEl.style.left = newX + 'px';
      windowEl.style.top = newY + 'px';
    });

    document.addEventListener('mouseup', function () {
      if (!dragging) return;
      dragging = false;
      clearSnapGuides();
      removeOverlay(windowEl);
      saveLayout();
    });
  }

  function setupResize(windowEl, handle, id) {
    var resizing = false;
    var startX = 0;
    var startY = 0;
    var startW = 0;
    var startH = 0;

    handle.addEventListener('mousedown', function (e) {
      e.preventDefault();
      e.stopPropagation();
      resizing = true;
      startX = e.clientX;
      startY = e.clientY;
      startW = windowEl.offsetWidth;
      startH = windowEl.offsetHeight;
      addOverlay(windowEl);
    });

    document.addEventListener('mousemove', function (e) {
      if (!resizing) return;
      var newW = Math.max(300, startW + (e.clientX - startX));
      var newH = Math.max(200, startH + (e.clientY - startY));
      windowEl.style.width = newW + 'px';
      windowEl.style.height = newH + 'px';
    });

    document.addEventListener('mouseup', function () {
      if (!resizing) return;
      resizing = false;
      removeOverlay(windowEl);
      saveLayout();
    });
  }

  // --- Window creation ---------------------------------------

  function create(id, title, src) {
    if (windows[id]) return windows[id];

    // Use saved layout position or cascade
    var layout = savedLayout[id];
    var x = layout ? layout.x : null;
    var y = layout ? layout.y : null;
    var w = layout ? layout.w : 600;
    var h = layout ? layout.h : 400;
    if (x === null || y === null) {
      var pos = nextSpawnPosition();
      x = pos.x;
      y = pos.y;
    }
    zCounter++;

    var windowEl = document.createElement('div');
    windowEl.className = 'mf-window';
    windowEl.setAttribute('data-window-id', id);
    windowEl.style.cssText =
      'left:' + x + 'px;top:' + y + 'px;width:' + w + 'px;height:' + h + 'px;' +
      'z-index:' + zCounter + ';position:absolute;';

    var titlebar = document.createElement('div');
    titlebar.className = 'mf-titlebar';

    var titleSpan = document.createElement('span');
    titleSpan.className = 'mf-title';
    titleSpan.textContent = title;

    var controls = document.createElement('div');
    controls.className = 'mf-controls';

    var minimizeBtn = document.createElement('button');
    minimizeBtn.className = 'mf-minimize';
    minimizeBtn.title = 'Minimize';
    minimizeBtn.textContent = '\u2212';
    minimizeBtn.addEventListener('click', function () {
      minimize(id);
    });

    var maximizeBtn = document.createElement('button');
    maximizeBtn.className = 'mf-maximize';
    maximizeBtn.title = 'Maximize';
    maximizeBtn.textContent = '\u25a1';
    maximizeBtn.addEventListener('click', function () {
      maximize(id);
    });

    var closeBtn = document.createElement('button');
    closeBtn.className = 'mf-close';
    closeBtn.title = 'Close';
    closeBtn.textContent = '\u00d7';
    closeBtn.addEventListener('click', function () {
      close(id);
    });

    var pinBtn = document.createElement('button');
    pinBtn.className = 'mf-pin';
    pinBtn.title = 'Pin on top';
    pinBtn.textContent = '\uD83D\uDCCC'; // 📌
    pinBtn.style.cssText = 'width:24px;height:24px;background:transparent;border:none;' +
      'color:var(--mf-muted,#888);font-size:14px;line-height:24px;border-radius:4px;' +
      'cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;' +
      'opacity:0.4;transition:opacity 0.15s,background 0.15s;';
    pinBtn.addEventListener('mouseenter', function() { pinBtn.style.background = 'var(--mf-input-bg,rgba(160,160,255,0.08))'; });
    pinBtn.addEventListener('mouseleave', function() { pinBtn.style.background = 'transparent'; });
    pinBtn.addEventListener('click', function () {
      pin(id);
    });

    controls.appendChild(pinBtn);
    controls.appendChild(minimizeBtn);
    controls.appendChild(maximizeBtn);
    controls.appendChild(closeBtn);
    titlebar.appendChild(titleSpan);
    titlebar.appendChild(controls);

    var iframe = document.createElement('iframe');
    iframe.className = 'mf-iframe';
    iframe.src = src;
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms');

    var resizeHandle = document.createElement('div');
    resizeHandle.className = 'mf-resize-handle';

    windowEl.appendChild(titlebar);
    windowEl.appendChild(iframe);
    windowEl.appendChild(resizeHandle);

    // Bring to front on any mousedown within the window
    windowEl.addEventListener('mousedown', function () {
      bringToFront(id);
    });

    // Right-click context menu
    titlebar.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      showContextMenu(e.clientX, e.clientY, id);
    });

    setupDrag(windowEl, titlebar, id);
    setupResize(windowEl, resizeHandle, id);

    getCanvas().appendChild(windowEl);
    windows[id] = windowEl;
    windowState[id] = windowState[id] || {};

    // Apply saved minimized/maximized state
    if (layout && layout.minimized) minimize(id);
    if (layout && layout.maximized) maximize(id);
    if (layout && layout.pinned) pin(id);

    return windowEl;
  }

  function close(id) {
    var win = windows[id];
    if (!win) return;
    win.remove();
    delete windows[id];
    delete windowState[id];
    saveLayout();
  }

  function reload(id) {
    var win = windows[id];
    if (!win) return;
    var iframe = win.querySelector('.mf-iframe');
    if (iframe) iframe.src = iframe.src;
  }

  function getAll() {
    return Object.keys(windows);
  }

  function getWindow(id) {
    var el = windows[id];
    if (!el) return null;
    var state = windowState[id] || {};
    return {
      el: el,
      iframe: el.querySelector('.mf-iframe'),
      x: el.offsetLeft,
      y: el.offsetTop,
      w: el.offsetWidth,
      h: el.offsetHeight,
      minimized: !!state.minimized,
      maximized: !!state.maximized,
      pinned: !!state.pinned,
    };
  }

  function init() {
    return loadLayout();
  }

  // --- Context menu ---
  var ctxMenu = null;

  function showContextMenu(x, y, id) {
    hideContextMenu();
    ctxMenu = document.createElement('div');
    ctxMenu.className = 'mf-context-menu';
    ctxMenu.style.cssText = 'position:fixed;z-index:100000;min-width:160px;padding:4px 0;' +
      'background:var(--mf-surface,#16162e);border:1px solid var(--mf-border,rgba(160,160,255,0.15));' +
      'border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.4);font-family:system-ui,-apple-system,sans-serif;' +
      'font-size:12px;color:var(--mf-text,#e0e0ff);';

    function addItem(label, icon, action) {
      var item = document.createElement('div');
      item.style.cssText = 'padding:6px 12px;cursor:pointer;display:flex;align-items:center;gap:8px;' +
        'transition:background 0.1s;';
      item.innerHTML = '<span style="width:16px;text-align:center;opacity:0.6;">' + icon + '</span>' +
        '<span>' + label + '</span>';
      item.addEventListener('mouseenter', function() { item.style.background = 'var(--mf-input-bg,rgba(160,160,255,0.08))'; });
      item.addEventListener('mouseleave', function() { item.style.background = 'transparent'; });
      item.addEventListener('click', function() {
        hideContextMenu();
        action();
      });
      ctxMenu.appendChild(item);
    }

    function addSep() {
      var sep = document.createElement('div');
      sep.style.cssText = 'height:1px;margin:4px 8px;background:var(--mf-border,rgba(160,160,255,0.1));';
      ctxMenu.appendChild(sep);
    }

    addItem('Reload', '↻', function() { reload(id); });
    addItem('Copy Page ID', '📋', function() {
      navigator.clipboard.writeText(id).catch(function() {});
    });
    var state = windowState[id] || {};
    addItem(state.pinned ? 'Unpin' : 'Pin on top', '\uD83D\uDCCC', function() { pin(id); });
    addSep();
    addItem('Minimize', '−', function() { minimize(id); });
    addItem('Maximize', '□', function() { maximize(id); });
    addItem('Close', '×', function() { close(id); });
    addSep();
    addItem('Tile All', '⊞', function() { tile(); });

    document.body.appendChild(ctxMenu);

    // Position: keep on screen
    var rect = ctxMenu.getBoundingClientRect();
    var posX = x;
    var posY = y;
    if (posX + rect.width > window.innerWidth) posX = window.innerWidth - rect.width - 4;
    if (posY + rect.height > window.innerHeight) posY = window.innerHeight - rect.height - 4;
    ctxMenu.style.left = posX + 'px';
    ctxMenu.style.top = posY + 'px';
  }

  function hideContextMenu() {
    if (ctxMenu && ctxMenu.parentNode) {
      ctxMenu.parentNode.removeChild(ctxMenu);
    }
    ctxMenu = null;
  }

  // Close menu on any click outside
  document.addEventListener('mousedown', function(e) {
    if (ctxMenu && !ctxMenu.contains(e.target)) {
      hideContextMenu();
    }
  });
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') hideContextMenu();
  });

  window.WindowManager = {
    create: create,
    close: close,
    bringToFront: bringToFront,
    reload: reload,
    getAll: getAll,
    minimize: minimize,
    maximize: maximize,
    tile: tile,
    pin: pin,
    init: init,
    getWindow: getWindow,
  };
})();
