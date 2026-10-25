import test from "node:test";
import assert from "node:assert/strict";
import { extractAll, aiMode } from "../lib/extract/index.js";
import { metaConfig, EXTRACTION_SCHEMA } from "../lib/extract/meta.js";
import { samples } from "../lib/generate.js";
import { createApp } from "../scripts/server.mjs";

const docs = samples()[0].docs;

test("режим ИИ: без ключа и модели всегда MOCK, ID модели в коде не зашит", () => {
  assert.equal(aiMode({}), "mock");
  assert.equal(aiMode({ META_API_KEY: "k" }), "mock"); // нет META_MODEL
  assert.equal(aiMode({ META_API_KEY: "k", META_MODEL: "m", AI_MODE: "mock" }), "mock");
  assert.equal(aiMode({ META_API_KEY: "k", META_MODEL: "m" }), "meta");
  assert.equal(metaConfig({ META_API_KEY: "k", META_MODEL: "m" }).base, "https://api.meta.ai/v1");
  assert.equal(EXTRACTION_SCHEMA.strict, true);
});

test("META: запрос в формате OpenAI с json_schema; ответ проходит проверку цитат", async () => {
  let seen;
  const fetchImpl = async (url, init) => {
    seen = { url, body: JSON.parse(init.body), auth: init.headers.authorization };
    const text = JSON.parse(init.body).messages[1].content;
    const line = text.split("\n").find((l) => l.startsWith("Invoice No:"));
    const content = JSON.stringify({
      fields: {
        number: { value: line.slice(12), page: 1, quote: line, confidence: 0.9 },
        total: { value: "1", page: 1, quote: "Total: 1.00", confidence: 0.9 }, // выдуманная цитата
      },
      items: [],
    });
    return { ok: true, json: async () => ({ choices: [{ message: { content } }] }) };
  };
  const env = { META_API_KEY: "secret", META_MODEL: "test-model", META_BASE_URL: "https://example.test/v1/" };
  const out = await extractAll([docs[0]], { env, fetchImpl });
  assert.equal(seen.url, "https://example.test/v1/chat/completions");
  assert.equal(seen.body.model, "test-model");
  assert.equal(seen.body.response_format.type, "json_schema");
  assert.equal(seen.auth, "Bearer secret");
  assert.equal(out.mode, "meta");
  assert.ok(out.docs[0].fields.number);
  assert.ok(!out.docs[0].fields.total, "выдуманная цитата должна быть отброшена");
  assert.equal(out.docs[0].dropped.length, 1);
});

test("META недоступен: честный возврат к MOCK с пометкой", async () => {
  const fetchImpl = async () => ({ ok: false, status: 503, json: async () => ({}) });
  const out = await extractAll(docs, { env: { META_API_KEY: "k", META_MODEL: "m" }, fetchImpl });
  assert.equal(out.aiUnavailable, true);
  assert.equal(out.mode, "mock");
  assert.ok(out.docs[0].fields.number);
});

async function withServer(fn) {
  const app = createApp();
  await new Promise((r) => app.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${app.address().port}`;
  try { await fn(base); } finally { await new Promise((r) => app.close(r)); }
}
const post = (base, path, body) => fetch(base + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

test("сервер: маршруты, лимиты, статика", async () => {
  await withServer(async (base) => {
    assert.equal(await (await fetch(base + "/healthz")).text(), "ok");
    assert.equal((await (await fetch(base + "/api/config")).json()).aiMode, "mock");
    assert.equal((await (await fetch(base + "/api/samples")).json()).length, 3);
    assert.match(await (await fetch(base + "/")).text(), /<html/i);

    const ok = await (await post(base, "/api/check", { docs })).json();
    assert.equal(ok.findings.length, 0);
    const bad = await post(base, "/api/check", { docs: [{ type: "passport", text: "x" }] });
    assert.equal(bad.status, 400);
    const big = await post(base, "/api/check", { docs: [{ type: "invoice", text: "x".repeat(250_000) }] });
    assert.equal(big.status, 413);

    const four = samples().find((s) => s.id === "four");
    const chk = await (await post(base, "/api/check", { docs: four.docs })).json();
    const letter = await (await post(base, "/api/letter", { findings: chk.findings, lang: "en" })).json();
    assert.match(letter.text, /confirm the correct values/);

    assert.equal((await fetch(base + "/api/nope")).status, 404);
    assert.equal((await fetch(base + "/..%2f..%2fpackage.json")).status, 400);
  });
});
