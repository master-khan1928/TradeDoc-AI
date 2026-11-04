// Подготовка к первому запуску с ключом: таймаут, не больше одного повтора, диагнозы, запасной режим JSON, зонд.
// Модель везде подделана; сеть не используется.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import { callModel, metaConfig, metaExtract, EXTRACTION_SCHEMA, resetJsonFallback, usesJsonFallback, parseJsonContent } from "../lib/extract/meta.js";
import { extractAll } from "../lib/extract/index.js";
import { readUpload } from "../lib/upload.js";
import { runProbe, PROBE_DOC } from "../lib/probe.js";
import { renderTextPng } from "../lib/text-image.js";
import { sniffFormat } from "../lib/files.js";

const SECRET = "sk-test-SECRET-123";
const cfg = (extra = {}) => metaConfig({ META_API_KEY: SECRET, META_MODEL: "m", META_BASE_URL: "https://example.test/v1", ...extra });
const MSG = [{ role: "system", content: "s" }, { role: "user", content: "u" }];
const okJson = (obj) => ({ status: 200, json: { choices: [{ message: { content: typeof obj === "string" ? obj : JSON.stringify(obj) } }] } });

/** Подделка сервиса: по очереди отдаёт ответы; "network" бросает ошибку сети, "hang" ждёт таймаута. */
function fake(script) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push(JSON.parse(init.body));
    const step = script[Math.min(calls.length - 1, script.length - 1)];
    if (step === "network") throw new TypeError("fetch failed");
    if (step === "hang") return new Promise((_, rej) => init.signal.addEventListener("abort", () => rej(init.signal.reason)));
    return { ok: step.status < 400, status: step.status, json: async () => step.json, text: async () => step.text ?? "" };
  };
  return { fetchImpl, calls };
}
const fast = { retryDelayMs: 1, quiet: true };

test("401/403/404/400: без повторов, понятный вид ошибки", async () => {
  for (const [status, kind] of [[401, "auth"], [403, "auth"], [404, "model"], [400, "bad_request"]]) {
    const f = fake([{ status }]);
    await assert.rejects(callModel(cfg(), MSG, EXTRACTION_SCHEMA, f.fetchImpl, fast), (e) => e.kind === kind && e.status === status);
    assert.equal(f.calls.length, 1, `${status}: повтор не нужен`);
  }
});

test("временный сбой: ровно один повтор, не больше", async () => {
  const ok = fake([{ status: 503 }, okJson({ fields: {}, items: [] })]);
  const r = await callModel(cfg(), MSG, EXTRACTION_SCHEMA, ok.fetchImpl, fast);
  assert.equal(ok.calls.length, 2);
  assert.equal(r.status, 200);
  for (const [step, kind] of [[{ status: 429 }, "rate"], [{ status: 502 }, "server"], ["network", "network"]]) {
    const f = fake([step, step, step]);
    await assert.rejects(callModel(cfg(), MSG, EXTRACTION_SCHEMA, f.fetchImpl, fast), (e) => e.kind === kind);
    assert.equal(f.calls.length, 2, `${kind}: один повтор`);
  }
});

test("таймаут запроса: META_TIMEOUT_MS, один повтор, вид timeout", async () => {
  const f = fake(["hang"]);
  const t0 = Date.now();
  await assert.rejects(callModel(cfg({ META_TIMEOUT_MS: "40" }), MSG, EXTRACTION_SCHEMA, f.fetchImpl, fast), (e) => e.kind === "timeout");
  assert.equal(f.calls.length, 2);
  assert.ok(Date.now() - t0 < 2000);
});

test("ответ не по схеме: bad_response", async () => {
  const f = fake([okJson("Sorry, I cannot help with that.")]);
  await assert.rejects(callModel(cfg(), MSG, EXTRACTION_SCHEMA, f.fetchImpl, fast), (e) => e.kind === "bad_response");
});

