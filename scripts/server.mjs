// Небольшой сервер: статика из public/ и маршруты API. Документы обрабатываются в памяти и не сохраняются.
// Запуск: npm start  (PORT берётся из окружения, слушает 0.0.0.0, подходит для Railway/Render/Fly).
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, normalize, extname } from "node:path";
import { checkPack, validateDocs } from "../lib/pipeline.js";
import { aiMode } from "../lib/extract/index.js";
import { usesJsonFallback } from "../lib/extract/meta.js";
import { providerConfig, describeMode } from "../lib/extract/providers.js";
import { samples } from "../lib/generate.js";
import { buildLetter } from "../lib/letters.js";
import { readUpload } from "../lib/upload.js";
import { MAX_FILE_BYTES, InputError } from "../lib/files.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".json": "application/json" };
const BODY_LIMIT = 400_000; // JSON: три текста по 20 000 символов плюс разбор фото

// Заголовки безопасности на каждом ответе. CSP строгая: скрипты и стили только с нашего источника,
// без 'unsafe-inline'; внешние шрифты, фреймы и плагины запрещены. CORS не включаем: API только для своего сайта.
const CSP = [
  "default-src 'self'", "script-src 'self'", "style-src 'self'", "img-src 'self' data: blob:", "font-src 'self'",
  "connect-src 'self'", "object-src 'none'", "base-uri 'none'", "frame-ancestors 'none'", "form-action 'self'",
].join("; ");
const SECURITY_HEADERS = {
  "content-security-policy": CSP,
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-resource-policy": "same-origin",
  "x-frame-options": "DENY",
};
// HSTS только когда сайт действительно открыт по HTTPS (за прокси хостинга или NODE_ENV=production)
const isHttps = (req) => (process.env.TRUST_PROXY === "1" && req?.headers["x-forwarded-proto"] === "https") || process.env.NODE_ENV === "production";

let currentReq = null;
const send = (res, code, body, type = "application/json; charset=utf-8", extra = {}) => {
  const headers = { "content-type": type, "cache-control": "no-store", ...SECURITY_HEADERS, ...extra };
  if (isHttps(res.req ?? currentReq)) headers["strict-transport-security"] = "max-age=31536000; includeSubDomains";
  res.writeHead(code, headers);
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};

// Ограничение частоты по IP для API (в памяти процесса): RATE_LIMIT_PER_MIN, по умолчанию 30 в минуту.
// IP из X-Forwarded-For берём только при TRUST_PROXY=1 (Railway и другие прокси), иначе его можно подделать.
const hits = new Map();
function clientIp(req) {
  const fwd = process.env.TRUST_PROXY === "1" ? String(req.headers["x-forwarded-for"] ?? "").split(",")[0].trim() : "";
  return fwd || req.socket.remoteAddress || "unknown";
}
export function rateLimited(req, now = Date.now()) {
  const limit = Number(process.env.RATE_LIMIT_PER_MIN) > 0 ? Number(process.env.RATE_LIMIT_PER_MIN) : 30;
  const ip = clientIp(req), list = (hits.get(ip) ?? []).filter((t) => now - t < 60000);
  if (list.length >= limit) { hits.set(ip, list); return Math.ceil((60000 - (now - list[0])) / 1000); }
  list.push(now); hits.set(ip, list);
  if (hits.size > 10000) for (const [k, v] of hits) if (!v.some((t) => now - t < 60000)) hits.delete(k); // не копим память
  return 0;
}
export const resetRateLimit = () => hits.clear();

// Запросы к API только со своего сайта: Origin, если он есть, должен совпадать с хостом или ALLOWED_ORIGINS.
function originAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // запросы не из браузера (curl, тесты) Origin не присылают
  const allowed = String(process.env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  try { return new URL(origin).host === req.headers.host || allowed.includes(origin); } catch { return false; }
}

function readRaw(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0, tooLarge = Number(req.headers["content-length"]) > limit; const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (tooLarge || size > limit) { tooLarge = true; chunks.length = 0; return; } // читаем до конца, но не храним
      chunks.push(c);
    });
    req.on("end", () => (tooLarge ? reject(new InputError(413, "file_too_large", `file is larger than ${MAX_FILE_BYTES} bytes`)) : resolve(Buffer.concat(chunks))));
    req.on("error", reject);
  });
}

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
      let v;
      try { v = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch { return reject(Object.assign(new Error("bad json"), { code: 400 })); }
      // верхний уровень только объект: null, массив, число или строка это ошибка клиента (400), а не сервера
      if (!v || typeof v !== "object" || Array.isArray(v)) return reject(Object.assign(new Error("bad shape"), { code: 400 }));
      resolve(v);
    });
    req.on("error", reject);
  });
}

