// Сравнение «наша цепочка против одного запроса к модели» (lib/compare.js). Только с моделью (не MOCK).
//   LLM_PROVIDER=gemini GEMINI_API_KEY=… GEMINI_MODEL=… node scripts/compare.mjs
//   node scripts/compare.mjs --errors 5 --clean 3
// Документы синтетические. Результат: bench-results/compare-<провайдер>-<модель>-<дата>.json,
// только числа и seed, тексты не сохраняются. Каждый запуск в своём файле, старые не перезаписываются.
import { writeFileSync, mkdirSync } from "node:fs";
import { providerConfig, activeProviderName } from "../lib/extract/providers.js";
import { runCompare } from "../lib/compare.js";
import { makeDirtySet } from "../lib/generate-dirty.js";
import { ERROR_TYPES, rng } from "../lib/generate.js";

const cfg = providerConfig(process.env);
if (!cfg) {
  console.log("Нужен META_API_KEY (и META_MODEL) или бесплатный провайдер: LLM_PROVIDER=gemini|groq|openrouter и его ключ. Сравнение измеряет чтение документов моделью, в режиме MOCK оно не имеет смысла и не запускается.");
  console.log("META_API_KEY is required (and META_MODEL), or a free provider (LLM_PROVIDER and its key). This comparison measures model reading and does not run in MOCK mode.");
  if (activeProviderName(process.env) !== "mock") console.log("Выбранный провайдер не настроен: см. строку запуска сервера (missing …).");
  process.exit(2);
}

const arg = (name, def) => { const i = process.argv.indexOf(`--${name}`); const v = i > 0 ? Number(process.argv[i + 1]) : def; return Number.isInteger(v) && v >= 0 ? v : def; };
const ERRORS = arg("errors", 20), CLEAN = arg("clean", 10);

const r = rng(4242);
const sets = [];
for (let i = 0; i < ERRORS; i++) {
  const k = 1 + Math.floor(r() * 3), picked = [];
  while (picked.length < k) { const t = ERROR_TYPES[Math.floor(r() * ERROR_TYPES.length)]; if (!picked.includes(t)) picked.push(t); }
  sets.push(makeDirtySet(20000 + i, picked));
}
for (let i = 0; i < CLEAN; i++) sets.push(makeDirtySet(30000 + i, []));

console.log(`Комплектов: ${sets.length} (${ERRORS} с ошибками, ${CLEAN} чистых). Провайдер: ${cfg.label}, модель: ${cfg.model}.`);
console.log(`Запросов к модели: наша цепочка ${sets.length * 3}, один запрос ${sets.length}. Свой лимит: ${cfg.rpm} в минуту.`);
const res = await runCompare(sets, cfg, { onProgress: (i, n) => process.stdout.write(`\r${i}/${n}`) });
console.log("\n");

const row = (label, f) => console.log(label.padEnd(42), String(f(res.ours)).padEnd(16), f(res.baseline));
console.log("".padEnd(42), "наша цепочка".padEnd(16), "один запрос");
row("внесённых ошибок найдено", (t) => `${t.found}/${t.of}`);
row("ложных срабатываний (замечаний)", (t) => t.falseFindings);
row("чистых комплектов с замечаниями", (t) => `${t.cleanFlagged}/${t.cleanSets}`);
row("замечаний с проверяемой цитатой", (t) => `${t.quoted}/${t.findings}`);
row("комплектов без ответа модели (не в счёт)", (t) => t.failedRequests);

const date = new Date().toISOString().slice(0, 10);
const file = `compare-${cfg.provider}-${cfg.model.replace(/[^\w.-]+/g, "_")}-${date}.json`;
mkdirSync(new URL("../bench-results/", import.meta.url), { recursive: true });
writeFileSync(new URL(`../bench-results/${file}`, import.meta.url), JSON.stringify({
  note: "Synthetic dirty sets. ours = model reads each document by schema, code verifies quotes and compares; baseline = one prompt 'find discrepancies' with the category list, no comparison code. Same model, temperature 0.",
  provider: cfg.provider, label: cfg.label, model: cfg.model, demoOnly: cfg.demoOnly, date,
  sets: sets.map((s) => ({ seed: s.seed, errors: s.errors })),
  ...res,
}, null, 2));
console.log(`\nРезультат: bench-results/${file}`);
