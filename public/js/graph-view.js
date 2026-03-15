/* ============================================================
   Mini Frames — Graph View (Obsidian-style force-directed graph)
   Pure Canvas2D, no external dependencies.
   ============================================================ */
(function () {
  'use strict';

  /* --- Constants -------------------------------------------- */
  var REPULSION_K   = 5000;
  var SPRING_K      = 0.01;
  var CENTER_PULL   = 0.01;
  var DAMPING       = 0.85;
  var INITIAL_ITERS = 200;
  var SETTLE_THRESHOLD = 0.5;
  var NODE_RADIUS   = 8;
  var HOVER_RADIUS  = 12;
  var HIT_RADIUS    = 15;
  var HEADER_H      = 40;
  var LABEL_FONT    = '11px system-ui, "Segoe UI", sans-serif';

  function getThemeVar(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name);
    return v ? v.trim() : fallback;
  }
  function BG_COLOR()      { return getThemeVar('--mf-bg', '#0d0d1a'); }
  function EDGE_COLOR()    { return getThemeVar('--mf-border', 'rgba(160,160,255,0.15)'); }
  function LABEL_COLOR()   { return getThemeVar('--mf-muted', '#888'); }
  function FALLBACK_NODE() { return getThemeVar('--mf-accent', '#a0a0ff'); }
  function EDGE_HL_COLOR() { return getThemeVar('--mf-accent', 'rgba(160,160,255,0.6)'); }

  var GROUP_COLORS = {};
  var groupColorIndex = 0;

  function colorForGroup(group) {
    if (!group) return FALLBACK_NODE();
    if (GROUP_COLORS[group]) return GROUP_COLORS[group];
    var hue = (groupColorIndex * 47 + 210) % 360;
    groupColorIndex++;
    var c = 'hsl(' + hue + ',65%,65%)';
    GROUP_COLORS[group] = c;
    return c;
  }

  function brighten(color, amount) {
    // For hsl strings, bump lightness; for hex, lighten
    if (color.startsWith('hsl')) {
      return color.replace(/65%\)$/, (65 + amount) + '%)');
    }
    // hex fallback
    var r = parseInt(color.slice(1, 3), 16);
    var g = parseInt(color.slice(3, 5), 16);
    var b = parseInt(color.slice(5, 7), 16);
    r = Math.min(255, r + amount);
    g = Math.min(255, g + amount);
    b = Math.min(255, b + amount);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  /* --- State ------------------------------------------------ */
  var nodes = [];
  var edges = [];
  var nodeMap = {};
  var overlay = null;
  var canvas  = null;
  var ctx     = null;
  var animId  = null;
  var visible = false;

  // Pan & zoom
  var scale   = 1;
  var offsetX = 0;
  var offsetY = 0;
  var panning = false;
  var panStartX = 0;
  var panStartY = 0;
  var panOffsetX = 0;
  var panOffsetY = 0;

  // Hover & drag
  var hoveredNode = null;
  var draggedNode = null;
  var mouseX = 0;
  var mouseY = 0;

  // Simulation state
  var alpha = 1.0;      // temperature — decays toward 0
  var settled = false;   // true when simulation has converged

  /* --- DOM setup -------------------------------------------- */
  function buildDOM() {
    if (overlay) return;

    overlay = document.createElement('div');
    overlay.id = 'mf-graph-overlay';
    overlay.className = 'mf-graph-overlay';
    overlay.style.cssText =
      'display:none;position:fixed;inset:0;z-index:10000;' +
      'background:var(--mf-bg);opacity:0;transition:opacity 0.25s ease;' +
      'flex-direction:column;';

    var header = document.createElement('div');
    header.className = 'mf-graph-header';
    header.style.cssText =
      'height:' + HEADER_H + 'px;min-height:' + HEADER_H + 'px;' +
      'background:var(--mf-surface);display:flex;align-items:center;' +
      'justify-content:space-between;padding:0 14px;' +
      'border-bottom:1px solid rgba(255,255,255,0.06);user-select:none;';

    var title = document.createElement('span');
    title.textContent = 'Page Graph';
    title.style.cssText = 'color:var(--mf-text);font-size:13px;font-family:system-ui,"Segoe UI",sans-serif;';

    var closeBtn = document.createElement('button');
    closeBtn.className = 'mf-graph-close';
    closeBtn.textContent = '\u2715';
    closeBtn.style.cssText =
      'width:24px;height:24px;background:transparent;border:none;' +
      'color:var(--mf-muted);font-size:18px;line-height:24px;border-radius:4px;' +
      'cursor:pointer;display:flex;align-items:center;justify-content:center;' +
      'padding:0;transition:background 0.15s ease, color 0.15s ease;';
    closeBtn.addEventListener('mouseenter', function () {
      closeBtn.style.background = '#ff4757';
      closeBtn.style.color = '#fff';
    });
    closeBtn.addEventListener('mouseleave', function () {
      closeBtn.style.background = 'transparent';
      closeBtn.style.color = getThemeVar('--mf-muted', '#888');
    });
    closeBtn.addEventListener('click', hide);

    header.appendChild(title);
    header.appendChild(closeBtn);

    canvas = document.createElement('canvas');
    canvas.id = 'mf-graph-canvas';
    canvas.style.cssText = 'flex:1;width:100%;cursor:grab;';

    overlay.appendChild(header);
    overlay.appendChild(canvas);
    document.body.appendChild(overlay);

    ctx = canvas.getContext('2d');
    attachCanvasEvents();
  }

  /* --- Canvas event handlers -------------------------------- */
  function attachCanvasEvents() {
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('mouseleave', onMouseLeave);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('click', onClick);
  }

  function screenToWorld(sx, sy) {
    return {
      x: (sx - offsetX) / scale,
      y: (sy - offsetY) / scale
    };
  }

  function findNodeAt(sx, sy) {
    var w = screenToWorld(sx, sy);
    var best = null;
    var bestDist = HIT_RADIUS / scale;
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      var dx = n.x - w.x;
      var dy = n.y - w.y;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d < bestDist) {
        bestDist = d;
        best = n;
      }
    }
    return best;
  }

  function onMouseMove(e) {
    var rect = canvas.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;

    if (draggedNode) {
      var w = screenToWorld(mouseX, mouseY);
      draggedNode.x = w.x;
      draggedNode.y = w.y;
      draggedNode.vx = 0;
      draggedNode.vy = 0;
      canvas.style.cursor = 'grabbing';
      renderOnce();
      return;
    }

    if (panning) {
      offsetX = panOffsetX + (e.clientX - panStartX);
      offsetY = panOffsetY + (e.clientY - panStartY);
      canvas.style.cursor = 'grabbing';
      renderOnce();
      return;
    }

    var node = findNodeAt(mouseX, mouseY);
    hoveredNode = node;
    canvas.style.cursor = node ? 'pointer' : 'grab';
    renderOnce();
  }

  function onMouseDown(e) {
    if (e.button !== 0) return;
    clickStart = { x: e.clientX, y: e.clientY };
    var node = findNodeAt(mouseX, mouseY);
    if (node) {
      draggedNode = node;
      settled = false;
      alpha = Math.max(alpha, 0.3);
      canvas.style.cursor = 'grabbing';
    } else {
      panning = true;
      panStartX = e.clientX;
      panStartY = e.clientY;
      panOffsetX = offsetX;
      panOffsetY = offsetY;
      canvas.style.cursor = 'grabbing';
    }
  }

  function onMouseUp() {
    if (draggedNode) {
      draggedNode = null;
    }
    panning = false;
    canvas.style.cursor = hoveredNode ? 'pointer' : 'grab';
  }

  function onMouseLeave() {
    draggedNode = null;
    panning = false;
    hoveredNode = null;
  }

  function onWheel(e) {
    e.preventDefault();
    var zoomFactor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    var newScale = Math.max(0.1, Math.min(5, scale * zoomFactor));

    // Zoom toward cursor position
    offsetX = mouseX - (mouseX - offsetX) * (newScale / scale);
    offsetY = mouseY - (mouseY - offsetY) * (newScale / scale);
    scale = newScale;
    renderOnce();
  }

  var clickStart = null;

  function onClick(e) {
    if (!hoveredNode) return;
    // Don't navigate if user was dragging
    if (clickStart) {
      var dx = e.clientX - clickStart.x;
      var dy = e.clientY - clickStart.y;
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) return;
    }
    var id = hoveredNode.id;
    hide();
    if (window.WindowManager && window.WindowManager.bringToFront) {
      window.WindowManager.bringToFront(id);
    }
  }

  /* --- Data fetching ---------------------------------------- */
  async function fetchGraphData() {
    nodes = [];
    edges = [];
    nodeMap = {};
    groupColorIndex = 0;

    var pages = [];
    try {
      var res = await fetch('/api/pages');
      pages = await res.json();
    } catch (_) {
      return;
    }

    // Build node for each page
    for (var i = 0; i < pages.length; i++) {
      var id = pages[i].replace('.html', '');
      var node = {
        id: id,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        group: '',
        tags: []
      };
      nodes.push(node);
      nodeMap[id] = node;
    }

    // Attempt to fetch metadata (may not exist)
    var meta = null;
    try {
      var mres = await fetch('/api/metadata');
      if (mres.ok) {
        meta = await mres.json();
      }
    } catch (_) {
      // metadata endpoint unavailable — continue without it
    }

    if (meta) {
      for (var id in meta) {
        if (!meta.hasOwnProperty(id)) continue;
        var info = meta[id];
        var node = nodeMap[id];
        if (node) {
          node.group = info.group || '';
          node.tags = info.tags || [];
        }
        // Build edges from links
        var links = info.links || [];
        for (var j = 0; j < links.length; j++) {
          var targetId = links[j].replace('.html', '');
          if (nodeMap[targetId]) {
            edges.push({ source: id, target: targetId });
          }
        }
      }
    }

    // Randomize initial positions in a circle
    var cx = canvas.width / 2;
    var cy = (canvas.height - HEADER_H) / 2;
    var spread = Math.min(cx, cy) * 0.6;
    for (var i = 0; i < nodes.length; i++) {
      var angle = (2 * Math.PI * i) / nodes.length;
      nodes[i].x = cx + Math.cos(angle) * spread + (Math.random() - 0.5) * 40;
      nodes[i].y = cy + Math.sin(angle) * spread + (Math.random() - 0.5) * 40;
    }
  }

  /* --- Force-directed layout -------------------------------- */
  function simulate(iterations) {
    var cx = canvas.width / 2;
    var cy = canvas.height / 2;

    for (var iter = 0; iter < iterations; iter++) {
      // Repulsion between all pairs
      for (var i = 0; i < nodes.length; i++) {
        for (var j = i + 1; j < nodes.length; j++) {
          var a = nodes[i];
          var b = nodes[j];
          var dx = a.x - b.x;
          var dy = a.y - b.y;
          var dist = Math.sqrt(dx * dx + dy * dy) || 1;
          var force = REPULSION_K / (dist * dist) * alpha;
          var fx = (dx / dist) * force;
          var fy = (dy / dist) * force;
          a.vx += fx;
          a.vy += fy;
          b.vx -= fx;
          b.vy -= fy;
        }
      }

      // Attraction along edges
      for (var e = 0; e < edges.length; e++) {
        var edge = edges[e];
        var src = nodeMap[edge.source];
        var tgt = nodeMap[edge.target];
        if (!src || !tgt) continue;
        var dx = tgt.x - src.x;
        var dy = tgt.y - src.y;
        var dist = Math.sqrt(dx * dx + dy * dy) || 1;
        var force = dist * SPRING_K * alpha;
        var fx = (dx / dist) * force;
        var fy = (dy / dist) * force;
        src.vx += fx;
        src.vy += fy;
        tgt.vx -= fx;
        tgt.vy -= fy;
      }

      // Center gravity
      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        var dx = cx - n.x;
        var dy = cy - n.y;
        n.vx += dx * CENTER_PULL * alpha;
        n.vy += dy * CENTER_PULL * alpha;
      }

      // Damping & position update
      var totalV = 0;
      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        if (n === draggedNode) {
          n.vx = 0; n.vy = 0;
          continue;
        }
        n.vx *= DAMPING;
        n.vy *= DAMPING;
        n.x += n.vx;
        n.y += n.vy;
        totalV += Math.abs(n.vx) + Math.abs(n.vy);
      }

      // Decay alpha
      alpha *= 0.995;

      // Check convergence
      if (totalV < SETTLE_THRESHOLD && alpha < 0.01) {
        settled = true;
        alpha = 0;
        break;
      }
    }
  }

  /* --- Rendering -------------------------------------------- */
  function render() {
    if (!visible) return;

    // Only simulate if not settled
    if (!settled) {
      simulate(1);
    }

    var w = canvas.width;
    var h = canvas.height;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = BG_COLOR();
    ctx.fillRect(0, 0, w, h);

    // Handle empty state
    if (nodes.length === 0) {
      ctx.fillStyle = 'rgba(224,224,255,0.12)';
      ctx.font = '16px system-ui, "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No pages', w / 2, h / 2);
      return;
    }

    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    // Build adjacency set for hovered node
    var hlEdges = {};
    var hlNodes = {};
    if (hoveredNode) {
      hlNodes[hoveredNode.id] = true;
      for (var e = 0; e < edges.length; e++) {
        var edge = edges[e];
        if (edge.source === hoveredNode.id || edge.target === hoveredNode.id) {
          hlEdges[e] = true;
          hlNodes[edge.source] = true;
          hlNodes[edge.target] = true;
        }
      }
    }

    // Draw edges
    for (var e = 0; e < edges.length; e++) {
      var edge = edges[e];
      var src = nodeMap[edge.source];
      var tgt = nodeMap[edge.target];
      if (!src || !tgt) continue;

      var highlighted = hlEdges[e];
      ctx.beginPath();
      ctx.moveTo(src.x, src.y);
      ctx.lineTo(tgt.x, tgt.y);
      ctx.strokeStyle = highlighted ? EDGE_HL_COLOR() : EDGE_COLOR();
      ctx.lineWidth = highlighted ? 2.5 / scale : 1.5 / scale;
      ctx.stroke();
    }

    // Draw nodes
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      var isHovered = hoveredNode && n.id === hoveredNode.id;
      var isConnected = hoveredNode && hlNodes[n.id];
      var r = isHovered ? HOVER_RADIUS : NODE_RADIUS;
      var fillColor = colorForGroup(n.group);

      ctx.beginPath();
      ctx.arc(n.x, n.y, r / scale, 0, Math.PI * 2);

      if (isHovered) {
        ctx.fillStyle = brighten(fillColor, 40);
        ctx.strokeStyle = brighten(fillColor, 70);
        ctx.lineWidth = 2.5 / scale;
      } else if (isConnected) {
        ctx.fillStyle = brighten(fillColor, 20);
        ctx.strokeStyle = brighten(fillColor, 50);
        ctx.lineWidth = 2 / scale;
      } else {
        ctx.fillStyle = fillColor;
        ctx.strokeStyle = brighten(fillColor, 30);
        ctx.lineWidth = 1.5 / scale;
      }

      ctx.fill();
      ctx.stroke();
    }

    // Draw labels
    ctx.font = (11 / scale) + 'px system-ui, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      var isHovered = hoveredNode && n.id === hoveredNode.id;
      ctx.fillStyle = isHovered ? getThemeVar('--mf-text', '#e0e0ff') : LABEL_COLOR();
      ctx.fillText(n.id, n.x, n.y + (NODE_RADIUS + 14) / scale);
    }

    // Tooltip for hovered node
    if (hoveredNode) {
      var tooltipLines = [hoveredNode.id];
      if (hoveredNode.group) tooltipLines.push('group: ' + hoveredNode.group);
      if (hoveredNode.tags && hoveredNode.tags.length) {
        tooltipLines.push('tags: ' + hoveredNode.tags.join(', '));
      }

      ctx.restore(); // draw tooltip in screen space
      ctx.save();

      var tipX = mouseX + 16;
      var tipY = mouseY - 10;
      var lineH = 16;
      var tipW = 0;

      ctx.font = '12px system-ui, "Segoe UI", sans-serif';
      for (var t = 0; t < tooltipLines.length; t++) {
        var mw = ctx.measureText(tooltipLines[t]).width;
        if (mw > tipW) tipW = mw;
      }
      tipW += 16;
      var tipH = tooltipLines.length * lineH + 10;

      // Keep tooltip on-screen
      if (tipX + tipW > w) tipX = mouseX - tipW - 8;
      if (tipY + tipH > h) tipY = h - tipH - 4;
      if (tipY < 0) tipY = 4;

      ctx.fillStyle = 'rgba(22,22,46,0.92)';
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.lineWidth = 1;
      roundRect(ctx, tipX, tipY, tipW, tipH, 6);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#e0e0ff';
      ctx.textAlign = 'left';
      for (var t = 0; t < tooltipLines.length; t++) {
        ctx.fillText(tooltipLines[t], tipX + 8, tipY + 15 + t * lineH);
      }

      ctx.restore();
    } else {
      ctx.restore();
    }

    // Keep animating while simulating or dragging
    if (!settled || draggedNode) {
      animId = requestAnimationFrame(render);
    } else {
      animId = null;
    }
  }

  function renderOnce() {
    if (visible && !animId) {
      animId = requestAnimationFrame(render);
    }
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  /* --- Resize handling -------------------------------------- */
  function resizeCanvas() {
    if (!canvas || !visible) return;
    canvas.width = overlay.clientWidth;
    canvas.height = overlay.clientHeight - HEADER_H;
  }

  /* --- Public API ------------------------------------------- */
  function init() {
    buildDOM();
    window.addEventListener('resize', resizeCanvas);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && visible) hide();
    });
    document.addEventListener('mf-toggle-graph', function () {
      toggle();
    });
  }

  async function show() {
    buildDOM();
    overlay.style.display = 'flex';
    // Force reflow before transition
    void overlay.offsetHeight;
    overlay.style.opacity = '1';
    visible = true;

    resizeCanvas();

    // Reset view transform
    scale = 1;
    offsetX = 0;
    offsetY = 0;
    hoveredNode = null;
    alpha = 1.0;
    settled = false;

    await fetchGraphData();
    simulate(INITIAL_ITERS);

    if (animId) cancelAnimationFrame(animId);
    animId = requestAnimationFrame(render);
  }

  function hide() {
    visible = false;
    if (animId) {
      cancelAnimationFrame(animId);
      animId = null;
    }
    if (overlay) {
      overlay.style.opacity = '0';
      setTimeout(function () {
        if (!visible) overlay.style.display = 'none';
      }, 250);
    }
  }

  function toggle() {
    if (visible) {
      hide();
    } else {
      show();
    }
  }

  function isVisible() {
    return visible;
  }

  /* --- Expose ----------------------------------------------- */
  window.GraphView = {
    init: init,
    show: show,
    hide: hide,
    toggle: toggle,
    isVisible: isVisible
  };
})();
