/* Command Palette — Ctrl+P quick page switcher */
(function () {
  'use strict';

  var overlay = null;
  var input = null;
  var list = null;
  var visible = false;
  var items = [];
  var selectedIndex = 0;

  function build() {
    if (overlay) return;

    overlay = document.createElement('div');
    overlay.id = 'mf-cmd-palette';
    overlay.style.cssText = 'display:none;position:fixed;inset:0;z-index:100001;' +
      'background:rgba(0,0,0,0.5);backdrop-filter:blur(4px);' +
      'display:none;align-items:flex-start;justify-content:center;padding-top:20vh;';

    var panel = document.createElement('div');
    panel.style.cssText = 'width:420px;max-width:90vw;background:var(--mf-surface,#16162e);' +
      'border:1px solid var(--mf-border,rgba(160,160,255,0.15));border-radius:10px;' +
      'box-shadow:0 16px 48px rgba(0,0,0,0.5);overflow:hidden;' +
      'font-family:system-ui,-apple-system,sans-serif;';

    input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Search pages…';
    input.style.cssText = 'width:100%;padding:12px 16px;border:none;border-bottom:1px solid var(--mf-border,rgba(160,160,255,0.1));' +
      'background:transparent;color:var(--mf-text,#e0e0ff);font-size:14px;outline:none;font-family:inherit;';

    list = document.createElement('div');
    list.style.cssText = 'max-height:300px;overflow-y:auto;padding:4px 0;';

    input.addEventListener('input', function () {
      filter(input.value);
    });

    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
        renderSelection();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedIndex = Math.max(selectedIndex - 1, 0);
        renderSelection();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (items[selectedIndex]) {
          selectItem(items[selectedIndex].id);
        }
      } else if (e.key === 'Escape') {
        hide();
      }
    });

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) hide();
    });

    panel.appendChild(input);
    panel.appendChild(list);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
  }

  function filter(query) {
    var q = (query || '').toLowerCase().trim();
    items = [];
    selectedIndex = 0;

    if (searchMode) {
      // Content search mode
      if (q.length < 2) {
        list.innerHTML = '';
        var hint = document.createElement('div');
        hint.style.cssText = 'padding:12px 16px;color:var(--mf-muted,#888);font-size:12px;';
        hint.textContent = 'Type at least 2 characters…';
        list.appendChild(hint);
        return;
      }
      fetch('/api/search?q=' + encodeURIComponent(q))
        .then(function (r) { return r.json(); })
        .then(function (results) {
          items = results.map(function (r) {
            return { id: r.pageId, detail: 'L' + r.line + ': ' + r.text, notOpen: false };
          });
          renderList();
        })
        .catch(function () { renderList(); });
      return;
    }

    // Normal page search mode
    if (!window.WindowManager) { renderList(); return; }
    var allIds = WindowManager.getAll();

    for (var i = 0; i < allIds.length; i++) {
      var id = allIds[i];
      if (!q || id.toLowerCase().indexOf(q) !== -1) {
        items.push({ id: id });
      }
    }

    fetch('/api/pages').then(function (r) { return r.json(); }).then(function (files) {
      var windowSet = new Set(allIds);
      for (var j = 0; j < files.length; j++) {
        var pageId = files[j].replace(/\.html$/, '');
        if (!windowSet.has(pageId) && (!q || pageId.toLowerCase().indexOf(q) !== -1)) {
          items.push({ id: pageId, notOpen: true });
        }
      }
      renderList();
    }).catch(function () {
      renderList();
    });

    renderList();
  }

  function renderList() {
    list.innerHTML = '';
    if (items.length === 0) {
      var empty = document.createElement('div');
      empty.style.cssText = 'padding:12px 16px;color:var(--mf-muted,#888);font-size:13px;text-align:center;';
      empty.textContent = 'No matching pages';
      list.appendChild(empty);
      return;
    }

    for (var i = 0; i < items.length; i++) {
      (function (idx) {
        var item = items[idx];
        var el = document.createElement('div');
        el.setAttribute('data-idx', idx);
        el.style.cssText = 'padding:8px 16px;cursor:pointer;display:flex;align-items:center;gap:8px;' +
          'font-size:13px;color:var(--mf-text,#e0e0ff);transition:background 0.1s;';

        if (idx === selectedIndex) {
          el.style.background = 'var(--mf-input-bg,rgba(160,160,255,0.08))';
        }

        var icon = document.createElement('span');
        icon.style.cssText = 'font-size:14px;opacity:0.5;';
        icon.textContent = item.notOpen ? '📄' : '🪟';

        var name = document.createElement('span');
        name.textContent = item.id;

        var badge = document.createElement('span');
        badge.style.cssText = 'margin-left:auto;font-size:10px;opacity:0.4;';
        badge.textContent = item.notOpen ? 'not open' : 'open';

        el.appendChild(icon);
        if (item.detail) {
          var nameWrap = document.createElement('div');
          nameWrap.style.cssText = 'flex:1;min-width:0;';
          nameWrap.appendChild(name);
          var detail = document.createElement('div');
          detail.style.cssText = 'font-size:11px;color:var(--mf-muted,#777);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
          detail.textContent = item.detail;
          nameWrap.appendChild(detail);
          el.appendChild(nameWrap);
        } else {
          el.appendChild(name);
        }
        el.appendChild(badge);

        el.addEventListener('mouseenter', function () {
          selectedIndex = idx;
          renderSelection();
        });
        el.addEventListener('click', function () {
          selectItem(item.id);
        });

        list.appendChild(el);
      })(i);
    }
  }

  function renderSelection() {
    var children = list.children;
    for (var i = 0; i < children.length; i++) {
      children[i].style.background = (i === selectedIndex)
        ? 'var(--mf-input-bg,rgba(160,160,255,0.08))' : 'transparent';
    }
    // Scroll into view
    if (children[selectedIndex]) {
      children[selectedIndex].scrollIntoView({ block: 'nearest' });
    }
  }

  function selectItem(id) {
    hide();
    if (!window.WindowManager) return;

    var existing = WindowManager.getWindow(id);
    if (existing) {
      WindowManager.bringToFront(id);
    } else {
      // Open the page
      WindowManager.create(id, id + '.html', '/pages/' + id + '.html');
    }
  }

  function show() {
    build();
    searchMode = false;
    visible = true;
    overlay.style.display = 'flex';
    input.value = '';
    selectedIndex = 0;
    filter('');
    requestAnimationFrame(function () {
      input.focus();
    });
  }

  function hide() {
    visible = false;
    searchMode = false;
    if (input) input.placeholder = 'Search pages…';
    if (overlay) overlay.style.display = 'none';
  }

  function toggle() {
    if (visible) hide(); else show();
  }

  var searchMode = false;

  function showSearch() {
    build();
    searchMode = true;
    visible = true;
    overlay.style.display = 'flex';
    input.value = '';
    input.placeholder = 'Search in page content…';
    selectedIndex = 0;
    items = [];
    list.innerHTML = '';
    var hint = document.createElement('div');
    hint.style.cssText = 'padding:12px 16px;color:var(--mf-muted,#888);font-size:12px;';
    hint.textContent = 'Type to search across all page HTML content';
    list.appendChild(hint);
    requestAnimationFrame(function () { input.focus(); });
  }

  // Global shortcut
  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey && !e.shiftKey && e.key === 'p') {
      e.preventDefault();
      toggle();
    }
    if (e.ctrlKey && e.shiftKey && (e.key === 'F' || e.key === 'f')) {
      e.preventDefault();
      showSearch();
    }
  });

  window.CommandPalette = {
    show: show,
    hide: hide,
    toggle: toggle,
    showSearch: showSearch
  };
})();
