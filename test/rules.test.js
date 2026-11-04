// Каталог правил: структура, понижение до needs_review без источника, повреждённый файл не роняет сервис.
import test from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateRule, loadCatalog } from "../lib/rules.js";
import { inspect } from "../lib/inspector.js";

const q = { ru: "Вопрос?", en: "Question?" };

test("запись без source_url и checked_on всегда needs_review, даже если написано verified", () => {
  const r = validateRule({ id: "R-1", checks: ["gross_weight"], q, status: "verified" });
  assert.equal(r.rule.status, "needs_review");
  assert.match(r.errors.join(), /понижен до needs_review/);
  const ok = validateRule({ id: "R-2", checks: ["gross_weight"], q, source_url: "https://example.test/rule", checked_on: "2026-11-01", status: "verified" });
  assert.equal(ok.rule.status, "verified");
});

test("неверная структура: запись отбрасывается с понятной ошибкой", () => {
  assert.equal(validateRule({ id: "R-3", checks: ["no_such_check"], q }).rule, null);
  assert.equal(validateRule({ id: "R-4", checks: ["gross_weight"], q: { ru: "" } }).rule, null);
  const bad = validateRule({ id: "R-5", checks: ["gross_weight"], q, source_url: "http://insecure", checked_on: "01.11.2026" });
  assert.equal(bad.rule.status, "needs_review");
  assert.equal(bad.rule.source_url, null);
});

test("загрузчик: рабочий каталог, повторы id, повреждённый файл", () => {
  const dir = mkdtempSync(join(tmpdir(), "rules-"));
  try {
    const p = join(dir, "rules.json");
    writeFileSync(p, JSON.stringify({ rules: [{ id: "A", checks: ["gross_weight"], q }, { id: "A", checks: ["packages"], q }] }));
    const c = loadCatalog({ path: p });
    assert.deepEqual([c.source, c.rules.length, c.demo], ["rules.json", 1, false]);
    assert.match(c.version, /^rules-[0-9a-f]{12}$/);
    assert.match(c.errors.join(), /повтор id A/);
    writeFileSync(p, "{ broken");
    assert.deepEqual(loadCatalog({ path: p }).rules, []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("демо-каталог: все записи needs_review; нет правила, нет вопроса", () => {
  const c = loadCatalog();
  assert.ok(c.rules.length > 0);
  assert.ok(c.rules.every((r) => r.status === "needs_review"));
  const out = inspect([{ id: "gross_weight" }, { id: "hs_format" }]);
  assert.ok(out.questions.every((x) => x.verified === false));
  assert.equal(out.catalog.demo, true);
});
