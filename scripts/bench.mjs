// Бенчмарк на СИНТЕТИЧЕСКИХ комплектах с заранее известными ошибками.
// Честно о том, что это измеряет: логику сверки (audit.js). Чтение документов здесь делает
// MOCK-разбор по шаблону, поэтому цифры НЕ говорят о качестве чтения PDF и фото моделью.
import { writeFileSync } from "node:fs";
import { makeSet, ERROR_TYPES, INJECTORS, rng } from "../lib/generate.js";
import { checkPack } from "../lib/pipeline.js";

const PER_TYPE = 10, CLEAN = 60, MULTI = 30;
const env = {}; // всегда MOCK
const rows = [];

for (const type of ERROR_TYPES) {
  let hit = 0;
  for (let i = 0; i < PER_TYPE; i++) {
    const r = await checkPack(makeSet(1000 + i * 7 + ERROR_TYPES.indexOf(type) * 131, [type]).docs, { env });
    if (r.findings.some((f) => f.id === INJECTORS[type].check)) hit++;
  }
  rows.push({ type, check: INJECTORS[type].check, found: hit, of: PER_TYPE });
}

let falsePos = 0;
for (let i = 0; i < CLEAN; i++) {
  const r = await checkPack(makeSet(5000 + i, []).docs, { env });
  if (r.findings.length) falsePos++;
}

let multiFound = 0, multiTotal = 0;
const pr = rng(777);
for (let i = 0; i < MULTI; i++) {
  const picked = [];
  while (picked.length < 3) { const t = ERROR_TYPES[Math.floor(pr() * ERROR_TYPES.length)]; if (!picked.includes(t)) picked.push(t); }
  const r = await checkPack(makeSet(9000 + i, picked).docs, { env });
  for (const t of picked) { multiTotal++; if (r.findings.some((f) => f.id === INJECTORS[t].check)) multiFound++; }
}

const total = rows.reduce((a, r) => a + r.found, 0), of = rows.reduce((a, r) => a + r.of, 0);
const out = {
  note: "Synthetic documents, MOCK reading. Measures the comparison logic only, not AI reading quality.",
  single_error: { found: total, of, types: rows },
  clean_sets: { false_positive_sets: falsePos, of: CLEAN },
  multi_error: { found: multiFound, of: multiTotal },
};
writeFileSync(new URL("../bench-results.json", import.meta.url), JSON.stringify(out, null, 2));

console.log("\nTradeDoc AI bench (synthetic, MOCK reading)\n");
console.log("error type".padEnd(24), "check".padEnd(14), "found");
for (const r of rows) console.log(r.type.padEnd(24), r.check.padEnd(14), `${r.found}/${r.of}`);
console.log(`\nsingle-error total : ${total}/${of}`);
console.log(`clean sets flagged : ${falsePos}/${CLEAN}`);
console.log(`3 errors per set   : ${multiFound}/${multiTotal}`);
