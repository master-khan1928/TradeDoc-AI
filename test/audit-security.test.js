// Регрессии по аудиту 05.11.2026, группа 3: приватность и безопасность. Модель всегда подделана,
// документы синтетические, «реальные» данные вымышлены и нужны только как признаки для эвристики.
import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { PDFDocument, PDFName, PDFString } from "pdf-lib";
import { readUpload } from "../lib/upload.js";
import { readPdfText } from "../lib/files.js";
import { checkPack } from "../lib/pipeline.js";
import { createCache, extractionCache, resetLimiters } from "../lib/extract/limits.js";
import { callModel, EXTRACTION_SCHEMA, resetJsonFallback } from "../lib/extract/meta.js";
import { createApp, resetRateLimit } from "../scripts/server.mjs";

const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
const reply = (obj) => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify(obj) } }] }) });
const GEMINI = { LLM_PROVIDER: "gemini", GEMINI_API_KEY: "fake", GEMINI_MODEL: "audit", LLM_RPM: "1000" };
const reset = () => { resetLimiters(); extractionCache.clear(); resetJsonFallback(); };
const msgs = [{ role: "system", content: "s" }, { role: "user", content: "u" }];
const cfg = (over = {}) => ({ provider: "meta", base: "https://x", key: "k", model: "m", timeoutMs: 1000, rpm: 1000, ...over });

test("№7: отклонённое фото с признаками реальных данных не остаётся в кэше", async () => {
  reset();
  const fetchImpl = async () => reply({ transcription: "INVOICE\nBuyer email: anna.petrova@mail.kz\nGross weight: 100 kg", fields: {}, items: [] });
  await assert.rejects(readUpload({ buf: PNG, type: "invoice" }, { env: GEMINI, fetchImpl }), (e) => e.code === "real_data_suspected" && e.afterSend);
  assert.equal(extractionCache.size, 0);
});

test("№7: запись кэша удаляется по сроку и без следующего чтения", () => {
  let now = 0;
  const c = createCache({ ttlMs: 1000, now: () => now });
  c.set("a", { x: 1 });
  now = 2000;
  c.sweep();
  assert.equal(c.size, 0);
});

test("№8: резервный бесплатный провайдер не получает документ с признаками реальных данных", async () => {
  reset();
  let geminiCalls = 0;
  const env = { META_API_KEY: "k", META_MODEL: "m", LLM_FALLBACK: "gemini", GEMINI_API_KEY: "g", GEMINI_MODEL: "gm", LLM_RPM: "1000" };
  const fetchImpl = async (url) => {
    if (String(url).includes("generativelanguage")) { geminiCalls++; return reply({ fields: {}, items: [] }); }
    throw new TypeError("network down");
  };
  const docs = [{ type: "invoice", text: "INVOICE\nSeller: Altyn Bidai LLP\nBuyer email: anna.petrova@mail.kz\nTotal: 187500 USD" }];
  const r = await checkPack(docs, { env, fetchImpl });
  assert.equal(geminiCalls, 0);
  assert.equal(r.mode, "mock");
});

async function pdfWithPageJs() {
  const doc = await PDFDocument.create();
  const page = doc.addPage();
  page.drawText("INVOICE No: AUDIT-001 synthetic security test");
  const action = doc.context.register(doc.context.obj({ S: PDFName.of("JavaScript"), JS: PDFString.of("void 0;") }));
  page.node.set(PDFName.of("AA"), doc.context.obj({ O: action }));
  return Buffer.from(await doc.save({ useObjectStreams: true }));
}

test("№41: PDF с JavaScript в сжатом действии страницы отклоняется", async () => {
  const bytes = await pdfWithPageJs();
  assert.equal(/\/JavaScript/.test(bytes.toString("latin1")), false, "байтовый поиск ключ не видит");
  await assert.rejects(readUpload({ buf: bytes, type: "invoice" }, { env: {} }), (e) => e.code === "pdf_active_content");
});

test("№42: после чтения PDF задача pdf.js уничтожается (и при отказе тоже)", async () => {
  const doc = await PDFDocument.create();
  doc.addPage().drawText("INVOICE No: AUDIT-002 synthetic text layer for cleanup test");
  const ok = Buffer.from(await doc.save());
  let proxy;
  await readPdfText(ok, { onProxy: (p) => { proxy = p; } });
  assert.equal(proxy.loadingTask.destroyed, true);
  proxy = null;
  await assert.rejects(readPdfText(await pdfWithPageJs(), { onProxy: (p) => { proxy = p; } }));
  assert.equal(proxy.loadingTask.destroyed, true);
});

