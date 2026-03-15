#!/usr/bin/env node
const http = require("http");
const { spawn } = require("child_process");
const path = require("path");

const PORT = parseInt(process.env.PORT, 10) || 3000;
const HEALTH_URL = `http://localhost:${PORT}/api/pages`;
const SERVER_SCRIPT = path.join(__dirname, "..", "server.js");

function checkServer() {
  return new Promise((resolve) => {
    const req = http.get(HEALTH_URL, (res) => {
      res.resume();
      resolve(true);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function main() {
  const running = await checkServer();
  if (running) {
    console.log(`Mini Frames server already running on port ${PORT}`);
    process.exit(0);
  }

  console.log(`Starting Mini Frames server on port ${PORT}...`);
  const child = spawn(process.execPath, [SERVER_SCRIPT], {
    detached: true,
    stdio: "ignore",
    env: { ...process.env, PORT: String(PORT) },
  });
  child.unref();
  console.log(`Server spawned (pid ${child.pid})`);
  process.exit(0);
}

main();
