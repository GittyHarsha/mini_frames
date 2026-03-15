/**
 * MiniFrames SDK — drop-in client library for pages.
 *
 * Usage inside a page:
 *   <script src="/js/mf-sdk.js"></script>
 *   <script>
 *     mf.ready(async () => {
 *       const data = await mf.storage.get();
 *       mf.bus.on('update', (payload, from) => { ... });
 *     });
 *   </script>
 */
(function () {
  'use strict';

  var PAGE_ID = location.pathname.replace(/^\/pages\//, '').replace(/\.html$/, '');
  var ws = null;
  var listeners = {};       // channel -> [callback]
  var storeListeners = [];  // [(key, value, type) => void]
  var metadataListeners = []; // [(pageId, metadata) => void]
  var readyCallbacks = [];
  var connected = false;

  // --- Theme system ---
  var themeListeners = [];
  var currentTheme = 'dark';

  var THEME_PRESETS = {
    dark: {
      '--mf-bg': '#0d0d1a',
      '--mf-surface': '#16162e',
      '--mf-text': '#e0e0ff',
      '--mf-muted': '#888899',
      '--mf-accent': '#a0a0ff',
      '--mf-border': 'rgba(160,160,255,0.12)',
      '--mf-input-bg': 'rgba(160,160,255,0.06)',
      '--mf-success': '#4ade80',
      '--mf-error': '#f87171',
      '--mf-warn': '#facc15'
    },
    light: {
      '--mf-bg': '#f0f0f5',
      '--mf-surface': '#ffffff',
      '--mf-text': '#1a1a2e',
      '--mf-muted': '#666680',
      '--mf-accent': '#5b5bff',
      '--mf-border': 'rgba(0,0,0,0.1)',
      '--mf-input-bg': 'rgba(0,0,0,0.04)',
      '--mf-success': '#16a34a',
      '--mf-error': '#dc2626',
      '--mf-warn': '#ca8a04'
    },
    midnight: {
      '--mf-bg': '#0a0a14',
      '--mf-surface': '#0f0f20',
      '--mf-text': '#c0c0e0',
      '--mf-muted': '#555570',
      '--mf-accent': '#7b68ee',
      '--mf-border': 'rgba(123,104,238,0.15)',
      '--mf-input-bg': 'rgba(123,104,238,0.06)',
      '--mf-success': '#34d399',
      '--mf-error': '#fb7185',
      '--mf-warn': '#fbbf24'
    }
  };

  function applyThemeVars(themeName) {
    var vars = THEME_PRESETS[themeName];
    if (!vars) return;
    currentTheme = themeName;
    var root = document.documentElement;
    var keys = Object.keys(vars);
    for (var i = 0; i < keys.length; i++) {
      root.style.setProperty(keys[i], vars[keys[i]]);
    }
    injectScrollbarStyles(vars);
  }

  var _scrollbarStyleEl = null;
  function injectScrollbarStyles(vars) {
    if (!_scrollbarStyleEl) {
      _scrollbarStyleEl = document.createElement('style');
      _scrollbarStyleEl.id = 'mf-scrollbar-theme';
      document.head.appendChild(_scrollbarStyleEl);
    }
    _scrollbarStyleEl.textContent =
      '* { scrollbar-width: thin; scrollbar-color: ' + (vars['--mf-muted'] || '#888') + ' transparent; }' +
      '::-webkit-scrollbar { width: 8px; height: 8px; }' +
      '::-webkit-scrollbar-track { background: transparent; }' +
      '::-webkit-scrollbar-thumb { background: ' + (vars['--mf-border'] || 'rgba(160,160,255,0.12)') + '; border-radius: 4px; }' +
      '::-webkit-scrollbar-thumb:hover { background: ' + (vars['--mf-muted'] || '#888') + '; }' +
      '::-webkit-scrollbar-corner { background: transparent; }';
  }

  function notifyThemeListeners(themeName) {
    for (var i = 0; i < themeListeners.length; i++) {
      try { themeListeners[i](themeName, THEME_PRESETS[themeName]); } catch (e) { console.error('[mf.theme]', e); }
    }
  }

  // --- WebSocket connection ---

  var _reconnectDelay = 2000;
  var _reconnectMax = 30000;
  var _msgIdCounter = 0;
  var _pendingAcks = {};  // msgId -> { resolve, reject, timer }
  var storageListeners = []; // [(pageId) => void]

  function _nextMsgId() { return PAGE_ID + ':' + (++_msgIdCounter); }

  function connect() {
    ws = new WebSocket('ws://' + location.host);

    ws.addEventListener('open', function () {
      connected = true;
      _reconnectDelay = 2000; // reset backoff on success
      ws.send(JSON.stringify({ type: 'register', pageId: PAGE_ID }));

      // Sync state before firing ready callbacks
      var themeReady = fetch('/api/store/_mf_theme').then(function(r) { return r.json(); }).then(function(saved) {
        if (saved && THEME_PRESETS[saved]) {
          applyThemeVars(saved);
          notifyThemeListeners(saved);
        } else {
          applyThemeVars('dark');
        }
      }).catch(function() { applyThemeVars('dark'); });

      themeReady.then(function() { runReady(); });
    });

    ws.addEventListener('message', function (event) {
      var msg;
      try { msg = JSON.parse(event.data); } catch (e) { return; }

      // Bus ACK from server
      if (msg.type === 'bus-ack' && msg._id && _pendingAcks[msg._id]) {
        var pending = _pendingAcks[msg._id];
        clearTimeout(pending.timer);
        delete _pendingAcks[msg._id];
        pending.resolve({ delivered: msg.delivered, count: msg.count });
        return;
      }

      // Inter-frame message
      if ((msg.type === 'msg' || msg.type === 'broadcast') && msg.channel) {
        var cbs = listeners[msg.channel];
        if (cbs) {
          for (var i = 0; i < cbs.length; i++) {
            try { cbs[i](msg.payload, msg.from); } catch (e) { console.error('[mf.bus]', e); }
          }
        }
      }

      // Shared store updates
      if (msg.type === 'store-update' || msg.type === 'store-delete' || msg.type === 'store-clear') {
        for (var j = 0; j < storeListeners.length; j++) {
          try { storeListeners[j](msg.key || null, msg.value || null, msg.type); } catch (e) { console.error('[mf.store]', e); }
        }
        // Theme sync
        if (msg.type === 'store-update' && msg.key === '_mf_theme' && msg.value && THEME_PRESETS[msg.value]) {
          applyThemeVars(msg.value);
          notifyThemeListeners(msg.value);
        }
      }

      // Per-page storage change notifications
      if (msg.type === 'storage-update' && msg.pageId) {
        for (var s = 0; s < storageListeners.length; s++) {
          try { storageListeners[s](msg.pageId); } catch (e) { console.error('[mf.storage]', e); }
        }
      }

      // Metadata updates
      if (msg.type === 'metadata-update') {
        for (var k = 0; k < metadataListeners.length; k++) {
          try { metadataListeners[k](msg.pageId, msg.metadata); } catch (e) { console.error('[mf.meta]', e); }
        }
      }
    });

    ws.addEventListener('close', function () {
      connected = false;
      // Exponential backoff: 2s → 4s → 8s → ... → 30s max
      setTimeout(connect, _reconnectDelay);
      _reconnectDelay = Math.min(_reconnectDelay * 2, _reconnectMax);
    });

    ws.addEventListener('error', function () {
      ws.close();
    });
  }

  function runReady() {
    while (readyCallbacks.length) {
      var cb = readyCallbacks.shift();
      try { cb(); } catch (e) { console.error('[mf.ready]', e); }
    }
  }

  // --- Public API ---

  var mf = {
    /** Page identity */
    page: {
      get id() { return PAGE_ID; },
      get title() { return document.title; },
      meta: function (data) {
        if (data === undefined) {
          return fetch('/api/metadata/' + PAGE_ID).then(function (r) { return r.json(); });
        }
        return fetch('/api/metadata/' + PAGE_ID, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        }).then(function (r) { return r.json(); });
      },
      linkTo: function (targetPageId) {
        return fetch('/api/metadata/' + PAGE_ID).then(function (r) { return r.json(); }).then(function (meta) {
          var links = meta.links || [];
          if (links.indexOf(targetPageId) === -1) links.push(targetPageId);
          meta.links = links;
          return fetch('/api/metadata/' + PAGE_ID, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(meta)
          });
        }).then(function (r) { return r.json(); });
      },
      setTags: function (tags) {
        return fetch('/api/metadata/' + PAGE_ID).then(function (r) { return r.json(); }).then(function (meta) {
          meta.tags = tags;
          return fetch('/api/metadata/' + PAGE_ID, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(meta)
          });
        }).then(function (r) { return r.json(); });
      },
      setGroup: function (group) {
        return fetch('/api/metadata/' + PAGE_ID).then(function (r) { return r.json(); }).then(function (meta) {
          meta.group = group;
          return fetch('/api/metadata/' + PAGE_ID, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(meta)
          });
        }).then(function (r) { return r.json(); });
      },
      close: function () {
        fetch('/api/storage/_window-layout').then(function (r) { return r.json(); }).then(function (layout) {
          delete layout[PAGE_ID];
          return fetch('/api/storage/_window-layout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(layout)
          });
        }).catch(function () {});
        // Ask parent to close us
        window.parent.postMessage({ mfAction: 'close', pageId: PAGE_ID }, location.origin);
      }
    },

    /** Control this page's parent window frame */
    win: {
      resize: function (w, h) {
        window.parent.postMessage({ mfAction: 'win-resize', pageId: PAGE_ID, width: w, height: h }, location.origin);
      },
      move: function (x, y) {
        window.parent.postMessage({ mfAction: 'win-move', pageId: PAGE_ID, x: x, y: y }, location.origin);
      },
      setTitle: function (text) {
        window.parent.postMessage({ mfAction: 'win-title', pageId: PAGE_ID, title: text }, location.origin);
      },
      minimize: function () {
        window.parent.postMessage({ mfAction: 'win-minimize', pageId: PAGE_ID }, location.origin);
      },
      maximize: function () {
        window.parent.postMessage({ mfAction: 'win-maximize', pageId: PAGE_ID }, location.origin);
      },
      focus: function () {
        window.parent.postMessage({ mfAction: 'win-focus', pageId: PAGE_ID }, location.origin);
      },
      getSize: function () {
        return { width: window.innerWidth, height: window.innerHeight };
      },
      onResize: function (callback) {
        window.addEventListener('resize', function () {
          callback({ width: window.innerWidth, height: window.innerHeight });
        });
      }
    },

    /** Per-page persistent storage */
    storage: {
      get: function () {
        return fetch('/api/storage/' + PAGE_ID).then(function (r) { return r.json(); });
      },
      set: function (data) {
        return fetch('/api/storage/' + PAGE_ID, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        }).then(function (r) { return r.json(); });
      },
      delete: function () {
        return fetch('/api/storage/' + PAGE_ID, { method: 'DELETE' }).then(function (r) { return r.json(); });
      },
      onChange: function (callback) {
        storageListeners.push(callback);
      }
    },

    /** Inter-frame message bus (returns promise with delivery status) */
    bus: {
      send: function (targetPageId, channel, payload) {
        if (!ws || !connected) return Promise.resolve({ delivered: false, error: 'disconnected' });
        var id = _nextMsgId();
        ws.send(JSON.stringify({
          type: 'msg',
          _id: id,
          from: PAGE_ID,
          to: targetPageId,
          channel: channel,
          payload: payload
        }));
        return new Promise(function(resolve) {
          var timer = setTimeout(function() {
            delete _pendingAcks[id];
            resolve({ delivered: false, error: 'timeout' });
          }, 5000);
          _pendingAcks[id] = { resolve: resolve, timer: timer };
        });
      },
      broadcast: function (channel, payload) {
        if (!ws || !connected) return Promise.resolve({ delivered: false, error: 'disconnected' });
        var id = _nextMsgId();
        ws.send(JSON.stringify({
          type: 'broadcast',
          _id: id,
          from: PAGE_ID,
          channel: channel,
          payload: payload
        }));
        return new Promise(function(resolve) {
          var timer = setTimeout(function() {
            delete _pendingAcks[id];
            resolve({ delivered: false, error: 'timeout' });
          }, 5000);
          _pendingAcks[id] = { resolve: resolve, timer: timer };
        });
      },
      on: function (channel, callback) {
        if (!listeners[channel]) listeners[channel] = [];
        listeners[channel].push(callback);
      },
      off: function (channel, callback) {
        if (!listeners[channel]) return;
        if (!callback) { delete listeners[channel]; return; }
        listeners[channel] = listeners[channel].filter(function (cb) { return cb !== callback; });
      }
    },

    /** Global shared store (reactive, synced across all frames) */
    store: {
      getAll: function () {
        return fetch('/api/store').then(function (r) { return r.json(); });
      },
      get: function (key) {
        return fetch('/api/store/' + key).then(function (r) { return r.json(); });
      },
      set: function (key, value) {
        return fetch('/api/store/' + key, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(value)
        }).then(function (r) { return r.json(); });
      },
      delete: function (key) {
        return fetch('/api/store/' + key, { method: 'DELETE' }).then(function (r) { return r.json(); });
      },
      clear: function () {
        return fetch('/api/store', { method: 'DELETE' }).then(function (r) { return r.json(); });
      },
      onChange: function (callback) {
        storeListeners.push(callback);
      }
    },

    /** Listen for metadata changes across all pages */
    onMetadataChange: function (callback) {
      metadataListeners.push(callback);
    },

    /** Show a toast notification in the parent frame */
    notify: function(message, type) {
      window.parent.postMessage({
        mfAction: 'notify',
        message: message,
        type: type || 'info'
      }, location.origin);
    },

    /** Theme system — presets + CSS custom properties */
    theme: {
      get: function () { return currentTheme; },
      set: function (name) {
        if (!THEME_PRESETS[name]) {
          console.warn('[mf.theme] Unknown theme: ' + name + '. Available: ' + Object.keys(THEME_PRESETS).join(', '));
          return Promise.resolve();
        }
        applyThemeVars(name);
        notifyThemeListeners(name);
        // Persist and broadcast via shared store
        window.parent.postMessage({ mfAction: 'theme-change', theme: name }, location.origin);
        return fetch('/api/store/_mf_theme', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(name)
        }).then(function (r) { return r.json(); });
      },
      onChange: function (callback) {
        themeListeners.push(callback);
      },
      list: function () {
        return Object.keys(THEME_PRESETS);
      },
      vars: function () {
        return THEME_PRESETS[currentTheme] || THEME_PRESETS.dark;
      }
    },

    /** Run callback when SDK is connected and ready */
    ready: function (callback) {
      if (connected) {
        try { callback(); } catch (e) { console.error('[mf.ready]', e); }
      } else {
        readyCallbacks.push(callback);
      }
    },

    /** Page discovery helpers */
    pages: {
      list: function () {
        return fetch('/api/pages').then(function (r) { return r.json(); }).then(function (files) {
          return files.map(function (f) { return f.replace(/\.html$/, ''); });
        });
      },
      exists: function (pageId) {
        return fetch('/api/pages').then(function (r) { return r.json(); }).then(function (files) {
          return files.indexOf(pageId + '.html') !== -1;
        });
      }
    },

    /** Register a custom namespace on the mf object */
    extend: function (name, obj) {
      if (mf[name] !== undefined) {
        throw new Error('[mf.extend] "' + name + '" already exists');
      }
      mf[name] = obj;
    },

    /** Raw access to internals */
    raw: {
      ws: function () { return ws; }
    }
  };

  window.mf = mf;
  connect();
})();

