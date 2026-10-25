// Небольшой сервер без зависимостей: статика из public/ и четыре маршрута API.
// Запуск: npm start  (PORT берётся из окружения, слушает 0.0.0.0, подходит для Railway/Render/Fly).
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, normalize, extname } from "node:path";
import { checkPack, validateDocs } from "../lib/pipeline.js";
import { aiMode } from "../lib/extract/index.js";
import { samples } from "../lib/generate.js";
import { buildLetter } from "../lib/letters.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".json": "application/json" };
const BODY_LIMIT = 200_000;

const send = (res, code, body, type = "application/json; charset=utf-8") => {
  res.writeHead(code, { "content-type": type, "cache-control": "no-store", "x-content-type-options": "nosniff" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0, tooLarge = false; const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > BODY_LIMIT) { tooLarge = true; chunks.length = 0; return; } // читаем до конца, но не храним
      chunks.push(c);
    });
    req.on("end", () => {
      if (tooLarge) return reject(Object.assign(new Error("too large"), { code: 413 }));
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); } catch { reject(Object.assign(new Error("bad json"), { code: 400 })); }
    });
    req.on("error", reject);
  });
}

export function createApp() {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://x");
      if (url.pathname === "/healthz") return send(res, 200, "ok", "text/plain");
      if (url.pathname === "/api/config" && req.method === "GET") return send(res, 200, { aiMode: aiMode() });
      if (url.pathname === "/api/samples" && req.method === "GET") return send(res, 200, samples());
      if (url.pathname === "/api/check" && req.method === "POST") {
        const body = await readBody(req);
        const err = validateDocs(body.docs);
        if (err) return send(res, 400, { error: err });
        return send(res, 200, await checkPack(body.docs));
      }
      if (url.pathname === "/api/letter" && req.method === "POST") {
        const body = await readBody(req);
        if (!Array.isArray(body.findings) || body.findings.length > 20) return send(res, 400, { error: "findings must be an array of up to 20" });
        return send(res, 200, { text: buildLetter(body.findings, body.lang) });
      }
      if (url.pathname.startsWith("/api/")) return send(res, 404, { error: "not found" });
      if (req.method !== "GET") return send(res, 405, { error: "method not allowed" });
      // статика
      const decoded = decodeURIComponent(url.pathname);
      if (decoded.split(/[\\/]/).includes("..") || decoded.includes("\0")) return send(res, 400, { error: "bad path" });
      let rel = normalize(decoded).replace(/^([/\\])+/, "");
      if (!rel) rel = "index.html";
      try {
        const data = await readFile(join(root, rel));
        return send(res, 200, data, TYPES[extname(rel)] ?? "application/octet-stream");
      } catch {
        return send(res, 404, { error: "not found" });
      }
    } catch (e) {
      send(res, e.code === 413 ? 413 : e.code === 400 ? 400 : 500, { error: e.code === 413 ? "request too large" : e.code === 400 ? "bad request" : "server error" });
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT) || 3000;
  createApp().listen(port, "0.0.0.0", () => console.log(`TradeDoc AI on :${port} (AI mode: ${aiMode()})`));
}