test("запасной режим: только после явного отказа json_schema; цитаты проверяются так же", async () => {
  resetJsonFallback();
  const text = PROBE_DOC.join("\n");
  const reply = "```json\n" + JSON.stringify({
    fields: {
      number: { value: "INV-2026-0042", page: 1, quote: "Invoice No: INV-2026-0042", confidence: 0.9 },
      total: { value: "1.00", page: 1, quote: "Total: 1.00", confidence: 0.9 }, // выдумка
    },
    items: [],
  }) + "\n```";
  const f = fake([{ status: 400, text: '{"error":{"message":"response_format json_schema is not supported"}}' }, okJson(reply), okJson(reply)]);
  const out = await extractAll([{ type: "invoice", text }], { env: { META_API_KEY: SECRET, META_MODEL: "m", META_BASE_URL: "https://example.test/v1" }, fetchImpl: f.fetchImpl });
  assert.equal(f.calls[0].response_format.type, "json_schema");
  assert.equal(f.calls[1].response_format, undefined, "запасной режим без response_format");
  assert.match(f.calls[1].messages[0].content, /Return ONLY one JSON object/);
  assert.equal(out.jsonFallback, true);
  assert.equal(out.mode, "meta");
  assert.ok(out.docs[0].fields.number);
  assert.ok(!out.docs[0].fields.total, "выдуманная цитата отброшена и в запасном режиме");
  assert.ok(usesJsonFallback(cfg()));
  // следующий запрос сразу в запасном режиме: json_schema больше не пробуем
  await metaExtract({ type: "invoice", text }, cfg(), f.fetchImpl, fast);
  assert.equal(f.calls[2].response_format, undefined);
  resetJsonFallback();
});

test("400 без упоминания схемы: запасной режим НЕ включается", async () => {
  resetJsonFallback();
  const f = fake([{ status: 400, text: '{"error":"bad image"}' }]);
  await assert.rejects(callModel(cfg(), MSG, EXTRACTION_SCHEMA, f.fetchImpl, fast), (e) => e.kind === "bad_request");
  assert.equal(usesJsonFallback(cfg()), false);
});

test("разбор JSON из ответа в запасном режиме", () => {
  assert.deepEqual(parseJsonContent('Here it is: {"a":1} hope it helps'), { a: 1 });
  assert.deepEqual(parseJsonContent('```json\n{"a":2}\n```'), { a: 2 });
  assert.throws(() => parseJsonContent("[1,2]"), (e) => e.kind === "bad_response");
});

test("сайт получает вид сбоя: при проверке (aiError) и при чтении фото (reason)", async () => {
  const env = { META_API_KEY: SECRET, META_MODEL: "m", META_BASE_URL: "https://example.test/v1" };
  const out = await extractAll([{ type: "invoice", text: PROBE_DOC.join("\n") }], { env, fetchImpl: fake([{ status: 401 }]).fetchImpl });
  assert.equal(out.aiUnavailable, true);
  assert.equal(out.aiError, "auth");
  const png = renderTextPng(["INVOICE"]).png;
  await assert.rejects(readUpload({ buf: png }, { env, fetchImpl: fake([{ status: 401 }]).fetchImpl }), (e) => e.code === "ai_unavailable" && e.reason === "auth");
});

test("синтетическое изображение: настоящий PNG, текст нарисован", () => {
  const { png, text, width, height } = renderTextPng(["Invoice No: 1", "Привет «Ёж»", "Қ"], { scale: 2 });
  assert.equal(sniffFormat(png).mime, "image/png");
  assert.equal(png.readUInt32BE(16), width);
  assert.equal(png.readUInt32BE(20), height);
  const idat = png.subarray(png.indexOf("IDAT") + 4, png.indexOf("IEND") - 8);
  assert.equal(inflateSync(idat).length, (width + 1) * height);
  assert.equal(text, "INVOICE NO: 1\nПРИВЕТ «ЁЖ»\n?", "русская кириллица нарисована; казахской Қ в шрифте нет, честно «?»");
});