export function createApp() {
  const server = createServer(async (req, res) => {
    currentReq = req;
    // один контекст отмены на запрос: клиент закрыл соединение до ответа — запросы к модели и повторы прекращаются
    const ac = new AbortController();
    res.on("close", () => { if (!res.writableFinished) ac.abort(); });
    try {
      const url = new URL(req.url, "http://x");
      if (url.pathname === "/healthz") return send(res, 200, "ok", "text/plain");
      if (url.pathname.startsWith("/api/")) {
        if (req.method === "POST" && !originAllowed(req)) return send(res, 403, { error: "origin not allowed", code: "origin_not_allowed" });
        if (req.method === "POST") {
          const wait = rateLimited(req);
          if (wait) return send(res, 429, { error: "too many requests", code: "too_many_requests" }, undefined, { "retry-after": String(wait) });
        }
      }
      if (url.pathname === "/api/config" && req.method === "GET") return send(res, 200, { aiMode: aiMode(), mode: describeMode(), jsonFallback: usesJsonFallback(providerConfig()), maxFileBytes: MAX_FILE_BYTES });
      if (url.pathname === "/api/samples" && req.method === "GET") return send(res, 200, samples());
      if (url.pathname === "/api/check" && req.method === "POST") {
        const body = await readBody(req);
        const err = validateDocs(body.docs);
        if (err) return send(res, 400, { error: err });
        return send(res, 200, await checkPack(body.docs, { signal: ac.signal }));
      }
      if (url.pathname === "/api/read" && req.method === "POST") {
        // один файл на запрос, сырым телом (без base64): тип документа можно передать в ?type=
        const buf = await readRaw(req, MAX_FILE_BYTES);
        return send(res, 200, await readUpload({ buf, type: url.searchParams.get("type") }, { signal: ac.signal }));
      }
      if (url.pathname === "/api/letter" && req.method === "POST") {
        const body = await readBody(req);
        if (!Array.isArray(body.findings) || body.findings.length > 20) return send(res, 400, { error: "findings must be an array of up to 20" });
        const summary = body.summary && typeof body.summary === "object" ? body.summary : null;
        return send(res, 200, { text: buildLetter(body.findings, body.lang, body.mode && typeof body.mode === "object" ? body.mode : {}, summary) });
      }
      // разбор по шаблону для листов документов на сайте: тот же файл, что у сервера (не копия), только он один
      if (url.pathname === "/shared/mock.js" && req.method === "GET") {
        return send(res, 200, await readFile(join(root, "..", "lib", "extract", "mock.js")), TYPES[".js"]);
      }
      // юридические черновики: только белый список файлов из docs/legal, как простой текст
      const legal = url.pathname.match(/^\/legal\/(ru|kk|en)\/(TERMS|PRIVACY|CONSENT|DISCLAIMER)\.md$/);
      if (legal && req.method === "GET") {
        const data = await readFile(join(root, "..", "docs", "legal", legal[1], `${legal[2]}.md`));
        return send(res, 200, data, "text/plain; charset=utf-8");
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
      if (e?.kind === "cancelled" || ac.signal.aborted) return; // клиента уже нет, отвечать некому
      if (e instanceof InputError) return send(res, e.status, { error: e.message, code: e.code, ...(e.reason ? { reason: e.reason } : {}), ...(e.markers ? { markers: e.markers } : {}), ...(e.afterSend ? { afterSend: true } : {}) });
      // наружу только код ошибки: без стека, путей и текста исключения
      send(res, e.code === 413 ? 413 : e.code === 400 ? 400 : 500, { error: e.code === 413 ? "request too large" : e.code === 400 ? "bad request" : "server error", code: e.code === 413 ? "body_too_large" : e.code === 400 ? "bad_request" : "server_error" });
    }
  });
  // таймауты: медленный клиент не держит соединение бесконечно (модель ждём не дольше двух попыток по 25 с)
  server.requestTimeout = 120000;
  server.headersTimeout = 20000;
  server.keepAliveTimeout = 5000;
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT) || 3000;
  const m = describeMode();
  createApp().listen(port, "0.0.0.0", () => console.log(`TradeDoc AI on :${port} (AI mode: ${m.provider}${m.model ? ` · ${m.model}` : ""}${m.fallback ? ` · fallback ${m.fallback.provider}` : ""}${m.missing.length ? ` · missing ${m.missing.join(", ")}` : ""})`));
}
