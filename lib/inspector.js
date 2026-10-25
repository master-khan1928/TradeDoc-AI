// «Инспектор»: задаёт вопросы так, как задал бы проверяющий на границе.
// Правило: нет подходящего правила в каталоге, нет и вопроса. Ничего не выдумываем.
// Каталог правил здесь демонстрационный (demo: true, needs_review): без источников и дат проверки.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
export function loadRules(path = join(here, "..", "data", "rules.demo.json")) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function inspect(findings, rules = loadRules()) {
  const questions = [];
  const noRule = [];
  for (const f of findings) {
    const matched = rules.filter((r) => r.checks.includes(f.id));
    if (!matched.length) { noRule.push(f.id); continue; }
    for (const r of matched) {
      if (!questions.some((q) => q.rule === r.id)) {
        questions.push({
          rule: r.id, check: f.id, q: r.q, demo: !!r.demo, status: r.status,
          source_url: r.source_url ?? null, checked_on: r.checked_on ?? null,
        });
      }
    }
  }
  return { questions, noRule };
}
