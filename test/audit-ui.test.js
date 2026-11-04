// Регрессии по аудиту 05.11.2026, группа 2: данные дела в браузере (модуль без DOM, хранилище подделано).
import test from "node:test";
import assert from "node:assert/strict";
import * as CS from "../public/case-store.js";
import { checkPack } from "../lib/pipeline.js";

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
}

test("№5: fail -> skip не «исправлено», а «больше не удалось проверить»; fail -> pass исправлено", async () => {
  const st = CS.emptyState(), c = CS.newCase(st, {});
  const bad = [{ type: "invoice", text: "Gross weight: 100 kg" }, { type: "packing", text: "Gross weight: 120 kg" }];
  const e1 = CS.recordCheck(c, { ...CS.addVersions(c, bad), result: await checkPack(bad, { env: {} }) });
  assert.ok(e1.findings.some((f) => f.id === "gross_weight"));
  // строки веса удалены: проверка стала skip
  const gone = [{ type: "invoice", text: "Seller: A" }, { type: "packing", text: "Seller: A" }];
  const e2 = CS.recordCheck(c, { ...CS.addVersions(c, gone), result: await checkPack(gone, { env: {} }) });
  const d = CS.diffChecks(e1, e2);
  assert.deepEqual(d.fixed, []);
  assert.deepEqual(d.lost, ["gross_weight"]);
  // вес исправлен: явный pass той же проверки
  const ok = [{ type: "invoice", text: "Gross weight: 100 kg" }, { type: "packing", text: "Gross weight: 100 kg" }];
  const e3 = CS.recordCheck(c, { ...CS.addVersions(c, ok), result: await checkPack(ok, { env: {} }) });
  assert.deepEqual(CS.diffChecks(e1, e3).fixed, ["gross_weight"]);
  // старые записи истории без списка пройденных проверок: «исправлено» не утверждается
  assert.deepEqual(CS.diffChecks(e1, { findings: [] }).fixed, []);
});

test("№34: вложенная порча истории отбрасывается с предупреждением, инициализация не падает", () => {
  const s = memoryStorage();
  const st = CS.emptyState(), c = CS.newCase(st, { title: "A" });
  const raw = JSON.parse(JSON.stringify(st));
  raw.cases[0].checks = [
    { at: 1, versions: { invoice: 1 }, findings: [null] },
    { at: 2, versions: { invoice: 1 }, findings: [{ id: "gross_weight", title: "not an object", evidence: [] }] },
    { at: 3, versions: { invoice: 1 }, findings: [{ id: "gross_weight", title: { ru: "Вес" }, evidence: [null] }] },
    { at: 4, versions: { invoice: 1 }, findings: [], unsure: "bad" },
    { at: 5, versions: { invoice: 1 }, findings: [] },
  ];
  s.setItem(CS.STORAGE_KEY, JSON.stringify(raw));
  const r = CS.loadState(s);
  assert.equal(r.error, "partial", "порча видна, а не «восстановлено без ошибок»");
  assert.equal(r.state.cases[0].id, c.id);
  assert.deepEqual(r.state.cases[0].checks.map((e) => e.at), [5]);
  const [only] = r.state.cases[0].checks;
  assert.doesNotThrow(() => CS.diffChecks(only, only));
});
