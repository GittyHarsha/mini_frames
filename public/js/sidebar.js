(function () {
  'use strict';

  var SIDEBAR_WIDTH = 260;
  var LS_OPEN_KEY = 'mf-sidebar-open';
  var LS_HIDDEN_KEY = 'mf-sidebar-hidden';

  var sidebarEl = null;
  var toggleBtn = null;
  var pageListEl = null;
  var searchInput = null;
  var filtersEl = null;
  var open = false;

  var pages = [];       // ['page-id.html', ...]
  var metadata = {};    // { 'page-id': { tags: [], group: '', links: [] } }
  var hiddenPages = new Set();
  var activeTagFilters = new Set();
  var activeGroupFilter = null;

  // --- Styles ------------------------------------------------

  function injectStyles() {
    var css = [
      '.mf-sidebar {',
      '  position: fixed; top: 0; left: 0; bottom: 0;',
      '  width: ' + SIDEBAR_WIDTH + 'px;',
      '  background: var(--mf-bg);',
      '  border-right: 1px solid var(--mf-border);',
      '  z-index: 10000;',
      '  display: flex; flex-direction: column;',
      '  transform: translateX(-100%);',
      '  transition: transform 0.25s ease;',
      '  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;',
      '  color: var(--mf-text);',
      '  font-size: 13px;',
      '}',
      '.mf-sidebar.mf-sidebar-open {',
      '  transform: translateX(0);',
      '}',
      '.mf-sidebar-header {',
      '  display: flex; align-items: center; justify-content: space-between;',
      '  padding: 12px 14px;',
      '  border-bottom: 1px solid var(--mf-border);',
      '  flex-shrink: 0;',
      '}',
      '.mf-sidebar-title {',
      '  font-size: 15px; font-weight: 600; color: var(--mf-text);',
      '  letter-spacing: 0.02em;',
      '}',
      '.mf-sidebar-actions { display: flex; gap: 4px; }',
      '.mf-sb-btn {',
      '  width: 28px; height: 28px;',
      '  background: var(--mf-input-bg);',
      '  border: 1px solid var(--mf-border);',
      '  border-radius: 6px; color: var(--mf-accent);',
      '  font-size: 14px; cursor: pointer;',
      '  display: flex; align-items: center; justify-content: center;',
      '  padding: 0;',
      '  transition: background 0.15s, border-color 0.15s;',
      '}',
      '.mf-sb-btn:hover {',
      '  background: rgba(160, 160, 255, 0.18);',
      '  border-color: rgba(160, 160, 255, 0.3);',
      '}',
      '.mf-sidebar-search {',
      '  padding: 8px 14px;',
      '  border-bottom: 1px solid rgba(160, 160, 255, 0.08);',
      '  flex-shrink: 0;',
      '}',
      '.mf-sidebar-search input {',
      '  width: 100%; padding: 6px 10px;',
      '  background: var(--mf-input-bg);',
      '  border: 1px solid var(--mf-border);',
      '  border-radius: 6px; color: var(--mf-text);',
      '  font-size: 12px; outline: none;',
      '  font-family: inherit;',
      '  transition: border-color 0.15s;',
      '}',
      '.mf-sidebar-search input::placeholder { color: rgba(160, 160, 255, 0.35); }',
      '.mf-sidebar-search input:focus {',
      '  border-color: rgba(160, 160, 255, 0.35);',
      '}',
      '.mf-sidebar-filters {',
      '  padding: 6px 14px;',
      '  display: flex; flex-wrap: wrap; gap: 4px;',
      '  border-bottom: 1px solid rgba(160, 160, 255, 0.08);',
      '  flex-shrink: 0;',
      '  max-height: 80px; overflow-y: auto;',
      '}',
      '.mf-sidebar-filters:empty { display: none; }',
      '.mf-filter-pill {',
      '  padding: 2px 8px; font-size: 11px;',
      '  background: var(--mf-input-bg);',
      '  border: 1px solid var(--mf-border);',
      '  border-radius: 10px; color: var(--mf-muted);',
      '  cursor: pointer; user-select: none;',
      '  transition: background 0.15s, color 0.15s, border-color 0.15s;',
      '}',
      '.mf-filter-pill:hover {',
      '  background: rgba(160, 160, 255, 0.15);',
      '}',
      '.mf-filter-pill.mf-filter-active {',
      '  background: rgba(160, 160, 255, 0.25);',
      '  color: #d0d0ff; border-color: rgba(160, 160, 255, 0.4);',
      '}',
      '.mf-sidebar-pages {',
      '  flex: 1; overflow-y: auto;',
      '  padding: 8px 10px;',
      '}',
      '.mf-sidebar-pages::-webkit-scrollbar { width: 5px; }',
      '.mf-sidebar-pages::-webkit-scrollbar-track { background: transparent; }',
      '.mf-sidebar-pages::-webkit-scrollbar-thumb {',
      '  background: rgba(160, 160, 255, 0.15); border-radius: 4px;',
      '}',
      '.mf-page-card {',
      '  background: rgba(160, 160, 255, 0.04);',
      '  border: 1px solid rgba(160, 160, 255, 0.08);',
      '  border-radius: 6px; padding: 8px 10px;',
      '  margin-bottom: 6px; cursor: pointer;',
      '  transition: background 0.15s, border-color 0.15s;',
      '}',
      '.mf-page-card:hover {',
      '  background: rgba(160, 160, 255, 0.1);',
      '  border-color: rgba(160, 160, 255, 0.2);',
      '}',
      '.mf-page-card.mf-page-hidden { opacity: 0.45; }',
      '.mf-page-card-header {',
      '  display: flex; align-items: center; justify-content: space-between;',
      '}',
      '.mf-page-name {',
      '  font-size: 13px; font-weight: 500; color: var(--mf-text);',
      '  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;',
      '  flex: 1; min-width: 0;',
      '}',
      '.mf-page-toggle {',
      '  width: 24px; height: 24px;',
      '  background: transparent; border: none;',
      '  color: var(--mf-muted); font-size: 14px;',
      '  cursor: pointer; padding: 0; flex-shrink: 0;',
      '  border-radius: 4px;',
      '  display: flex; align-items: center; justify-content: center;',
      '  transition: background 0.15s, color 0.15s;',
      '}',
      '.mf-page-toggle:hover { background: rgba(160, 160, 255, 0.15); color: #d0d0ff; }',
      '.mf-page-tags {',
      '  display: flex; flex-wrap: wrap; gap: 3px;',
      '  margin-top: 4px;',
      '}',
      '.mf-tag {',
      '  font-size: 10px; padding: 1px 6px;',
      '  background: rgba(160, 160, 255, 0.1);',
      '  border-radius: 8px; color: var(--mf-muted);',
      '}',
      '.mf-page-group, .mf-page-links {',
      '  font-size: 11px; color: rgba(160, 160, 255, 0.45);',
      '  margin-top: 3px;',
      '}',
      '.mf-sidebar-toggle {',
      '  position: fixed; top: 10px; left: 10px;',
      '  width: 32px; height: 32px;',
      '  background: var(--mf-bg); opacity: 0.85;',
      '  border: 1px solid var(--mf-border);',
      '  border-radius: 6px; color: var(--mf-accent);',
      '  font-size: 16px; cursor: pointer;',
      '  z-index: 10001;',
      '  display: flex; align-items: center; justify-content: center;',
      '  padding: 0;',
      '  transition: left 0.25s ease, background 0.15s, border-color 0.15s;',
      '  backdrop-filter: blur(6px);',
      '}',
      '.mf-sidebar-toggle:hover {',
      '  background: rgba(160, 160, 255, 0.15);',
      '  border-color: rgba(160, 160, 255, 0.35);',
      '}',
      '.mf-sidebar-toggle.mf-sidebar-toggle-shifted {',
      '  left: ' + (SIDEBAR_WIDTH + 10) + 'px;',
      '}',
      '.mf-sidebar-empty {',
      '  text-align: center; padding: 20px 10px;',
      '  color: var(--mf-muted); font-size: 12px;',
      '}',
    ].join('\n');

    var style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
  }

  // --- DOM creation ------------------------------------------

  function createDOM() {
    sidebarEl = document.createElement('div');
    sidebarEl.id = 'mf-sidebar';
    sidebarEl.className = 'mf-sidebar';

    // Header
    var header = document.createElement('div');
    header.className = 'mf-sidebar-header';

    var title = document.createElement('span');
    title.className = 'mf-sidebar-title';
    title.textContent = 'Mini Frames';

    var actions = document.createElement('div');
    actions.className = 'mf-sidebar-actions';

    var tileBtn = document.createElement('button');
    tileBtn.className = 'mf-sb-btn';
    tileBtn.id = 'mf-tile-btn';
    tileBtn.title = 'Tile windows (Ctrl+T)';
    tileBtn.textContent = '\u229e';
    tileBtn.addEventListener('click', function () {
      if (window.WindowManager) WindowManager.tile();
    });

    var graphBtn = document.createElement('button');
    graphBtn.className = 'mf-sb-btn';
    graphBtn.id = 'mf-graph-btn';
    graphBtn.title = 'Graph view (Ctrl+G)';
    graphBtn.textContent = '\u25c9';
    graphBtn.addEventListener('click', function () {
      document.dispatchEvent(new CustomEvent('mf-toggle-graph'));
    });

    var themeBtn = document.createElement('button');
    themeBtn.className = 'mf-sb-btn';
    themeBtn.id = 'mf-theme-btn';
    themeBtn.title = 'Cycle theme';
    themeBtn.textContent = '\u263E'; // half-moon
    themeBtn.addEventListener('click', function () {
      if (!window._mfThemeList || !window._mfApplyTheme) return;
      var list = window._mfThemeList;
      var current = window._mfCurrentTheme || 'dark';
      var idx = list.indexOf(current);
      var next = list[(idx + 1) % list.length];
      window._mfApplyTheme(next);
    });

    var exportBtn = document.createElement('button');
    exportBtn.className = 'mf-sb-btn';
    exportBtn.title = 'Export workspace';
    exportBtn.textContent = '↓';
    exportBtn.addEventListener('click', function () {
      window.open('/api/export', '_blank');
    });

    var importBtn = document.createElement('button');
    importBtn.className = 'mf-sb-btn';
    importBtn.title = 'Import workspace';
    importBtn.textContent = '↑';
    importBtn.addEventListener('click', function () {
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.style.display = 'none';
      input.addEventListener('change', function () {
        if (!input.files || !input.files[0]) return;
        var reader = new FileReader();
        reader.onload = function () {
          fetch('/api/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: reader.result
          }).then(function (r) { return r.json(); }).then(function (result) {
            if (result.ok) {
              refresh();
              var msg = 'Imported: ' + result.imported.pages + ' pages, ' +
                result.imported.storage + ' storage, ' + result.imported.metadata + ' metadata';
              console.log(msg);
            }
          }).catch(function (e) {
            console.error('Import failed:', e);
          });
        };
        reader.readAsText(input.files[0]);
      });
      document.body.appendChild(input);
      input.click();
      document.body.removeChild(input);
    });

    var newBtn = document.createElement('button');
    newBtn.className = 'mf-sb-btn';
    newBtn.id = 'mf-new-btn';
    newBtn.title = 'New page';
    newBtn.textContent = '+';
    newBtn.style.fontWeight = '700';
    newBtn.addEventListener('click', function () {
      showNewPageInput();
    });

    actions.appendChild(newBtn);
    actions.appendChild(themeBtn);
    actions.appendChild(tileBtn);
    actions.appendChild(graphBtn);
    actions.appendChild(exportBtn);
    actions.appendChild(importBtn);
    header.appendChild(title);
    header.appendChild(actions);

    // Search
    var searchWrap = document.createElement('div');
    searchWrap.className = 'mf-sidebar-search';

    searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.id = 'mf-search';
    searchInput.placeholder = 'Search pages\u2026';
    searchInput.addEventListener('input', renderPageList);
    searchWrap.appendChild(searchInput);

    // Filters
    filtersEl = document.createElement('div');
    filtersEl.className = 'mf-sidebar-filters';

    // Page list
    pageListEl = document.createElement('div');
    pageListEl.className = 'mf-sidebar-pages';
    pageListEl.id = 'mf-page-list';

    sidebarEl.appendChild(header);
    sidebarEl.appendChild(searchWrap);
    sidebarEl.appendChild(filtersEl);
    sidebarEl.appendChild(pageListEl);

    // Toggle button
    toggleBtn = document.createElement('button');
    toggleBtn.id = 'mf-sidebar-toggle';
    toggleBtn.className = 'mf-sidebar-toggle';
    toggleBtn.textContent = '\u2630';
    toggleBtn.addEventListener('click', toggle);

    document.body.appendChild(sidebarEl);
    document.body.appendChild(toggleBtn);
  }

  // --- Data fetching -----------------------------------------

  function fetchData() {
    var pPages = fetch('/api/pages')
      .then(function (r) { return r.json(); })
      .catch(function () { return []; });

    var pMeta = fetch('/api/metadata')
      .then(function (r) {
        if (!r.ok) return {};
        return r.json();
      })
      .catch(function () { return {}; });

    return Promise.all([pPages, pMeta]).then(function (results) {
      pages = results[0] || [];
      metadata = results[1] || {};
    });
  }

  // --- Helpers -----------------------------------------------

  function pageId(filename) {
    return filename.replace(/\.html$/, '');
  }

  function getMeta(id) {
    return metadata[id] || {};
  }

  function getAllTags() {
    var tags = new Set();
    var ids = Object.keys(metadata);
    for (var i = 0; i < ids.length; i++) {
      var m = metadata[ids[i]];
      if (m.tags) {
        for (var j = 0; j < m.tags.length; j++) tags.add(m.tags[j]);
      }
    }
    return Array.from(tags).sort();
  }

  function getAllGroups() {
    var groups = new Set();
    var ids = Object.keys(metadata);
    for (var i = 0; i < ids.length; i++) {
      var m = metadata[ids[i]];
      if (m.group) groups.add(m.group);
    }
    return Array.from(groups).sort();
  }

  // --- Visibility --------------------------------------------

  function loadHidden() {
    try {
      var raw = localStorage.getItem(LS_HIDDEN_KEY);
      if (raw) {
        var arr = JSON.parse(raw);
        hiddenPages = new Set(arr);
      }
    } catch (e) { /* ignore */ }
  }

  function saveHidden() {
    localStorage.setItem(LS_HIDDEN_KEY, JSON.stringify(Array.from(hiddenPages)));
  }

  function setPageVisible(id, visible) {
    if (visible) {
      hiddenPages.delete(id);
    } else {
      hiddenPages.add(id);
    }
    saveHidden();
    applyVisibility(id);
  }

  function applyVisibility(id) {
    var win = document.querySelector('.mf-window[data-window-id="' + id + '"]');
    if (win) {
      win.style.display = hiddenPages.has(id) ? 'none' : '';
    }
  }

  function applyAllVisibility() {
    hiddenPages.forEach(function (id) {
      applyVisibility(id);
    });
  }

  // --- Filters -----------------------------------------------

  function matchesFilters(id) {
    var m = getMeta(id);

    // Tag filter (OR logic)
    if (activeTagFilters.size > 0) {
      var pageTags = m.tags || [];
      var hasMatch = false;
      activeTagFilters.forEach(function (t) {
        if (pageTags.indexOf(t) !== -1) hasMatch = true;
      });
      if (!hasMatch) return false;
    }

    // Group filter
    if (activeGroupFilter) {
      if ((m.group || '') !== activeGroupFilter) return false;
    }

    return true;
  }

  function matchesSearch(id) {
    var query = (searchInput.value || '').toLowerCase().trim();
    if (!query) return true;

    var m = getMeta(id);
    var haystack = id.toLowerCase();
    if (m.tags) haystack += ' ' + m.tags.join(' ').toLowerCase();
    if (m.group) haystack += ' ' + m.group.toLowerCase();

    return haystack.indexOf(query) !== -1;
  }

  // --- Rendering ---------------------------------------------

  function renderFilters() {
    filtersEl.innerHTML = '';

    var tags = getAllTags();
    var groups = getAllGroups();

    for (var i = 0; i < tags.length; i++) {
      (function (tag) {
        var pill = document.createElement('span');
        pill.className = 'mf-filter-pill';
        if (activeTagFilters.has(tag)) pill.classList.add('mf-filter-active');
        pill.textContent = '#' + tag;
        pill.addEventListener('click', function () {
          if (activeTagFilters.has(tag)) {
            activeTagFilters.delete(tag);
          } else {
            activeTagFilters.add(tag);
          }
          renderFilters();
          renderPageList();
        });
        filtersEl.appendChild(pill);
      })(tags[i]);
    }

    for (var g = 0; g < groups.length; g++) {
      (function (group) {
        var pill = document.createElement('span');
        pill.className = 'mf-filter-pill';
        if (activeGroupFilter === group) pill.classList.add('mf-filter-active');
        pill.textContent = '\u25cb ' + group;
        pill.addEventListener('click', function () {
          activeGroupFilter = (activeGroupFilter === group) ? null : group;
          renderFilters();
          renderPageList();
        });
        filtersEl.appendChild(pill);
      })(groups[g]);
    }
  }

  function showNewPageInput() {
    if (document.getElementById('mf-new-page-input')) return;

    var wrapper = document.createElement('div');
    wrapper.style.cssText = 'padding:6px 10px;border-bottom:1px solid var(--mf-border,rgba(160,160,255,0.08));';

    var input = document.createElement('input');
    input.id = 'mf-new-page-input';
    input.type = 'text';
    input.placeholder = 'page-name (enter to create)';
    input.style.cssText = 'width:100%;padding:6px 10px;background:var(--mf-input-bg);' +
      'border:1px solid var(--mf-accent,#a0a0ff);border-radius:6px;color:var(--mf-text,#e0e0ff);' +
      'font-size:12px;outline:none;font-family:inherit;';

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        var name = input.value.trim().replace(/\.html$/, '').replace(/[^a-zA-Z0-9_-]/g, '-');
        if (!name) return;
        fetch('/api/pages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name })
        }).then(function (r) {
          if (r.ok) {
            wrapper.remove();
          } else {
            return r.json().then(function (d) {
              input.style.borderColor = 'var(--mf-error, #f87171)';
              input.value = '';
              input.placeholder = d.error || 'Error';
              setTimeout(function () {
                input.style.borderColor = 'var(--mf-accent,#a0a0ff)';
                input.placeholder = 'page-name (enter to create)';
              }, 2000);
            });
          }
        }).catch(function () {
          wrapper.remove();
        });
      }
      if (e.key === 'Escape') {
        wrapper.remove();
      }
    });

    wrapper.appendChild(input);

    var searchEl = sidebarEl.querySelector('.mf-sidebar-search');
    if (searchEl && searchEl.nextSibling) {
      sidebarEl.insertBefore(wrapper, searchEl.nextSibling);
    } else {
      sidebarEl.appendChild(wrapper);
    }

    input.focus();
  }

  function renderPageList() {
    pageListEl.innerHTML = '';

    var visible = [];
    for (var i = 0; i < pages.length; i++) {
      var id = pageId(pages[i]);
      if (matchesSearch(id) && matchesFilters(id)) {
        visible.push({ id: id, filename: pages[i] });
      }
    }

    if (visible.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'mf-sidebar-empty';
      empty.textContent = pages.length === 0 ? 'No pages yet' : 'No matching pages';
      pageListEl.appendChild(empty);
      return;
    }

    for (var v = 0; v < visible.length; v++) {
      pageListEl.appendChild(createPageCard(visible[v].id, visible[v].filename));
    }
  }

  function createPageCard(id, filename) {
    var m = getMeta(id);
    var isHidden = hiddenPages.has(id);

    var card = document.createElement('div');
    card.className = 'mf-page-card' + (isHidden ? ' mf-page-hidden' : '');
    card.setAttribute('data-page', id);

    // Clicking the card body brings the window to front
    card.addEventListener('click', function (e) {
      if (e.target.closest('.mf-page-toggle')) return;
      if (!isHidden && window.WindowManager) {
        WindowManager.bringToFront(id);
      }
    });

    // Header row
    var header = document.createElement('div');
    header.className = 'mf-page-card-header';

    var name = document.createElement('span');
    name.className = 'mf-page-name';
    name.textContent = id;

    var toggleVisBtn = document.createElement('button');
    toggleVisBtn.className = 'mf-page-toggle';
    toggleVisBtn.title = isHidden ? 'Show' : 'Hide';
    toggleVisBtn.textContent = isHidden ? '\uD83D\uDE48' : '\uD83D\uDC41';
    toggleVisBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      var nowHidden = !hiddenPages.has(id);
      setPageVisible(id, !nowHidden);
      renderPageList();
    });

    var deleteBtn = document.createElement('button');
    deleteBtn.className = 'mf-page-toggle';
    deleteBtn.title = 'Delete page';
    deleteBtn.textContent = '\uD83D\uDDD1'; // 🗑
    deleteBtn.style.fontSize = '12px';
    deleteBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (!confirm('Delete "' + id + '"? This removes the page, its storage, and metadata.')) return;
      fetch('/api/pages/' + id, { method: 'DELETE' })
        .then(function (r) {
          if (r.ok) {
            // Window will close via hot-reload file watcher
            refresh();
          }
        })
        .catch(function (err) { console.error('Delete failed:', err); });
    });

    header.appendChild(name);
    header.appendChild(toggleVisBtn);
    header.appendChild(deleteBtn);
    card.appendChild(header);

    // Tags
    if (m.tags && m.tags.length > 0) {
      var tagsEl = document.createElement('div');
      tagsEl.className = 'mf-page-tags';
      for (var t = 0; t < m.tags.length; t++) {
        var tagSpan = document.createElement('span');
        tagSpan.className = 'mf-tag';
        tagSpan.textContent = m.tags[t];
        tagsEl.appendChild(tagSpan);
      }
      card.appendChild(tagsEl);
    }

    // Group
    if (m.group) {
      var groupEl = document.createElement('div');
      groupEl.className = 'mf-page-group';
      groupEl.textContent = 'Group: ' + m.group;
      card.appendChild(groupEl);
    }

    // Links
    if (m.links && m.links.length > 0) {
      var linksEl = document.createElement('div');
      linksEl.className = 'mf-page-links';
      linksEl.textContent = 'Links: ' + m.links.join(', ') + ' \u2192';
      card.appendChild(linksEl);
    }

    return card;
  }

  // --- Toggle ------------------------------------------------

  function toggle() {
    open = !open;
    sidebarEl.classList.toggle('mf-sidebar-open', open);
    toggleBtn.classList.toggle('mf-sidebar-toggle-shifted', open);
    localStorage.setItem(LS_OPEN_KEY, open ? '1' : '0');
  }

  function isOpen() {
    return open;
  }

  // --- Init --------------------------------------------------

  function init() {
    injectStyles();
    createDOM();
    loadHidden();

    // Restore open state
    if (localStorage.getItem(LS_OPEN_KEY) === '1') {
      open = true;
      sidebarEl.classList.add('mf-sidebar-open');
      toggleBtn.classList.add('mf-sidebar-toggle-shifted');
    }

    return refresh();
  }

  function refresh() {
    return fetchData().then(function () {
      renderFilters();
      renderPageList();
      applyAllVisibility();
    });
  }

  // --- Public API --------------------------------------------

  window.Sidebar = {
    init: init,
    refresh: refresh,
    toggle: toggle,
    isOpen: isOpen,
  };
})();
