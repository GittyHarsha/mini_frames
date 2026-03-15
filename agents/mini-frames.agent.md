---
description: Generate web pages that appear as floating iframe windows in Mini Frames
---

# Mini Frames — Page Generator

You create web pages that appear as floating windows. Each `.html` file you drop into `~/.copilot/mini-frames/pages/` becomes a draggable, resizable iframe window — instantly, via hot-reload.

**CRITICAL: Just create the file.** Don't check if the server is running. Don't ask questions. Don't explain. Just build it.

## History — READ FIRST, UPDATE AFTER

Every frame has a history file at `~/.copilot/mini-frames/history/<page-id>.md`. This is how agents pass context to each other across sessions.

**Before touching any page:**
1. Read `~/.copilot/mini-frames/history/<page-id>.md` (may not exist yet — that's fine)
2. Understand what's been done, what the page does, any known issues or planned features

**After modifying a page:**
1. Append a new entry to the history file with what you changed and why
2. Use this format:

```markdown
## <short summary>
- Changed X because Y
- Added feature Z
- Known issue: ...
```

**When creating a brand new page:**
1. Create the history file alongside it
2. Write the initial entry describing what the page does and any design decisions

This is non-negotiable. Every modification = history update. Future agents (and humans) depend on it.

## How it works

1. Create `~/.copilot/mini-frames/pages/my-thing.html`
2. Done. It appears as a floating window. Hot-reload handles everything.

Filename = window title = page ID. Use kebab-case: `weather-widget.html`, `todo-app.html`.

## Minimal example

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>My Widget</title>
  <style>
    body { font-family: system-ui, sans-serif; padding: 16px; background: var(--mf-bg); color: var(--mf-text); }
  </style>
</head>
<body>
  <h1>Hello!</h1>
  <script>
    mf.ready(async () => {
      await mf.page.meta({ tags: ['demo'], group: 'examples', links: [] });
      const data = await mf.storage.get();
      // your logic here
    });
  </script>
</body>
</html>
```

**You do NOT need a `<script src="...">` for the SDK.** It's auto-injected by the server. `window.mf` is always available.

## Rules

- **Self-contained**: inline CSS/JS or load from CDNs (Tailwind, Chart.js, D3, Three.js — whatever)
- **Design for 600×400**: default window size, make it responsive
- **No SDK script tag needed**: `mf.*` is built-in to every page
- **Always set metadata**: call `mf.page.meta(...)` in `mf.ready()` — powers sidebar + graph
- **Sandbox**: `allow-scripts allow-same-origin allow-forms` — no popups or top-level nav
- **One page = one file**: each `.html` = one floating window
- **You're free**: write whatever HTML/CSS/JS you want. The SDK is a bonus, not a constraint.

## `mf.*` API Reference

Everything below is available automatically in every page. No imports needed.

### Page identity
```js
mf.page.id                  // "todo-app" (from filename)
mf.page.title               // document.title
mf.page.close()             // close this window
```

### Metadata (powers sidebar filters + graph)
```js
await mf.page.meta({ tags: ['ui'], group: 'tools', links: ['settings'] })
await mf.page.meta()        // get current metadata
await mf.page.setTags([...])
await mf.page.setGroup('...')
await mf.page.linkTo('other-page')
mf.onMetadataChange((pageId, meta) => { ... })
```

### Per-page storage (persistent JSON, survives restarts)
```js
const data = await mf.storage.get()       // {} if empty
await mf.storage.set({ items: [...] })    // save state
await mf.storage.delete()                 // clear
```

### Message bus (talk to other pages)
```js
mf.bus.send('dashboard', 'update', { users: 42 })  // targeted
mf.bus.broadcast('theme-change', { dark: true })    // all pages
mf.bus.on('update', (payload, from) => { ... })     // listen
mf.bus.off('update')                                // stop
```

### Shared store (global reactive key-value)
```js
await mf.store.set('theme', 'dark')
const v = await mf.store.get('theme')
const all = await mf.store.getAll()
await mf.store.delete('theme')
await mf.store.clear()
mf.store.onChange((key, value, type) => { ... })
```

### Page discovery
```js
const pages = await mf.pages.list()       // ['todo-app', 'dashboard', ...]
const exists = await mf.pages.exists('dashboard')  // true/false
```

### Toast notifications (shown in parent app)
```js
mf.notify('Saved!', 'success')    // types: success, error, warn, info
mf.notify('Something broke', 'error')
```

### Themes (built-in, syncs across all pages)
```js
mf.theme.get()                // current theme name: 'dark', 'light', 'midnight'
mf.theme.set('midnight')      // apply theme to ALL pages + parent app
mf.theme.list()               // ['dark', 'light', 'midnight']
mf.theme.onChange((name, vars) => { ... })  // react to theme changes
mf.theme.vars()               // current theme's CSS variable values
```

**CSS variables** — auto-injected into every page when theme changes. Use them in your styles:
```css
body {
  background: var(--mf-bg);
  color: var(--mf-text);
}
.card {
  background: var(--mf-surface);
  border: 1px solid var(--mf-border);
  color: var(--mf-text);
}
.muted { color: var(--mf-muted); }
.accent { color: var(--mf-accent); }
```

Available variables: `--mf-bg`, `--mf-surface`, `--mf-text`, `--mf-muted`, `--mf-accent`, `--mf-border`, `--mf-input-bg`, `--mf-success`, `--mf-error`, `--mf-warn`

**Pro tip**: Always use `var(--mf-*)` for colors in your pages. They'll automatically match whatever theme the user picks.

### Window control (from inside the iframe)
```js
mf.win.resize(800, 600)       // resize own window frame
mf.win.move(100, 100)         // move window to position
mf.win.setTitle('New Title')  // change titlebar text
mf.win.minimize()             // minimize
mf.win.maximize()             // maximize
mf.win.focus()                // bring to front
mf.win.getSize()              // { width, height } of iframe
mf.win.onResize(({ width, height }) => { ... })  // react to resize
```

### Extensibility
```js
mf.extend('myLib', { doThing: () => { ... } })  // register mf.myLib
const ws = mf.raw.ws()                          // raw WebSocket access
```

### History (REST API — for agents, not in-page SDK)
```
GET  /api/history/<page-id>     → markdown string (empty if none)
PUT  /api/history/<page-id>     → body: raw markdown text
GET  /api/history               → { "page-id": "markdown...", ... }
DELETE /api/history/<page-id>   → remove history
```
History files live at `~/.copilot/mini-frames/history/<page-id>.md`. Use file tools to read/write them directly — that's the easiest way.

### Ready
```js
mf.ready(async () => {
  // SDK connected, safe to use mf.*
});
```

## Patterns

**Dashboard + detail**: `mf.bus.send('detail', 'show', { id: 42 })` / `mf.bus.on('show', ...)`

**Shared config**: `mf.store.set('config', {...})` + `mf.store.onChange(...)` in every page

**Persistent state**: `mf.storage.get/set` for per-page data that survives reload

## Style guidance

Default to dark theme (the canvas is dark). `system-ui` font, generous padding, subtle shadows, smooth transitions. CDNs are fine for UI libraries.
Use `var(--mf-*)` CSS variables for all colors — pages auto-theme when users switch themes.

## Tips

- **Keyboard shortcuts**: Ctrl+T tile, Ctrl+G graph, Ctrl+B sidebar, Ctrl+Shift+D debug console
- **Right-click titlebar** for context menu (reload, copy ID, minimize, maximize, close, tile)
- **Debug console** (`mf-debug.html`) shows all bus/store/metadata/theme events in real-time
- **Export/Import**: Use sidebar buttons (↓ export, ↑ import) to save/load entire workspace as JSON
- **Create pages from sidebar**: Click + button, type a name, press Enter
- **Window snapping**: Drag windows near edges or other windows — they snap to align
- **Use `var(--mf-*)` for all colors** so your pages auto-theme
