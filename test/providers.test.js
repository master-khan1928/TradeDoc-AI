// Блок A: слой провайдеров (mock | gemini | groq | openrouter | meta), лимиты, кэш, резерв, только синтетика.
// Провайдеры подделаны: сеть не используется.
import test from "node:test";
import assert from "node:assert/strict";
import { activeProviderName, providerConfig, describeMode, PROVIDERS } from "../lib/extract/providers.js";
import { createLimiter, extractionCache, resetLimiters } from "../lib/extract/limits.js";
import { extractAll } from "../lib/extract/index.js";
import { readUpload } from "../lib/upload.js";
import { checkPack } from "../lib/pipeline.js";
import { findRealDataMarkers, maskPersonalData, validIin, validKzIban } from "../lib/pii.js";
import { samples, makeSet } from "../lib/generate.js";
import { makeDirtySet } from "../lib/generate-dirty.js";
import { renderTextPng } from "../lib/text-image.js";
import { mockExtract } from "../lib/extract/mock.js";

const GEM = { LLM_PROVIDER: "gemini", GEMINI_API_KEY: "fake-gem", GEMINI_MODEL: "gem-test", LLM_RPM: "1000" };
const GROQ = { LLM_PROVIDER: "groq", GROQ_API_KEY: "fake-groq", LLM_RPM: "1000" };
const four = samples().find((s) => s.id === "four").docs;

// «идеальный читатель» вместо модели: разбор по шаблону того текста, что пришёл в запросе
function fakeModel({ status = 200, failFirst = 0 } = {}) {
  const calls = [];
  const ok = (obj) => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify(obj) } }] }) });
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, body, auth: init.headers.authorization });
    if (calls.length <= failFirst) return { ok: false, status, headers: new Map([["retry-after", "0"]]), json: async () => ({}), text: async () => "" };
    const user = body.messages[1].content;
    if (Array.isArray(user)) return ok({ transcription: "INVOICE\nInvoice No: INV-1", fields: { number: { value: "INV-1", page: 1, quote: "Invoice No: INV-1", confidence: 1 } }, items: [] });
    const text = user.replace(/^[\s\S]*?<document>\n?/, "").replace(/\n?<\/document>[\s\S]*$/, "").replace(/^Document type: \w+\n\n/, "");
    const ex = mockExtract({ type: "x", text });
    return ok({ fields: ex.fields, items: ex.items });
  };
  return { fetchImpl, calls };
}

test("выбор провайдера: по умолчанию MOCK; Meta по-старому по META_*; LLM_PROVIDER явно", () => {
  assert.equal(activeProviderName({}), "mock");
  assert.equal(activeProviderName({ META_API_KEY: "k", META_MODEL: "m" }), "meta");
  assert.equal(activeProviderName({ LLM_PROVIDER: "gemini" }), "gemini");
  assert.equal(activeProviderName({ LLM_PROVIDER: "nope" }), "mock");
  assert.equal(activeProviderName({ ...GEM, AI_MODE: "mock" }), "mock");
  assert.equal(providerConfig({ LLM_PROVIDER: "gemini", GEMINI_API_KEY: "k" }), null, "модель Gemini не зашита: без GEMINI_MODEL нет режима");
  assert.deepEqual(describeMode({ LLM_PROVIDER: "gemini", GEMINI_API_KEY: "k" }).missing, ["GEMINI_MODEL"]);
  assert.equal(providerConfig(GROQ).model, "qwen/qwen3.8-27b", "модель Groq из документации");
  assert.equal(PROVIDERS.gemini.base, "https://generativelanguage.googleapis.com/v1beta/openai");
  const d = describeMode(GEM);
  assert.deepEqual([d.provider, d.label, d.model, d.demoOnly, d.meta], ["gemini", "Google Gemini", "gem-test", true, "waiting_key"]);
  assert.equal(describeMode({ LLM_PROVIDER: "meta", META_API_KEY: "k", META_MODEL: "m" }).meta, "active");
});

