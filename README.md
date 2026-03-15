# Mini Frames

A Copilot CLI plugin that turns AI agents into web page builders. Drop HTML files into a folder → they appear as floating, draggable iframe windows with hot-reload.

Agents create pages. You arrange them. Everything talks to everything.

## Install

```bash
copilot plugin install GittyHarsha/mini_frames
```

## Usage

```bash
# Start the server
copilot run mini-frames

# Or manually
cd <plugin-dir> && npm start
```

Open **http://localhost:3000** in your browser.

Then switch to the **mini-frames** custom agent in Copilot CLI and start building:
> *"build me a kanban board"*
> *"create a live clock widget"*
> *"make a markdown editor with preview"*

The agent drops an HTML file into `~/.copilot/mini-frames/pages/` and it instantly appears as a floating window.

## What you get

- **Floating windows** — drag, resize, snap-to-edge, pin, minimize, maximize, tile
- **Hot-reload** — edit an HTML file, the window updates instantly
- **SDK auto-injection** — every page gets `mf.*` API with zero setup
- **Inter-frame messaging** — pages talk to each other via `mf.bus`
- **Per-page storage** — persistent JSON state that survives restarts
- **Shared store** — global reactive key-value store across all frames
- **Theme system** — dark / light / midnight, syncs across everything
- **Graph view** — Obsidian-style force-directed graph of page links (Ctrl+G)
- **Sidebar** — search, filter by tags/groups, create/delete pages
- **Command palette** — Ctrl+P to quick-switch, Ctrl+Shift+F to search content
- **Minimap** — bird's-eye view of all windows
- **Per-frame history** — `history.md` files so agents maintain context across sessions
- **Export/Import** — save and restore entire workspaces as JSON

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| Ctrl+P | Command palette |
| Ctrl+G | Graph view |
| Ctrl+B | Toggle sidebar |
| Ctrl+T | Tile all windows |
| Ctrl+Shift+F | Content search |
| Ctrl+Shift+D | Debug console |
| F11 | Fullscreen focus mode |

## Data layout

```
~/.copilot/mini-frames/
├── pages/       ← HTML files (each = one floating window)
├── storage/     ← per-page JSON state
├── metadata/    ← tags, groups, links (powers sidebar + graph)
├── history/     ← per-page history.md (agent context)
└── shared-store.json
```

## SDK (auto-injected into every page)

```js
mf.ready(async () => {
  // Identity & metadata
  mf.page.id                          // "my-widget"
  await mf.page.meta({ tags: ['ui'], group: 'tools', links: ['settings'] })

  // Storage
  const data = await mf.storage.get()
  await mf.storage.set({ count: 42 })

  // Message bus
  mf.bus.send('dashboard', 'refresh', { ts: Date.now() })
  mf.bus.on('refresh', (payload, from) => { ... })

  // Shared store
  await mf.store.set('theme', 'dark')
  mf.store.onChange((key, val) => { ... })

  // Window control
  mf.win.resize(800, 600)
  mf.win.move(100, 100)
  mf.win.setTitle('New Title')

  // Themes & notifications
  mf.theme.set('midnight')
  mf.notify('Done!', 'success')
})
```

No `<script>` tag needed — the server injects it automatically.

## For agents

The custom agent definition lives at `agents/mini-frames.agent.md`. It instructs agents to:
1. Read `history/<page-id>.md` before touching any page
2. Create self-contained HTML with inline CSS/JS
3. Use `var(--mf-*)` CSS variables for theme support
4. Set metadata via `mf.page.meta()` for sidebar + graph integration
5. Update the history file after every modification

## Tech

- Vanilla JS, no frameworks
- Single npm dependency: `ws`
- ES5-style SDK for max compatibility
- Node.js HTTP + WebSocket server

## License

MIT
