// Этап 3: «дело груза» в браузере. Хранилище подделано: на сервере ничего не хранится.
import test from "node:test";
import assert from "node:assert/strict";
import * as CS from "../public/case-store.js";
import { checkPack } from "../lib/pipeline.js";
import { samples } from "../lib/generate.js";

function memoryStorage({ failSet, failGet } = {}) {
  const m = new Map();
  return {
    getItem: (k) => { if (failGet) throw new Error("SecurityError"); return m.has(k) ? m.get(k) : null; },
    setItem: (k, v) => { if (failSet) throw Object.assign(new Error("full"), { name: failSet }); m.set(k, String(v)); },
    removeItem: (k) => m.delete(k),
    m,
  };
}

const four = samples().find((s) => s.id === "four");

test("версии: новая только при изменении текста; история проверок и разница между ними", async () => {
  const st = CS.emptyState();
  const c = CS.newCase(st, { title: "Рейс 000 AAA 02", departure: "2026-10-30", now: 1 });
  let a = CS.addVersions(c, four.docs, 10);
  assert.deepEqual(a.versions, { invoice: 1, packing: 1, cmr: 1 });
  const r1 = await checkPack(four.docs, { env: {} });
  const e1 = CS.recordCheck(c, { ...a, result: r1, now: 11 });
  assert.ok(e1.findings.some((f) => f.id === "gross_weight"));

  // исправили только CMR: вес брутто как в инвойсе
  const invGross = four.docs[0].text.split("\n").find((l) => l.startsWith("Gross weight:"));
  const fixed = four.docs.map((d) => d.type !== "cmr" ? d : { ...d, text: d.text.replace(/^Gross weight:.*$/m, invGross), name: "cmr-v2.pdf", origin: "pdf" });
  a = CS.addVersions(c, fixed, 20);
  assert.deepEqual(a.versions, { invoice: 1, packing: 1, cmr: 2 });
  assert.deepEqual(a.changed, [{ type: "cmr", from: 1, to: 2 }]);
  assert.equal(CS.latest(c, "cmr").name, "cmr-v2.pdf");
  const e2 = CS.recordCheck(c, { ...a, result: await checkPack(fixed, { env: {} }), now: 21 });
  const d = CS.diffChecks(e1, e2);
  assert.deepEqual(d.fixed, ["gross_weight"]);
  assert.deepEqual(d.added, []);
  assert.ok(d.still.length > 0);

  const ld = CS.lineDiff(c.docs.cmr[0].text, c.docs.cmr[1].text);
  assert.equal(ld.filter((x) => x.op === "del").length, 1);
  assert.equal(ld.filter((x) => x.op === "add").length, 1);
  assert.equal(ld.find((x) => x.op === "add").line, invGross);
});

test("в истории нет «правильных» значений: только замечания, цитаты и страницы", async () => {
  const st = CS.emptyState(), c = CS.newCase(st, {});
  const a = CS.addVersions(c, four.docs);
  const e = CS.recordCheck(c, { ...a, result: await checkPack(four.docs, { env: {} }) });
  for (const f of e.findings) {
    assert.deepEqual(Object.keys(f).sort(), ["evidence", "id", "severity", "title"]);
    for (const ev of f.evidence) assert.deepEqual(Object.keys(ev).sort(), ["doc", "origin", "page", "quote"]);
  }
});

test("сохранение и чтение; «удалить всё»; сбои хранилища не роняют страницу", () => {
  const s = memoryStorage();
  const st = CS.emptyState();
  CS.newCase(st, { title: "A" });
  assert.deepEqual(CS.saveState(s, st), { ok: true, error: null });
  assert.equal(CS.loadState(s).state.cases[0].title, "A");
  assert.equal(CS.clearAll(s), true);
  assert.deepEqual(CS.loadState(s).state, CS.emptyState());

  assert.equal(CS.saveState(memoryStorage({ failSet: "QuotaExceededError" }), st).error, "quota");
  assert.equal(CS.saveState(memoryStorage({ failSet: "SecurityError" }), st).error, "unavailable");
  assert.equal(CS.loadState(memoryStorage({ failGet: true })).error, "unavailable");
  const bad = memoryStorage(); bad.setItem(CS.STORAGE_KEY, "{not json");
  assert.equal(CS.loadState(bad).error, "corrupt");
  assert.equal(CS.loadState(null).state.cases.length, 0);
});