async function probeLog(script, image = false) {
  const lines = [];
  const f = fake(script);
  const code = await runProbe({ cfg: cfg(), image, fetchImpl: f.fetchImpl, log: (l) => lines.push(l) });
  const out = lines.join("\n");
  assert.ok(!out.includes(SECRET), "ключ не выводится");
  assert.ok(!out.includes("Altyn Bidai") && !out.includes("ALTYN BIDAI"), "текст документа не выводится");
  return { code, out, calls: f.calls };
}

// контрольные поля PROBE_DOC (lib/probe.js): без них зонд не говорит «работает» (аудит №44)
const CONTROL = {
  number: { value: "INV-2026-0042", page: 1, quote: "Invoice No: INV-2026-0042", confidence: 1 },
  gross_weight: { value: "11220 kg", page: 1, quote: "Gross weight: 11220 kg", confidence: 1 },
  total: { value: "2420.00", page: 1, quote: "Total: 2420.00", confidence: 1 },
};

test("зонд: успех, статус, json_schema, сколько полей прошло проверку цитат", async () => {
  resetJsonFallback();
  const reply = { fields: { ...CONTROL, currency: { value: "EUR", page: 1, quote: "Currency: EUR", confidence: 1 } }, items: [] }; // currency выдумана
  const { code, out, calls } = await probeLog([okJson(reply)]);
  assert.equal(code, 0);
  assert.equal(calls.length, 1);
  assert.match(out, /HTTP-статус: 200 · формат запроса: json_schema/);
  assert.match(out, /json_schema: поддерживается/);
  assert.match(out, /полей 3 из 4/);
  assert.match(out, /контрольные поля прочитаны/);
});

test("зонд: json_schema не принят, запасной режим работает", async () => {
  resetJsonFallback();
  const { code, out } = await probeLog([{ status: 400, text: "unsupported response_format" }, okJson({ fields: CONTROL, items: [] })]);
  assert.equal(code, 0);
  assert.match(out, /НЕ поддерживается \(HTTP 400\); работает запасной режим/);
  resetJsonFallback();
});

test("зонд: диагнозы 401, 404, 429, сеть; без повторов", async () => {
  for (const [step, re] of [[{ status: 401 }, /ключ не принят/], [{ status: 404 }, /неверный идентификатор модели/], [{ status: 429 }, /лимит/], ["network", /сеть недоступна/]]) {
    const { code, out, calls } = await probeLog([step]);
    assert.equal(code, 1);
    assert.match(out, re);
    assert.equal(calls.length, 1, "зонд не повторяет: нужен честный статус");
  }
});

test("зонд --image: картинка уходит как data URI, цитаты сверяются с расшифровкой модели", async () => {
  resetJsonFallback();
  const transcription = "INVOICE\nINVOICE NO: INV-2026-0042\nTOTAL: 2420.00\nGROSS WEIGHT: 11220 KG";
  const reply = { transcription, fields: {
    number: { value: "INV-2026-0042", page: 1, quote: "INVOICE NO: INV-2026-0042", confidence: 1 },
    total: { value: "2420.00", page: 1, quote: "TOTAL: 2420.00", confidence: 1 },
    gross_weight: { value: "11220 KG", page: 1, quote: "GROSS WEIGHT: 11220 KG", confidence: 1 },
    currency: { value: "USD", page: 1, quote: "CURRENCY: USD", confidence: 1 }, // строки нет в расшифровке
  }, items: [] };
  const { code, out, calls } = await probeLog([okJson(reply)], true);
  assert.equal(code, 0);
  assert.match(calls[0].messages[1].content[1].image_url.url, /^data:image\/png;base64,/);
  assert.match(out, /полей 3 из 4/);
  assert.match(out, /PNG \d+×\d+/);
});

test("зонд без ключа: «Нужен META_API_KEY», код 2", () => {
  const env = { ...process.env }; delete env.META_API_KEY; delete env.META_MODEL;
  const r = spawnSync(process.execPath, [fileURLToPath(new URL("../scripts/probe-meta.mjs", import.meta.url))], { env, encoding: "utf8" });
  assert.equal(r.status, 2);
  assert.match(r.stdout, /Нужен META_API_KEY/);
});
