// «Инспектор»: задаёт вопросы так, как задал бы проверяющий на границе.
// Правило: нет подходящего правила в каталоге, нет и вопроса. Ничего не выдумываем.
// Каталог: data/rules.json, если он есть, иначе демонстрационный data/rules.demo.json (lib/rules.js).
// Вопрос по правилу без источника и даты проверки помечается needs_review и не подаётся как факт.
import { loadCatalog } from "./rules.js";

let cached = null;
/** Каталог читается один раз за процесс. */
export function catalog() {
  cached ??= loadCatalog();
  return cached;
}
export const loadRules = () => catalog().rules;

export function inspect(findings, rules = catalog().rules, meta = catalog()) {
  const questions = [];
  const noRule = [];
  for (const f of findings) {
    const matched = rules.filter((r) => r.checks.includes(f.id));
    if (!matched.length) { noRule.push(f.id); continue; }
    for (const r of matched) {
      if (!questions.some((q) => q.rule === r.id)) {
        questions.push({
          rule: r.id, check: f.id, q: r.q, demo: !!r.demo, status: r.status,
          verified: r.status === "verified", source_url: r.source_url ?? null, checked_on: r.checked_on ?? null,
        });
      }
    }
  }
  return { questions, noRule, catalog: { source: meta.source, version: meta.version, demo: meta.demo, verified: meta.verified ?? 0 } };
}
