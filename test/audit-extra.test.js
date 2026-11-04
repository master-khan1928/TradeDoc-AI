// Регрессии по аудиту 05.11.2026, группа 5 (выполненная часть): лимит дел и происхождение результата.
import test from "node:test";
import assert from "node:assert/strict";
import * as CS from "../public/case-store.js";
import { checkPack } from "../lib/pipeline.js";
import { resetLimiters, extractionCache } from "../lib/extract/limits.js";

test("№16: 21-е дело не создаётся молча за счёт удаления старого", () => {
  const st = CS.emptyState();
  for (let i = 1; i <= CS.LIMITS.cases; i++) CS.newCase(st, { title: `T${i}`, now: i });
  const oldest = st.cases[0].id;
  const extra = CS.newCase(st, { title: "T21", now: 100 });
  assert.equal(extra, null);
  assert.equal(st.cases.length, CS.LIMITS.cases);
  assert.ok(st.cases.some((c) => c.id === oldest), "старое дело на месте");
});

test("№21: происхождение по каждому документу, а не один общий режим", async () => {
  resetLimiters(); extractionCache.clear();
  const env = { META_API_KEY: "k", META_MODEL: "m", LLM_RPM: "1000" };
  const fetchImpl = async (url, init) => {
    const user = JSON.parse(init.body).messages[1].content;
    if (/Document type: packing/.test(user)) return { ok: false, status: 503, headers: { get: () => null }, text: async () => "" };
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify({ fields: { total: { value: "5", page: 1, quote: "Total: 5", confidence: 1 } }, items: [] }) } }] }) };
  };
  const r = await checkPack([{ type: "invoice", text: "INVOICE\nTotal: 5" }, { type: "packing", text: "PACKING LIST\nGross weight: 1 kg" }], { env, fetchImpl });
  assert.equal(r.provenance.invoice.mode, "meta");
  assert.equal(r.provenance.packing.mode, "mock");
  assert.equal(r.provenance.packing.aiError, "server");
  assert.deepEqual(r.run.docs.map((d) => d.mode), ["meta", "mock"]);
});