test("Gemini: OpenAI-совместимый запрос с json_schema; результат помечен провайдером и моделью", async () => {
  extractionCache.clear(); resetLimiters();
  const f = fakeModel();
  const r = await checkPack(four, { env: GEM, fetchImpl: f.fetchImpl });
  assert.equal(f.calls[0].url, "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
  assert.equal(f.calls[0].body.response_format.type, "json_schema");
  assert.equal(f.calls[0].auth, "Bearer fake-gem");
  assert.deepEqual([r.mode, r.provider.label, r.provider.model, r.provider.demoOnly], ["gemini", "Google Gemini", "gem-test", true]);
  assert.ok(r.findings.some((x) => x.id === "gross_weight"));
});

test("Groq: JSON mode (json_object) со схемой в инструкции; фото уходит как image_url", async () => {
  extractionCache.clear(); resetLimiters();
  const f = fakeModel();
  await extractAll([four[0]], { env: GROQ, fetchImpl: f.fetchImpl });
  assert.equal(f.calls[0].url, "https://api.groq.com/openai/v1/chat/completions");
  assert.equal(f.calls[0].body.response_format.type, "json_object");
  assert.match(f.calls[0].body.messages[0].content, /JSON Schema/);
  const g = fakeModel();
  const up = await readUpload({ buf: renderTextPng(["INVOICE", "Invoice No: INV-1"]).png }, { env: GROQ, fetchImpl: g.fetchImpl });
  assert.equal(g.calls[0].body.messages[1].content[1].type, "image_url");
  assert.equal(up.provider.name, "groq");
  assert.match(up.sha256, /^[0-9a-f]{64}$/);
});

test("свой лимит частоты: лишний запрос ждёт, а если ждать слишком долго, понятная ошибка", async () => {
  let t = 0;
  const waits = [];
  const acquire = createLimiter({ rpm: 2, now: () => t, sleep: async (ms) => { waits.push(ms); t += ms; } });
  await acquire(); await acquire();
  await acquire(60000);
  assert.deepEqual(waits, [60000], "третий запрос подождал окно");
  const one = createLimiter({ rpm: 1, now: () => 0, sleep: async () => {} });
  await one();
  await assert.rejects(one(1000), (e) => e.kind === "rate_local");
});

test("429: один повтор после паузы; резервный провайдер, если основной исчерпал лимит", async () => {
  extractionCache.clear(); resetLimiters();
  const env = { ...GROQ, LLM_FALLBACK: "gemini", GEMINI_API_KEY: "fake-gem", GEMINI_MODEL: "gem-test" };
  const f = fakeModel({ status: 429, failFirst: 2 }); // Groq отвечает 429 дважды (запрос и повтор)
  const r = await extractAll([four[0]], { env, fetchImpl: f.fetchImpl });
  assert.ok(f.calls[0].url.includes("groq"));
  assert.ok(f.calls[1].url.includes("groq"), "повтор у того же провайдера");
  assert.ok(f.calls[2].url.includes("generativelanguage"), "дальше резервный");
  assert.deepEqual([r.mode, r.fallbackFrom, r.aiUnavailable], ["gemini", "groq", false]);
});

test("лимит исчерпан и резерва нет: честный возврат к MOCK с причиной rate", async () => {
  extractionCache.clear(); resetLimiters();
  const f = fakeModel({ status: 429, failFirst: 99 });
  const r = await checkPack(four, { env: GROQ, fetchImpl: f.fetchImpl });
  assert.deepEqual([r.mode, r.aiUnavailable, r.aiError], ["mock", true, "rate"]);
});

test("кэш по хэшу документа: повторная проверка того же комплекта не тратит лимит; для Meta кэша нет", async () => {
  extractionCache.clear(); resetLimiters();
  const f = fakeModel();
  await checkPack(four, { env: GEM, fetchImpl: f.fetchImpl });
  const n = f.calls.length;
  const again = await checkPack(four, { env: GEM, fetchImpl: f.fetchImpl });
  assert.equal(f.calls.length, n, "второй раз модель не вызывалась");
  assert.equal(again.cachedDocs, 3);
  const m = fakeModel();
  const meta = { META_API_KEY: "k", META_MODEL: "m" };
  await checkPack(four, { env: meta, fetchImpl: m.fetchImpl });
  await checkPack(four, { env: meta, fetchImpl: m.fetchImpl });
  assert.equal(m.calls.length, 6, "Meta: реальные документы не кэшируем");
});

// корректные контрольные цифры для тестовых значений считаем сами (значения вымышленные)
const iinWithCheck = (p11) => [..."0123456789"].map((d) => p11 + d).find(validIin);
function kzIban(bban) { for (let c = 0; c < 100; c++) { const v = `KZ${String(c).padStart(2, "0")}${bban}`; if (validKzIban(v)) return v; } }

test("бесплатный режим: документ с признаками реальных данных не отправляется в модель", async () => {
  const iin = iinWithCheck("90010130012");
  assert.ok(iin && validIin(iin));
  const doc = { type: "invoice", text: four[0].text + `\nВодитель: Иванов Иван\nИИН: ${iin}` };
  const f = fakeModel();
  await assert.rejects(extractAll([doc], { env: GEM, fetchImpl: f.fetchImpl }), (e) => e.code === "real_data_suspected" && e.markers.includes("iin"));
  assert.equal(f.calls.length, 0, "ни одного запроса к провайдеру");
});

test("Meta: персональные данные маскируются до отправки, проверка не ломается", async () => {
  resetLimiters();
  const iin = iinWithCheck("85120540001"), iban = kzIban("125KZT5004100100");
  assert.ok(iin && iban);
  const text = four[2].text + `\nВодитель: Петров Пётр\nТел: +7 701 234 56 78\nИИН: ${iin}\nE-mail: driver@carrier.kz\nСчёт: ${iban}`;
  const f = fakeModel();
  const r = await checkPack([four[0], four[1], { type: "cmr", text }], { env: { META_API_KEY: "k", META_MODEL: "m" }, fetchImpl: f.fetchImpl });
  const sent = f.calls.map((c) => c.body.messages[1].content).join("\n");
  for (const secret of ["Петров", "234 56 78", iin, "driver@carrier.kz", iban]) assert.ok(!sent.includes(secret), `ушло в модель: ${secret}`);
  assert.match(sent, /\[скрыто: ФИО\]/);
  assert.deepEqual(Object.keys(r.masked).sort(), ["email", "iban", "iin", "person", "phone"]);
  assert.ok(r.findings.some((x) => x.id === "gross_weight"), "сверка веса работает на замаскированном тексте");
});

test("синтетические комплекты не блокируются как реальные данные (нет ложных срабатываний)", () => {
  const texts = [];
  for (const s of samples()) for (const d of s.docs) texts.push(d.text);
  for (let i = 0; i < 40; i++) { for (const d of makeSet(i, []).docs) texts.push(d.text); for (const d of makeDirtySet(i, []).docs) texts.push(d.text); }
  for (const t of texts) assert.deepEqual(findRealDataMarkers(t), [], t.split("\n")[0]);
  assert.deepEqual(maskPersonalData("Tel: +7 700 000 0000 | BIN: 000000000000").masked, {}, "заглушки из синтетики не маскируются");
});