test("лимиты: версий, проверок и дел не больше заданного", () => {
  const st = CS.emptyState();
  const c = CS.newCase(st, { now: 0 });
  for (let i = 0; i < 15; i++) CS.addVersions(c, [{ type: "invoice", text: `v${i}` }], i);
  assert.equal(c.docs.invoice.length, CS.LIMITS.versionsPerDoc);
  assert.equal(CS.latest(c, "invoice").v, 15, "номера версий не сбрасываются");
  for (let i = 0; i < 60; i++) CS.recordCheck(c, { versions: {}, result: { mode: "mock", passed: 0, total: 0, findings: [], checks: [] } });
  assert.equal(c.checks.length, CS.LIMITS.checksPerCase);
  for (let i = 1; i <= 25; i++) CS.newCase(st, { now: i });
  assert.equal(st.cases.length, CS.LIMITS.cases);
  assert.ok(st.cases.some((x) => x.id === st.current), "текущее дело не удалено");
});

test("сроки: дни до даты выезда, без выдуманных сроков", () => {
  const now = new Date(2026, 9, 25, 15, 0).getTime();
  assert.equal(CS.daysUntil("2026-10-30", now), 5);
  assert.equal(CS.daysUntil("2026-10-25", now), 0);
  assert.equal(CS.daysUntil("2026-10-20", now), -5);
  assert.equal(CS.daysUntil("", now), null);
  assert.equal(CS.daysUntil("30.10.2026", now), null);
});

test("дело: переименование, дата, удаление", () => {
  const st = CS.emptyState();
  const a = CS.newCase(st, { title: "A" }), b = CS.newCase(st, { title: "B" });
  CS.updateCase(b, { title: "B2", departure: "bad" });
  assert.equal(b.title, "B2");
  assert.equal(b.departure, "");
  CS.deleteCase(st, b.id);
  assert.equal(CS.currentCase(st).id, a.id);
});

test("localStorage: повреждённое дело отбрасывается, остальные читаются; лимит размера", () => {
  const s = memoryStorage();
  const st = CS.emptyState();
  const good = CS.newCase(st, { title: "ok" });
  CS.addVersions(good, [{ type: "invoice", text: "INVOICE" }]);
  const raw = JSON.parse(JSON.stringify(st));
  raw.cases.push({ id: 5, docs: "broken" }, null, { id: "x", docs: { invoice: [{ v: "one", text: 1 }] }, checks: [{ bad: true }] });
  s.setItem(CS.STORAGE_KEY, JSON.stringify(raw));
  const r = CS.loadState(s);
  assert.equal(r.error, "partial");
  assert.deepEqual(r.state.cases.map((c) => c.id), [good.id, "x"]);
  assert.deepEqual(r.state.cases[1].docs.invoice, [], "битая версия отброшена, дело осталось");
  assert.equal(r.state.cases[0].docs.invoice[0].text, "INVOICE");
  s.setItem(CS.STORAGE_KEY, JSON.stringify({ v: 2, cases: [] }));
  assert.equal(CS.loadState(s).error, "corrupt", "неизвестная версия схемы не читается");
  const big = CS.emptyState();
  const c = CS.newCase(big, {});
  CS.addVersions(c, [{ type: "invoice", text: "x".repeat(CS.MAX_BYTES + 10) }]);
  assert.equal(CS.saveState(memoryStorage(), big).error, "too_large");
});
