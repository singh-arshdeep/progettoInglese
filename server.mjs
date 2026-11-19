// Render web service: serves public/ and the game API on one port, no dependencies.
import http from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import handler from "./api/game.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "public");
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".mp4": "video/mp4", ".txt": "text/plain; charset=utf-8",
  ".ico": "image/x-icon", ".woff2": "font/woff2",
};

async function api(req, res) {
  let body = "";
  if (req.method === "POST") {
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 20000) { res.writeHead(413).end(); return; }
    }
  }
  const r = await handler(new Request("http://local" + req.url, { method: req.method, headers: { "content-type": "application/json" }, body: req.method === "POST" ? body : undefined }));
  res.writeHead(r.status, Object.fromEntries(r.headers));
  res.end(await r.text());
}

async function file(req, res, pathname) {
  let rel;
  try { rel = decodeURIComponent(pathname); } catch { res.writeHead(400).end(); return; }
  let f = path.join(root, rel);
  if (!f.startsWith(root)) { res.writeHead(403).end(); return; }
  let st;
  try {
    st = await stat(f);
    if (st.isDirectory()) { f = path.join(f, "index.html"); st = await stat(f); }
  } catch { res.writeHead(404, { "content-type": "text/plain" }).end("Not found"); return; }
  const ext = path.extname(f).toLowerCase();
  const headers = {
    "content-type": TYPES[ext] || "application/octet-stream",
    "cache-control": ext === ".html" ? "no-cache" : "public, max-age=3600",
    "accept-ranges": "bytes",
  };
  // videos need byte ranges (Safari and iPhones will not play them otherwise)
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "");
  if (m && (m[1] || m[2])) {
    let start = m[1] ? +m[1] : st.size - +m[2];
    let end = m[1] && m[2] ? +m[2] : st.size - 1;
    if (start < 0 || start >= st.size || end < start) { res.writeHead(416, { "content-range": `bytes */${st.size}` }).end(); return; }
    end = Math.min(end, st.size - 1);
    res.writeHead(206, { ...headers, "content-range": `bytes ${start}-${end}/${st.size}`, "content-length": end - start + 1 });
    createReadStream(f, { start, end }).pipe(res);
    return;
  }
  res.writeHead(200, { ...headers, "content-length": st.size });
  if (req.method === "HEAD") return res.end();
  createReadStream(f).pipe(res);
}

http.createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, "http://local");
    if (pathname === "/api/game") return await api(req, res);
    if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405).end(); return; }
    await file(req, res, pathname);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.writeHead(500, { "content-type": "text/plain" });
    res.end("Server error");
  }
}).listen(process.env.PORT || 3000, () => console.log("Review Lab on port " + (process.env.PORT || 3000)));
