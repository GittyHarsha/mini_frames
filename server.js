const http = require("http");
const fs = require("fs");
const path = require("path");
const { WebSocketServer } = require("ws");

const PORT = parseInt(process.env.PORT, 10) || 3000;
const DATA_DIR = process.env.MINI_FRAMES_DATA || path.join(require("os").homedir(), ".copilot", "mini-frames");
const PUBLIC_DIR = path.join(__dirname, "public");
const PAGES_DIR = path.join(DATA_DIR, "pages");
const STORAGE_DIR = path.join(DATA_DIR, "storage");
const METADATA_DIR = path.join(DATA_DIR, "metadata");
const HISTORY_DIR = path.join(DATA_DIR, "history");
const SHARED_STORE_FILE = path.join(DATA_DIR, "shared-store.json");

const MIME_TYPES = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

// Ensure directories exist
if (!fs.existsSync(PAGES_DIR)) fs.mkdirSync(PAGES_DIR, { recursive: true });
if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR, { recursive: true });
if (!fs.existsSync(METADATA_DIR)) fs.mkdirSync(METADATA_DIR, { recursive: true });
if (!fs.existsSync(HISTORY_DIR)) fs.mkdirSync(HISTORY_DIR, { recursive: true });

// Track known files for add/change/delete detection
const knownFiles = new Set(
  fs.readdirSync(PAGES_DIR).filter((f) => f.endsWith(".html"))
);

// --- Shared store helpers ---

function readStore() {
  try {
    return JSON.parse(fs.readFileSync(SHARED_STORE_FILE, "utf8"));
  } catch {
    return {};
  }
}

function writeStore(data) {
  fs.writeFileSync(SHARED_STORE_FILE, JSON.stringify(data, null, 2), "utf8");
}

// WebSocket page-client registry
const pageClients = new Map(); // pageId -> Set<WebSocket>

