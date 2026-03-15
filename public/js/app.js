// --- Toast notification system ---
(function() {
  var TOAST_DURATION = 4000;
  var container = null;

  var TOAST_COLORS = {
    success: { bg: 'rgba(34,197,94,0.15)', border: 'rgba(34,197,94,0.4)', color: '#4ade80' },
    error:   { bg: 'rgba(239,68,68,0.15)', border: 'rgba(239,68,68,0.4)', color: '#f87171' },
    warn:    { bg: 'rgba(234,179,8,0.15)',  border: 'rgba(234,179,8,0.4)',  color: '#facc15' },
    info:    { bg: 'rgba(96,165,250,0.15)', border: 'rgba(96,165,250,0.4)', color: '#93c5fd' }
  };

  function getContainer() {
    if (!container) {
      container = document.createElement('div');
      container.id = 'mf-toast-container';
      container.style.cssText = 'position:fixed;top:12px;right:12px;z-index:99999;display:flex;flex-direction:column;gap:8px;pointer-events:none;max-width:360px;';
      document.body.appendChild(container);
    }
    return container;
  }

  function showToast(message, type) {
    var colors = TOAST_COLORS[type] || TOAST_COLORS.info;
    var toast = document.createElement('div');
    toast.style.cssText = 'pointer-events:auto;padding:10px 16px;border-radius:8px;font-family:system-ui,-apple-system,sans-serif;font-size:13px;cursor:pointer;opacity:0;transform:translateX(20px);transition:opacity 0.25s ease,transform 0.25s ease;backdrop-filter:blur(8px);'
      + 'background:' + colors.bg + ';border:1px solid ' + colors.border + ';color:' + colors.color + ';';
    toast.textContent = message;
    toast.addEventListener('click', function() { removeToast(toast); });
    getContainer().appendChild(toast);

    // Trigger enter animation
    requestAnimationFrame(function() {
      toast.style.opacity = '1';
      toast.style.transform = 'translateX(0)';
    });

    // Auto-dismiss
    setTimeout(function() { removeToast(toast); }, TOAST_DURATION);
  }

  function removeToast(toast) {
    if (!toast.parentNode) return;
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    setTimeout(function() {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 250);
  }

  // Listen for postMessage from iframes
  window.addEventListener('message', function(event) {
    if (event.data && event.data.mfAction === 'notify') {
      showToast(event.data.message || '', event.data.type || 'info');
    }
    // Also handle existing 'close' action
    if (event.data && event.data.mfAction === 'close' && event.data.pageId) {
      if (window.WindowManager) WindowManager.close(event.data.pageId);
    }
  });
})();

// --- Parent theme system ---
(function() {
  var THEME_PRESETS = {
    dark: {
      '--mf-bg': '#0d0d1a', '--mf-surface': '#16162e', '--mf-text': '#e0e0ff',
      '--mf-muted': '#888899', '--mf-accent': '#a0a0ff',
      '--mf-border': 'rgba(160,160,255,0.12)', '--mf-input-bg': 'rgba(160,160,255,0.06)',
      '--mf-success': '#4ade80', '--mf-error': '#f87171', '--mf-warn': '#facc15'
    },
    light: {
      '--mf-bg': '#f0f0f5', '--mf-surface': '#ffffff', '--mf-text': '#1a1a2e',
      '--mf-muted': '#666680', '--mf-accent': '#5b5bff',
      '--mf-border': 'rgba(0,0,0,0.1)', '--mf-input-bg': 'rgba(0,0,0,0.04)',
      '--mf-success': '#16a34a', '--mf-error': '#dc2626', '--mf-warn': '#ca8a04'
    },
    midnight: {
      '--mf-bg': '#0a0a14', '--mf-surface': '#0f0f20', '--mf-text': '#c0c0e0',
      '--mf-muted': '#555570', '--mf-accent': '#7b68ee',
      '--mf-border': 'rgba(123,104,238,0.15)', '--mf-input-bg': 'rgba(123,104,238,0.06)',
      '--mf-success': '#34d399', '--mf-error': '#fb7185', '--mf-warn': '#fbbf24'
    }
  };

  function applyParentTheme(name) {
    var vars = THEME_PRESETS[name];
    if (!vars) return;
    var root = document.documentElement;
    var keys = Object.keys(vars);
    for (var i = 0; i < keys.length; i++) {
      root.style.setProperty(keys[i], vars[keys[i]]);
    }
    window._mfCurrentTheme = name;
  }

  // Load saved theme on startup
  fetch('/api/store/_mf_theme')
    .then(function(r) { return r.json(); })
    .then(function(saved) {
      if (saved && THEME_PRESETS[saved]) {
        applyParentTheme(saved);
      }
    })
    .catch(function() {});

  // Listen for theme changes from iframes
  window.addEventListener('message', function(event) {
    if (event.data && event.data.mfAction === 'theme-change' && event.data.theme) {
      applyParentTheme(event.data.theme);
    }
  });

  // Expose for sidebar theme picker
  window._mfApplyTheme = function(name) {
    applyParentTheme(name);
    fetch('/api/store/_mf_theme', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(name)
    }).catch(function() {});
  };
  window._mfThemeList = Object.keys(THEME_PRESETS);
})();

