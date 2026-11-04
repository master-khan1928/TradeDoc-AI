// Формулировки: заголовок замечания называет проблему, детали есть на русском и английском.
import test from "node:test";
import assert from "node:assert/strict";
import { checkPack } from "../lib/pipeline.js";
import { PROBLEMS, CHECKS } from "../lib/audit.js";
import { buildLetter } from "../lib/letters.js";
import { makeSet, ERROR_TYPES, INJECTORS } from "../lib/generate.js";

test("заголовок замечания: проблема, а не условие проверки", async () => {
  const r = await checkPack(makeSet(23, ["gross_weight_mismatch", "qty_mismatch"]).docs, { env: {} });
  const g = r.findings.find((f) => f.id === "gross_weight");
  assert.equal(g.title.ru, "Вес брутто не совпадает");
  assert.equal(g.title.en, "Gross weight does not match");
  assert.deepEqual(g.check, CHECKS.gross_weight, "условие проверки осталось для списка всех проверок");
  const passed = r.checks.find((c) => c.status === "pass");
  assert.deepEqual(passed.title, CHECKS[passed.id]);
  assert.match(buildLetter(r.findings, "ru"), /1\. Вес брутто не совпадает/);
});

test("у каждого вида ошибки детали на русском без английских слов и на английском", async () => {
  for (const [i, type] of ERROR_TYPES.entries()) {
    const r = await checkPack(makeSet(300 + i, [type]).docs, { env: {} });
    const f = r.findings.find((x) => x.id === INJECTORS[type].check);
    assert.ok(f, type);
    assert.equal(f.title, PROBLEMS[f.id]);
    assert.ok(f.details.ru && f.details.en, `${type}: детали на двух языках`);
    assert.doesNotMatch(f.details.ru, /\b(line|vs|written|missing|invoice|packing|date|net|gross|sum|variant|different)\b/, `${type}: ${f.details.ru}`);
    assert.equal(f.detail, f.details.en, "detail (API) остаётся английским");
  }
});