// --- HTTP server ---

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = decodeURIComponent(url.pathname);

  // API: list page filenames
  if (req.method === "GET" && pathname === "/api/pages") {
    const files = fs.readdirSync(PAGES_DIR).filter((f) => f.endsWith(".html"));
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(files));
    return;
  }

  // API: create a new page
  if (req.method === "POST" && pathname === "/api/pages") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const { name } = JSON.parse(body);
        if (!name || !/^[a-zA-Z0-9_-]+$/.test(name)) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end('{"error":"Invalid name. Use kebab-case alphanumeric characters."}');
          return;
        }
        const filePath = path.join(PAGES_DIR, name + ".html");
        if (fs.existsSync(filePath)) {
          res.writeHead(409, { "Content-Type": "application/json" });
          res.end('{"error":"Page already exists"}');
          return;
        }
        const scaffold = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${name}</title>
  <style>
    body { font-family: system-ui, sans-serif; padding: 16px; background: var(--mf-bg, #0d0d1a); color: var(--mf-text, #e0e0ff); }
  </style>
</head>
<body>
  <h1>${name}</h1>
  <p>Edit this page to build something awesome.</p>
  <script>
    mf.ready(async () => {
      await mf.page.meta({ tags: [], group: '', links: [] });
    });
  </script>
</body>
</html>`;
        fs.writeFileSync(filePath, scaffold, "utf8");
        res.writeHead(201, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, filename: name + ".html" }));
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end('{"error":"Invalid JSON"}');
      }
    });
    return;
  }

  // API: delete a page
  const pageDeleteMatch = pathname.match(/^\/api\/pages\/([a-zA-Z0-9_-]+)$/);
  if (req.method === "DELETE" && pageDeleteMatch) {
    const name = pageDeleteMatch[1];
    const filePath = path.join(PAGES_DIR, name + ".html");
    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end('{"error":"Page not found"}');
      return;
    }
    fs.unlinkSync(filePath);
    // Also clean up storage, metadata, and history
    const storagePath = path.join(STORAGE_DIR, name + ".json");
    const metaPath = path.join(METADATA_DIR, name + ".json");
    const historyPath = path.join(HISTORY_DIR, name + ".md");
    if (fs.existsSync(storagePath)) fs.unlinkSync(storagePath);
    if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath);
    if (fs.existsSync(historyPath)) fs.unlinkSync(historyPath);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end('{"ok":true}');
    return;
  }

  // API: per-page history (markdown context file)
  const historyMatch = pathname.match(/^\/api\/history\/([a-zA-Z0-9_-]+)$/);
  if (historyMatch) {
    const pageId = historyMatch[1];
    const historyFile = path.join(HISTORY_DIR, pageId + ".md");

    if (req.method === "GET") {
      try {
        const content = fs.readFileSync(historyFile, "utf8");
        res.writeHead(200, { "Content-Type": "text/markdown" });
        res.end(content);
      } catch {
        res.writeHead(200, { "Content-Type": "text/markdown" });
        res.end("");
      }
      return;
    }

    if (req.method === "PUT" || req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        fs.writeFileSync(historyFile, body, "utf8");
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end('{"ok":true}');
      });
      return;
    }

    if (req.method === "DELETE") {
      if (fs.existsSync(historyFile)) fs.unlinkSync(historyFile);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end('{"ok":true}');
      return;
    }
  }

  // API: list all histories
  if (req.method === "GET" && pathname === "/api/history") {
    const files = fs.readdirSync(HISTORY_DIR).filter((f) => f.endsWith(".md"));
    const result = {};
    for (const f of files) {
      const id = f.replace(/\.md$/, "");
      result[id] = fs.readFileSync(path.join(HISTORY_DIR, f), "utf8");
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(result));
    return;
  }

  // Storage API: per-page persistent JSON storage
  const storageMatch = pathname.match(/^\/api\/storage\/([a-zA-Z0-9_-]+)$/);
  if (storageMatch) {
    const pageId = storageMatch[1];
    const storageFile = path.join(STORAGE_DIR, pageId + ".json");

    if (req.method === "GET") {
      fs.readFile(storageFile, "utf8", (err, data) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(err ? "{}" : data);
      });
      return;
    }

    if (req.method === "POST" || req.method === "PUT") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          JSON.parse(body); // validate JSON
          fs.writeFileSync(storageFile, body, "utf8");
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end('{"ok":true}');
        } catch {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end('{"error":"Invalid JSON"}');
        }
      });
      return;
    }

    if (req.method === "DELETE") {
      if (fs.existsSync(storageFile)) fs.unlinkSync(storageFile);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end('{"ok":true}');
      return;
    }
  }

  // Metadata API: all pages
  if (req.method === "GET" && pathname === "/api/metadata") {
    const result = {};
    const files = fs.readdirSync(METADATA_DIR).filter((f) => f.endsWith(".json"));
    for (const f of files) {
      try {
        const id = f.replace(/\.json$/, "");
        result[id] = JSON.parse(fs.readFileSync(path.join(METADATA_DIR, f), "utf8"));
      } catch {}
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(result));
    return;
  }

  // Metadata API: per-page
  const metadataMatch = pathname.match(/^\/api\/metadata\/([a-zA-Z0-9_-]+)$/);
  if (metadataMatch) {
    const pageId = metadataMatch[1];
    const metaFile = path.join(METADATA_DIR, pageId + ".json");

    if (req.method === "GET") {
      fs.readFile(metaFile, "utf8", (err, data) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(err ? '{"tags":[],"group":"","links":[]}' : data);
      });
      return;
    }

    if (req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          const parsed = JSON.parse(body);
          fs.writeFileSync(metaFile, JSON.stringify(parsed, null, 2), "utf8");
          broadcast({ type: "metadata-update", pageId, metadata: parsed });
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(parsed));
        } catch {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end('{"error":"Invalid JSON"}');
        }
      });
      return;
    }

    if (req.method === "DELETE") {
      if (fs.existsSync(metaFile)) fs.unlinkSync(metaFile);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end('{"ok":true}');
      return;
    }
  }

  // API: SDK URL
  if (req.method === "GET" && pathname === "/api/sdk-url") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ url: "/js/mf-sdk.js" }));
    return;
  }

  // API: proxy for external APIs (handles CORS)
  if (req.method === "GET" && pathname === "/api/proxy") {
    const targetUrl = url.searchParams.get("url");
    if (!targetUrl) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end('{"error":"Missing url param"}');
      return;
    }
    const https = require("https");
    const http2 = require("http");
    const mod = targetUrl.startsWith("https") ? https : http2;
    const headers = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" };
    // Forward specific headers from the request
    if (req.headers["x-api-key"]) headers["x-access-token"] = req.headers["x-api-key"];
    if (req.headers["x-finnhub-token"]) headers["X-Finnhub-Token"] = req.headers["x-finnhub-token"];
    mod.get(targetUrl, { headers }, (proxyRes) => {
      let body = "";
      proxyRes.on("data", (chunk) => (body += chunk));
      proxyRes.on("end", () => {
        res.writeHead(proxyRes.statusCode, { "Content-Type": proxyRes.headers["content-type"] || "application/json" });
        res.end(body);
      });
    }).on("error", (e) => {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: e.message }));
    });
    return;
  }

  // API: server stats
  if (req.method === "GET" && pathname === "/api/stats") {
    const pageFiles = fs.readdirSync(PAGES_DIR).filter(f => f.endsWith(".html"));
    const storageFiles = fs.readdirSync(STORAGE_DIR).filter(f => f.endsWith(".json"));
    const metaFiles = fs.readdirSync(METADATA_DIR).filter(f => f.endsWith(".json"));
    
    let storageSize = 0;
    for (const f of storageFiles) {
      try { storageSize += fs.statSync(path.join(STORAGE_DIR, f)).size; } catch {}
    }
    
    let storeSize = 0;
    try { storeSize = fs.statSync(SHARED_STORE_FILE).size; } catch {}

    const stats = {
      pages: pageFiles.length,
      wsClients: wss.clients.size,
      registeredPages: pageClients.size,
      storageFiles: storageFiles.length,
      storageSizeBytes: storageSize,
      metadataFiles: metaFiles.length,
      sharedStoreSizeBytes: storeSize,
      uptime: process.uptime(),
      memoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024)
    };

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(stats));
    return;
  }

  // API: search page content
  if (req.method === "GET" && pathname === "/api/search") {
    const query = url.searchParams.get("q") || "";
    if (!query.trim()) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end("[]");
      return;
    }

    const results = [];
    const pageFiles = fs.readdirSync(PAGES_DIR).filter(f => f.endsWith(".html"));
    const lowerQ = query.toLowerCase();

    for (const file of pageFiles) {
      try {
        const content = fs.readFileSync(path.join(PAGES_DIR, file), "utf8");
        const lines = content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].toLowerCase().includes(lowerQ)) {
            results.push({
              file: file,
              pageId: file.replace(/\.html$/, ""),
              line: i + 1,
              text: lines[i].trim().substring(0, 200)
            });
            if (results.length >= 50) break;
          }
        }
        if (results.length >= 50) break;
      } catch {}
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(results));
    return;
  }

  // Shared Store API
  if (req.method === "GET" && pathname === "/api/store") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(readStore()));
    return;
  }

  if (req.method === "DELETE" && pathname === "/api/store") {
    writeStore({});
    broadcast({ type: "store-clear" });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end('{"ok":true}');
    return;
  }

  const storeKeyMatch = pathname.match(/^\/api\/store\/([a-zA-Z0-9_.-]+)$/);
  if (storeKeyMatch) {
    const key = storeKeyMatch[1];

    if (req.method === "GET") {
      const store = readStore();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(store[key] !== undefined ? store[key] : null));
      return;
    }

    if (req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          const value = JSON.parse(body);
          const store = readStore();
          store[key] = value;
          writeStore(store);
          broadcast({ type: "store-update", key, value });
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end('{"ok":true}');
        } catch {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end('{"error":"Invalid JSON"}');
        }
      });
      return;
    }

    if (req.method === "DELETE") {
      const store = readStore();
      delete store[key];
      writeStore(store);
      broadcast({ type: "store-delete", key });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end('{"ok":true}');
      return;
    }
  }

  // Export workspace as JSON bundle
  if (req.method === "GET" && pathname === "/api/export") {
    const bundle = { pages: {}, storage: {}, metadata: {} };

    // Pages
    const pageFiles = fs.readdirSync(PAGES_DIR).filter(f => f.endsWith(".html"));
    for (const f of pageFiles) {
      bundle.pages[f] = fs.readFileSync(path.join(PAGES_DIR, f), "utf8");
    }

    // Storage
    const storageFiles = fs.readdirSync(STORAGE_DIR).filter(f => f.endsWith(".json"));
    for (const f of storageFiles) {
      try {
        bundle.storage[f.replace(/\.json$/, "")] = JSON.parse(
          fs.readFileSync(path.join(STORAGE_DIR, f), "utf8")
        );
      } catch {}
    }

    // Metadata
    const metaFiles = fs.readdirSync(METADATA_DIR).filter(f => f.endsWith(".json"));
    for (const f of metaFiles) {
      try {
        bundle.metadata[f.replace(/\.json$/, "")] = JSON.parse(
          fs.readFileSync(path.join(METADATA_DIR, f), "utf8")
        );
      } catch {}
    }

    // Shared store
    bundle.sharedStore = readStore();

    const json = JSON.stringify(bundle, null, 2);
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Content-Disposition": 'attachment; filename="mini-frames-export.json"',
      "Content-Length": Buffer.byteLength(json)
    });
    res.end(json);
    return;
  }

  // Import workspace from JSON bundle
  if (req.method === "POST" && pathname === "/api/import") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const bundle = JSON.parse(body);
        let imported = { pages: 0, storage: 0, metadata: 0 };

        // Pages
        if (bundle.pages) {
          for (const [filename, content] of Object.entries(bundle.pages)) {
            if (filename.endsWith(".html") && typeof content === "string") {
              fs.writeFileSync(path.join(PAGES_DIR, filename), content, "utf8");
              imported.pages++;
            }
          }
        }

        // Storage
        if (bundle.storage) {
          for (const [id, data] of Object.entries(bundle.storage)) {
            fs.writeFileSync(
              path.join(STORAGE_DIR, id + ".json"),
              JSON.stringify(data, null, 2),
              "utf8"
            );
            imported.storage++;
          }
        }

        // Metadata
        if (bundle.metadata) {
          for (const [id, data] of Object.entries(bundle.metadata)) {
            fs.writeFileSync(
              path.join(METADATA_DIR, id + ".json"),
              JSON.stringify(data, null, 2),
              "utf8"
            );
            imported.metadata++;
          }
        }

        // Shared store
        if (bundle.sharedStore && typeof bundle.sharedStore === "object") {
          const existing = readStore();
          Object.assign(existing, bundle.sharedStore);
          writeStore(existing);
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, imported }));
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid bundle: " + e.message }));
      }
    });
    return;
  }

  // Determine which directory to serve from
  let filePath;
  if (pathname.startsWith("/pages/")) {
    filePath = path.join(PAGES_DIR, pathname.slice("/pages/".length));
  } else {
    filePath = path.join(PUBLIC_DIR, pathname === "/" ? "index.html" : pathname);
  }

  // Prevent directory traversal
  const root = pathname.startsWith("/pages/") ? PAGES_DIR : PUBLIC_DIR;
  if (!path.resolve(filePath).startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not Found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    // Auto-inject MF SDK into HTML pages served from /pages/
    if (ext === ".html" && pathname.startsWith("/pages/")) {
      const sdkTag = '<script src="/js/mf-sdk.js"></script>';
      let html = data.toString("utf-8");
      if (html.includes("</head>")) {
        html = html.replace("</head>", sdkTag + "</head>");
      } else {
        html = sdkTag + html;
      }
      res.writeHead(200, { "Content-Type": contentType });
      res.end(html);
      return;
    }

    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  });
});

// --- WebSocket server ---

const wss = new WebSocketServer({ server });

function broadcast(message) {
  const data = JSON.stringify(message);
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(data);
  }
}

wss.on("connection", (ws) => {
  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    if (msg.type === "register" && msg.pageId) {
      ws._pageId = msg.pageId;
      if (!pageClients.has(msg.pageId)) {
        pageClients.set(msg.pageId, new Set());
      }
      pageClients.get(msg.pageId).add(ws);
      return;
    }

    if (msg.type === "msg" && msg.to) {
      const targets = pageClients.get(msg.to);
      if (targets) {
        const data = JSON.stringify(msg);
        for (const client of targets) {
          if (client.readyState === 1) client.send(data);
        }
      }
      return;
    }

    if (msg.type === "broadcast") {
      const data = JSON.stringify(msg);
      for (const [, clients] of pageClients) {
        for (const client of clients) {
          if (client !== ws && client.readyState === 1) client.send(data);
        }
      }
      return;
    }
  });

  ws.on("close", () => {
    if (ws._pageId && pageClients.has(ws._pageId)) {
      const set = pageClients.get(ws._pageId);
      set.delete(ws);
      if (set.size === 0) pageClients.delete(ws._pageId);
    }
  });
});

// Debounced file watcher
const pending = new Map(); // filename -> timeout

fs.watch(PAGES_DIR, { recursive: false }, (_event, rawFilename) => {
  if (!rawFilename) return;
  const filename = rawFilename.replace(/\\/g, "/");

  if (pending.has(filename)) clearTimeout(pending.get(filename));

  pending.set(
    filename,
    setTimeout(() => {
      pending.delete(filename);
      const filePath = path.join(PAGES_DIR, filename);
      const exists = fs.existsSync(filePath);

      if (exists && !knownFiles.has(filename)) {
        knownFiles.add(filename);
        broadcast({ type: "add", filename });
      } else if (exists && knownFiles.has(filename)) {
        broadcast({ type: "change", filename });
      } else if (!exists && knownFiles.has(filename)) {
        knownFiles.delete(filename);
        broadcast({ type: "delete", filename });
      }
    }, 100)
  );
});

// --- Start ---

server.listen(PORT, () => {
  console.log(`Mini Frames running at http://localhost:${PORT}`);
  console.log(`Data directory: ${DATA_DIR}`);
});
