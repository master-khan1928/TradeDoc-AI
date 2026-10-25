// Бенчмарк на СИНТЕТИЧЕСКИХ комплектах с заранее известными ошибками. Всегда MOCK: ИИ здесь не участвует.
//
// Два режима:
//   template  документы в том же формате «Метка: значение», который знает MOCK-разбор. Измеряет только
//             логику сверки (audit.js): чтение здесь заведомо идеальное.
//   dirty     документы из generate-dirty.js: 3 шаблона, RU/EN/двуязычные метки, разные форматы чисел
//             и дат, шум в метках. Измеряет всю цепочку MOCK: разбор по шаблону + разбор чисел + сверку.
//             Это ближе к жизни, но генератор всё равно наш, а не настоящие документы партнёров.
import { writeFileSync } from "node:fs";
import { makeSet, ERROR_TYPES, INJECTORS, rng, expectedChecks } from "../lib/generate.js";
import { makeDirtySet } from "../lib/generate-dirty.js";
import { checkPack } from "../lib/pipeline.js";
import { CHECKS, AMBIGUOUS } from "../lib/audit.js";

const PER_TYPE = 10, CLEAN = 60, MULTI = 30;
const env = {}; // всегда MOCK

async function run(make) {
  const types = [];
  let unexpected = 0, errorSets = 0;
  const skipped = Object.fromEntries(Object.keys(CHECKS).map((k) => [k, 0]));
  const ambiguous = {};
  const falseByCheck = {};
  const score = (r, errors) => {
    const want = expectedChecks(errors);
    const extra = r.findings.filter((f) => !want.has(f.id));
    for (const f of extra) falseByCheck[f.id] = (falseByCheck[f.id] ?? 0) + 1;
    return extra.length;
  };

  for (const type of ERROR_TYPES) {
    let hit = 0;
    for (let i = 0; i < PER_TYPE; i++) {
      const r = await checkPack(make(1000 + i * 7 + ERROR_TYPES.indexOf(type) * 131, [type]).docs, { env });
      if (r.findings.some((f) => f.id === INJECTORS[type].check)) hit++;
      unexpected += score(r, [type]); errorSets++;
    }
    types.push({ type, check: INJECTORS[type].check, found: hit, of: PER_TYPE });
  }

  let cleanFlagged = 0;
  for (let i = 0; i < CLEAN; i++) {
    const r = await checkPack(make(5000 + i, []).docs, { env });
    if (r.findings.length) cleanFlagged++;
    score(r, []);
    for (const c of r.checks) if (c.status === "skip") { skipped[c.id]++; if (c.reason === AMBIGUOUS) ambiguous[c.id] = (ambiguous[c.id] ?? 0) + 1; }
  }

  let multiFound = 0, multiTotal = 0;
  const pr = rng(777);
  for (let i = 0; i < MULTI; i++) {
    const picked = [];
    while (picked.length < 3) { const t = ERROR_TYPES[Math.floor(pr() * ERROR_TYPES.length)]; if (!picked.includes(t)) picked.push(t); }
    const r = await checkPack(make(9000 + i, picked).docs, { env });
    for (const t of picked) { multiTotal++; if (r.findings.some((f) => f.id === INJECTORS[t].check)) multiFound++; }
    unexpected += score(r, picked); errorSets++;
  }

  return {
    single_error: { found: types.reduce((a, r) => a + r.found, 0), of: types.reduce((a, r) => a + r.of, 0), types },
    clean_sets: { false_positive_sets: cleanFlagged, of: CLEAN },
    multi_error: { found: multiFound, of: multiTotal },
    unexpected_findings_in_error_sets: { findings: unexpected, sets: errorSets },
    false_findings_by_check: falseByCheck,
    skipped_on_clean_sets: skipped, // проверка не смогла выполниться: поле не прочитано или не разобрано
    skipped_ambiguous_number_on_clean_sets: ambiguous, // из них: число записано неоднозначно («32.500»)
  };
}

const out = {
  note: "Synthetic documents, MOCK reading (template parser, not AI). 'template' measures the comparison logic only; 'dirty' measures MOCK parsing + number parsing + comparison on our own messier generator. Neither measures AI reading of real documents.",
  template: await run(makeSet),
  dirty: await run(makeDirtySet),
};
writeFileSync(new URL("../bench-results.json", import.meta.url), JSON.stringify(out, null, 2));

const pad = (s, n) => String(s).padEnd(n);
console.log("\nTradeDoc AI bench (synthetic documents, MOCK reading: template parser, not AI)\n");
console.log(pad("error type", 24), pad("check", 14), pad("template", 10), "dirty");
out.template.single_error.types.forEach((t, i) => console.log(pad(t.type, 24), pad(t.check, 14), pad(`${t.found}/${t.of}`, 10), `${out.dirty.single_error.types[i].found}/${t.of}`));
for (const [name, m] of Object.entries({ template: out.template, dirty: out.dirty })) {
  console.log(`\n[${name}]`);
  console.log(`single-error found          : ${m.single_error.found}/${m.single_error.of}`);
  console.log(`clean sets with any finding : ${m.clean_sets.false_positive_sets}/${m.clean_sets.of}`);
  console.log(`3 errors per set, found     : ${m.multi_error.found}/${m.multi_error.of}`);
  console.log(`unexpected findings         : ${m.unexpected_findings_in_error_sets.findings} in ${m.unexpected_findings_in_error_sets.sets} error sets`);
  const fb = Object.entries(m.false_findings_by_check).sort((a, b) => b[1] - a[1]);
  if (fb.length) console.log(`false findings by check     : ${fb.map(([k, v]) => `${k} ${v}`).join(", ")}`);
  const sk = Object.entries(m.skipped_on_clean_sets).filter(([, v]) => v).map(([k, v]) => `${k} ${v}/${CLEAN}`);
  console.log(`checks skipped (clean sets) : ${sk.length ? sk.join(", ") : "none"}`);
  const am = Object.entries(m.skipped_ambiguous_number_on_clean_sets).map(([k, v]) => `${k} ${v}/${CLEAN}`);
  console.log(`  of them, ambiguous number : ${am.length ? am.join(", ") : "none"}`);
}