test("№9: очень длинные названия не блокируют процесс и не дают pass", async () => {
  const long = Array.from({ length: 19000 }, (_, i) => (i % 2 ? "a" : "b")).join("");
  const docs = [{ type: "invoice", text: `Seller: ${long}` }, { type: "packing", text: `Seller: ${long.replace(/a/g, "c")}` }];
  const t0 = Date.now();
  const r = await checkPack(docs, { env: {} });
  assert.ok(Date.now() - t0 < 500, `заняло ${Date.now() - t0} мс`);
  assert.notEqual(r.checks.find((c) => c.id === "party_seller").status, "pass");
});

test("№39: общий бюджет попыток на операцию, с учётом смены формата", async () => {
  reset();
  const script = [503, 400, 503, 200];
  let calls = 0;
  const fetchImpl = async () => {
    const s = script[calls++] ?? 200;
    if (s === 200) return reply({ fields: {}, items: [] });
    return { ok: false, status: s, headers: { get: () => null }, text: async () => (s === 400 ? "response_format json_schema is not supported" : "") };
  };
  await assert.rejects(callModel(cfg(), msgs, EXTRACTION_SCHEMA, fetchImpl, { quiet: true, retryDelayMs: 1 }));
  assert.ok(calls <= 3, `вызовов: ${calls}`);
});

test("№43: таймаут чтения тела ответа — это timeout, а не bad_response", async () => {
  reset();
  const fetchImpl = async (url, init) => ({
    ok: true, status: 200,
    json: () => new Promise((_, rej) => init.signal.addEventListener("abort", () => rej(init.signal.reason))),
  });
  await assert.rejects(callModel(cfg({ timeoutMs: 100 }), msgs, EXTRACTION_SCHEMA, fetchImpl, { quiet: true, retries: 0 }), (e) => e.kind === "timeout");
});

test("№38: отмена операции останавливает повтор и не зовёт модель второй раз", async () => {
  reset();
  let calls = 0;
  const ac = new AbortController();
  const fetchImpl = async () => { calls++; await new Promise((r) => setTimeout(r, 40)); return { ok: false, status: 503, headers: { get: () => null }, text: async () => "" }; };
  const p = callModel(cfg(), msgs, EXTRACTION_SCHEMA, fetchImpl, { quiet: true, retryDelayMs: 300, signal: ac.signal });
  setTimeout(() => ac.abort(), 10);
  await assert.rejects(p, (e) => e.kind === "cancelled");
  await new Promise((r) => setTimeout(r, 500));
  assert.equal(calls, 1);
});

test("№38: закрытие клиента отменяет запрос к модели на сервере", async () => {
  reset(); resetRateLimit();
  let llmCalls = 0;
  const llm = createServer((req, res) => { llmCalls++; setTimeout(() => { res.writeHead(503); res.end("{}"); }, 40); });
  await new Promise((r) => llm.listen(0, "127.0.0.1", r));
  const saved = { ...process.env };
  Object.assign(process.env, { META_API_KEY: "k", META_MODEL: "m", META_BASE_URL: `http://127.0.0.1:${llm.address().port}`, LLM_RPM: "1000", RATE_LIMIT_PER_MIN: "1000" });
  delete process.env.AI_MODE; delete process.env.LLM_PROVIDER;
  const app = createApp();
  await new Promise((r) => app.listen(0, "127.0.0.1", r));
  try {
    const ac = new AbortController();
    const req = fetch(`http://127.0.0.1:${app.address().port}/api/check`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ docs: [{ type: "invoice", text: "INVOICE\nTotal: 5" }] }), signal: ac.signal });
    setTimeout(() => ac.abort(), 15);
    await assert.rejects(req);
    await new Promise((r) => setTimeout(r, 1300));
    assert.equal(llmCalls, 1, "после закрытия клиента повтор не выполняется");
  } finally {
    process.env = saved;
    await new Promise((r) => app.close(r)); await new Promise((r) => llm.close(r));
  }
});

test("№40: тело запроса не объект — 400, а не 500", async () => {
  resetRateLimit();
  const app = createApp();
  await new Promise((r) => app.listen(0, "127.0.0.1", r));
  try {
    for (const path of ["/api/check", "/api/letter"]) {
      for (const body of ["null", "[]", "5", '"x"']) {
        const res = await fetch(`http://127.0.0.1:${app.address().port}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body });
        assert.equal(res.status, 400, `${path} ${body}`);
      }
    }
  } finally { await new Promise((r) => app.close(r)); }
});
