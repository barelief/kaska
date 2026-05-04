/**
 * Dev launcher — starts the proxy server and opens the browser.
 * Usage: pnpm dev
 */

const { spawn, exec } = require("child_process");

const server = spawn("node", ["server.js"], { stdio: "inherit" });

server.on("error", (err) => {
  console.error("Failed to start server:", err.message);
  process.exit(1);
});

// Give the server a moment to bind, then open the browser.
setTimeout(() => {
  const url = "http://localhost:8765?autoconnect=1";
  const cmd =
    process.platform === "win32" ? `start "${url}"` :
    process.platform === "darwin" ? `open "${url}"` :
    `xdg-open "${url}"`;
  exec(cmd, (err) => { if (err) console.warn("Could not open browser:", err.message); });
  console.log(`\nOpening ${url}`);
}, 800);

process.on("SIGINT", () => { server.kill(); process.exit(0); });
process.on("SIGTERM", () => { server.kill(); process.exit(0); });