// --- Keyboard shortcuts ---
(function() {
  var fullscreenActive = false;
  var fullscreenPageId = null;
  var hiddenElements = [];

  document.addEventListener('keydown', function(e) {
    // Escape exits fullscreen
    if (e.key === 'Escape' && fullscreenActive) {
      e.preventDefault();
      exitFullscreen();
      return;
    }

    // Don't trigger if user is typing in an input
    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;

    // Ctrl+T — Tile all windows
    if (e.ctrlKey && !e.shiftKey && e.key === 't') {
      e.preventDefault();
      if (window.WindowManager) WindowManager.tile();
      return;
    }

    // Ctrl+G — Toggle graph view
    if (e.ctrlKey && !e.shiftKey && e.key === 'g') {
      e.preventDefault();
      document.dispatchEvent(new CustomEvent('mf-toggle-graph'));
      return;
    }

    // Ctrl+B — Toggle sidebar
    if (e.ctrlKey && !e.shiftKey && e.key === 'b') {
      e.preventDefault();
      if (window.Sidebar) Sidebar.toggle();
      return;
    }

    // Ctrl+Shift+D — Toggle debug console
    if (e.ctrlKey && e.shiftKey && e.key === 'D') {
      e.preventDefault();
      if (window.WindowManager) {
        var debugId = 'mf-debug';
        var existing = WindowManager.getWindow(debugId);
        if (existing) {
          WindowManager.close(debugId);
        } else {
          WindowManager.create(debugId, 'mf-debug.html', '/pages/mf-debug.html');
        }
      }
      return;
    }

    // F11 or Ctrl+Shift+F — Toggle fullscreen focus mode
    if (e.key === 'F11' || (e.ctrlKey && e.shiftKey && e.key === 'F')) {
      e.preventDefault();
      toggleFullscreen();
      return;
    }
  });

  function toggleFullscreen() {
    if (fullscreenActive) {
      exitFullscreen();
    } else {
      enterFullscreen();
    }
  }

  function enterFullscreen() {
    if (!window.WindowManager) return;

    // Find the topmost (focused) window
    var allIds = WindowManager.getAll();
    if (allIds.length === 0) return;

    var topId = null;
    var topZ = -1;
    for (var i = 0; i < allIds.length; i++) {
      var win = WindowManager.getWindow(allIds[i]);
      if (win && win.el) {
        var z = parseInt(win.el.style.zIndex, 10) || 0;
        if (z > topZ) { topZ = z; topId = allIds[i]; }
      }
    }
    if (!topId) return;

    fullscreenActive = true;
    fullscreenPageId = topId;
    hiddenElements = [];

    // Hide sidebar
    var sidebar = document.getElementById('mf-sidebar');
    var sidebarToggle = document.getElementById('mf-sidebar-toggle');
    if (sidebar) { sidebar.style.display = 'none'; hiddenElements.push(sidebar); }
    if (sidebarToggle) { sidebarToggle.style.display = 'none'; hiddenElements.push(sidebarToggle); }


    // Hide all windows except the focused one
    for (var j = 0; j < allIds.length; j++) {
      if (allIds[j] !== topId) {
        var w = WindowManager.getWindow(allIds[j]);
        if (w && w.el) {
          w.el.style.display = 'none';
          hiddenElements.push(w.el);
        }
      }
    }

    // Make the focused window fill the viewport
    var focusWin = WindowManager.getWindow(topId);
    if (focusWin && focusWin.el) {
      var el = focusWin.el;
      el._fsBackup = {
        left: el.style.left, top: el.style.top,
        width: el.style.width, height: el.style.height,
        borderRadius: el.style.borderRadius
      };
      el.style.left = '0';
      el.style.top = '0';
      el.style.width = '100vw';
      el.style.height = '100vh';
      el.style.borderRadius = '0';
    }
  }

  function exitFullscreen() {
    fullscreenActive = false;

    // Restore the focused window
    if (fullscreenPageId && window.WindowManager) {
      var focusWin = WindowManager.getWindow(fullscreenPageId);
      if (focusWin && focusWin.el && focusWin.el._fsBackup) {
        var el = focusWin.el;
        var b = el._fsBackup;
        el.style.left = b.left;
        el.style.top = b.top;
        el.style.width = b.width;
        el.style.height = b.height;
        el.style.borderRadius = b.borderRadius;
        delete el._fsBackup;
      }
    }

    // Show everything back
    for (var i = 0; i < hiddenElements.length; i++) {
      hiddenElements[i].style.display = '';
    }
    hiddenElements = [];
    fullscreenPageId = null;
  }
})();

// --- Window control message handler ---
(function() {
  window.addEventListener('message', function(event) {
    if (!event.data || !event.data.mfAction || !window.WindowManager) return;
    var d = event.data;
    var id = d.pageId;
    if (!id) return;

    switch (d.mfAction) {
      case 'win-resize':
        var el = WindowManager.getWindow(id);
        if (el && el.el) {
          if (d.width) el.el.style.width = d.width + 'px';
          if (d.height) el.el.style.height = (d.height + 36) + 'px'; // +36 for titlebar
        }
        break;
      case 'win-move':
        var el = WindowManager.getWindow(id);
        if (el && el.el) {
          if (d.x !== undefined) el.el.style.left = d.x + 'px';
          if (d.y !== undefined) el.el.style.top = d.y + 'px';
        }
        break;
      case 'win-title':
        var el = WindowManager.getWindow(id);
        if (el && el.el) {
          var titleSpan = el.el.querySelector('.mf-title');
          if (titleSpan) titleSpan.textContent = d.title || id;
        }
        break;
      case 'win-minimize':
        WindowManager.minimize(id);
        break;
      case 'win-maximize':
        WindowManager.maximize(id);
        break;
      case 'win-focus':
        WindowManager.bringToFront(id);
        break;
    }
  });
})();

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await WindowManager.init();

    const res = await fetch('/api/pages');
    const pages = await res.json();

    for (const filename of pages) {
      const id = filename.replace('.html', '');
      WindowManager.create(id, filename, '/pages/' + filename);
    }

    if (window.Sidebar) await Sidebar.init();
    if (window.GraphView) GraphView.init();


    HotReload.connect();
  } catch (err) {
    console.error('Failed to load pages:', err);
  }
});
