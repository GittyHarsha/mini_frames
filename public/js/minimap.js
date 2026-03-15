/* Minimap — bird's-eye view of all windows */
(function () {
  'use strict';

  var MAP_W = 180;
  var MAP_H = 120;
  var container = null;
  var canvas = null;
  var ctx = null;
  var visible = true;
  var updateTimer = null;

  function build() {
    if (container) return;

    container = document.createElement('div');
    container.id = 'mf-minimap';
    container.style.cssText = 'position:fixed;bottom:12px;right:12px;z-index:9999;' +
      'width:' + MAP_W + 'px;height:' + MAP_H + 'px;' +
      'background:var(--mf-surface,#16162e);border:1px solid var(--mf-border,rgba(160,160,255,0.15));' +
      'border-radius:8px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.3);' +
      'cursor:pointer;opacity:0.85;transition:opacity 0.2s;';

    container.addEventListener('mouseenter', function () { container.style.opacity = '1'; });
    container.addEventListener('mouseleave', function () { container.style.opacity = '0.85'; });

    canvas = document.createElement('canvas');
    canvas.width = MAP_W;
    canvas.height = MAP_H;
    canvas.style.cssText = 'width:100%;height:100%;';

    canvas.addEventListener('click', function (e) {
      if (!window.WindowManager) return;
      var rect = canvas.getBoundingClientRect();
      var clickX = e.clientX - rect.left;
      var clickY = e.clientY - rect.top;

      // Find bounds
      var bounds = getBounds();
      if (!bounds) return;

      // Map click position back to world coordinates
      var worldX = bounds.minX + (clickX / MAP_W) * bounds.rangeW;
      var worldY = bounds.minY + (clickY / MAP_H) * bounds.rangeH;

      // Find closest window to click point
      var allIds = WindowManager.getAll();
      var bestId = null;
      var bestDist = Infinity;
      for (var i = 0; i < allIds.length; i++) {
        var win = WindowManager.getWindow(allIds[i]);
        if (!win) continue;
        var cx = win.x + win.w / 2;
        var cy = win.y + win.h / 2;
        var dist = Math.sqrt((cx - worldX) * (cx - worldX) + (cy - worldY) * (cy - worldY));
        if (dist < bestDist) {
          bestDist = dist;
          bestId = allIds[i];
        }
      }
      if (bestId) {
        WindowManager.bringToFront(bestId);
      }
    });

    container.appendChild(canvas);
    document.body.appendChild(container);
    ctx = canvas.getContext('2d');
  }

  function getBounds() {
    if (!window.WindowManager) return null;
    var allIds = WindowManager.getAll();
    if (allIds.length === 0) return null;

    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    var viewW = window.innerWidth;
    var viewH = window.innerHeight;

    // Include viewport
    minX = 0; minY = 0; maxX = viewW; maxY = viewH;

    for (var i = 0; i < allIds.length; i++) {
      var win = WindowManager.getWindow(allIds[i]);
      if (!win) continue;
      minX = Math.min(minX, win.x);
      minY = Math.min(minY, win.y);
      maxX = Math.max(maxX, win.x + win.w);
      maxY = Math.max(maxY, win.y + win.h);
    }

    var pad = 40;
    minX -= pad; minY -= pad; maxX += pad; maxY += pad;
    var rangeW = maxX - minX || 1;
    var rangeH = maxY - minY || 1;

    // Maintain aspect ratio
    var aspect = MAP_W / MAP_H;
    var worldAspect = rangeW / rangeH;
    if (worldAspect > aspect) {
      var newH = rangeW / aspect;
      var dh = (newH - rangeH) / 2;
      minY -= dh;
      rangeH = newH;
    } else {
      var newW = rangeH * aspect;
      var dw = (newW - rangeW) / 2;
      minX -= dw;
      rangeW = newW;
    }

    return { minX: minX, minY: minY, rangeW: rangeW, rangeH: rangeH };
  }

  function render() {
    if (!ctx || !visible) return;

    var w = MAP_W;
    var h = MAP_H;
    ctx.clearRect(0, 0, w, h);

    // Background
    var bgStyle = getComputedStyle(document.documentElement).getPropertyValue('--mf-bg') || '#0d0d1a';
    ctx.fillStyle = bgStyle.trim();
    ctx.fillRect(0, 0, w, h);

    if (!window.WindowManager) return;
    var allIds = WindowManager.getAll();
    if (allIds.length === 0) {
      ctx.fillStyle = 'rgba(160,160,255,0.1)';
      ctx.font = '10px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('No windows', w / 2, h / 2 + 3);
      return;
    }

    var bounds = getBounds();
    if (!bounds) return;

    // Draw viewport rectangle
    var vx = (0 - bounds.minX) / bounds.rangeW * w;
    var vy = (0 - bounds.minY) / bounds.rangeH * h;
    var vw = window.innerWidth / bounds.rangeW * w;
    var vh = window.innerHeight / bounds.rangeH * h;
    ctx.strokeStyle = 'rgba(160,160,255,0.2)';
    ctx.lineWidth = 1;
    ctx.strokeRect(vx, vy, vw, vh);

    // Draw windows
    var accent = getComputedStyle(document.documentElement).getPropertyValue('--mf-accent') || '#a0a0ff';

    for (var i = 0; i < allIds.length; i++) {
      var win = WindowManager.getWindow(allIds[i]);
      if (!win) continue;

      var rx = (win.x - bounds.minX) / bounds.rangeW * w;
      var ry = (win.y - bounds.minY) / bounds.rangeH * h;
      var rw = win.w / bounds.rangeW * w;
      var rh = win.h / bounds.rangeH * h;

      // Clamp minimum size for visibility
      rw = Math.max(rw, 4);
      rh = Math.max(rh, 3);

      ctx.fillStyle = accent.trim();
      ctx.globalAlpha = win.minimized ? 0.15 : 0.3;
      ctx.fillRect(rx, ry, rw, rh);
      ctx.globalAlpha = 1;

      ctx.strokeStyle = accent.trim();
      ctx.globalAlpha = win.minimized ? 0.2 : 0.6;
      ctx.lineWidth = 0.5;
      ctx.strokeRect(rx, ry, rw, rh);
      ctx.globalAlpha = 1;
    }
  }

  function startUpdates() {
    if (updateTimer) return;
    updateTimer = setInterval(render, 500);
  }

  function stopUpdates() {
    if (updateTimer) {
      clearInterval(updateTimer);
      updateTimer = null;
    }
  }

  function show() {
    build();
    container.style.display = '';
    visible = true;
    render();
    startUpdates();
  }

  function hide() {
    visible = false;
    stopUpdates();
    if (container) container.style.display = 'none';
  }

  function toggle() {
    if (visible) hide(); else show();
  }

  function init() {
    build();
    show();
  }

  window.Minimap = {
    init: init,
    show: show,
    hide: hide,
    toggle: toggle,
    render: render
  };
})();
