// Сравнение «наша цепочка против одного запроса к модели» на одних и тех же синтетических комплектах.
//   ours      модель читает каждый документ по схеме (3 запроса на комплект), цитаты проверяет код,
//             сверку делает код (audit.js).
//   baseline  один запрос: все три документа и просьба «найди расхождения», без кода сверки.
// Обе стороны используют одну модель, temperature 0 и одни и те же тексты. Работает только в режиме META.
import { checkPack } from "./pipeline.js";
import { PROVIDERS } from "./extract/providers.js";
import { callModel } from "./extract/meta.js";
import { CHECKS } from "./audit.js";
import { INJECTORS, expectedChecks } from "./generate.js";

const CHECK_IDS = Object.keys(CHECKS);
const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const quoteIn = (text, quote) => norm(quote).length > 0 && norm(text).includes(norm(quote));

export const BASELINE_SCHEMA = {
  name: "pack_issues",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["issues"],
    properties: {
      issues: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["check", "doc", "quote", "description"],
          properties: {
            check: { type: "string", enum: [...CHECK_IDS, "other"] },
            doc: { type: "string", enum: ["invoice", "packing", "cmr"] },
            quote: { type: "string", description: "exact line copied from that document" },
            description: { type: "string" },
          },
        },
      },
    },
  },
};

// Список категорий базовому варианту даём, иначе его ответы не сопоставить с известными ошибками.
// Это помогает базовому варианту, а не мешает.
const BASELINE_SYSTEM =
  "You check a pack of trade documents (invoice, packing list, CMR) before the truck leaves for the border. " +
  "Find every discrepancy or error within and between the documents. For each issue give: check (one category " +
  "from the list, or 'other'), doc (the document the quote is from), quote (one exact line copied from that " +
  "document), description. If there are no issues, return an empty list. Return only JSON that matches the schema.\n" +
  "Categories:\n" + CHECK_IDS.map((id) => `- ${id}: ${CHECKS[id].en}`).join("\n");

// Тот же клиент, что у нашей цепочки (лимит частоты, повтор, json_object/запасной режим): сравнение честное.
export async function baselineIssues(docs, cfg, fetchImpl = fetch) {
  const { parsed } = await callModel({ ...cfg, timeoutMs: Math.max(cfg.timeoutMs ?? 25000, 60000) }, [
    { role: "system", content: BASELINE_SYSTEM },
    { role: "user", content: docs.map((d) => `=== ${d.type} ===\n${d.text}`).join("\n\n") },
  ], BASELINE_SCHEMA, fetchImpl, { quiet: true });
  if (!Array.isArray(parsed.issues)) throw new Error("model returned no issues");
  return parsed.issues;
}

/** Одна сторона на одном комплекте: { ids: Set проверок, items: [{id, quoted}] } -> счёт. */
export function scoreSet(errors, ids, items) {
  const want = expectedChecks(errors);
  return {
    found: errors.filter((e) => ids.has(INJECTORS[e].check)).length,
    of: errors.length,
    falseIds: [...ids].filter((id) => !want.has(id)),
    findings: items.length,
    quoted: items.filter((x) => x.quoted).length,
  };
}

function emptyTotals() {
  return { found: 0, of: 0, falseFindings: 0, cleanFlagged: 0, cleanSets: 0, findings: 0, quoted: 0, failedRequests: 0, scoredSets: 0 };
}
function add(t, s, clean) {
  t.found += s.found; t.of += s.of; t.falseFindings += s.falseIds.length;
  t.findings += s.findings; t.quoted += s.quoted; t.scoredSets++;
  if (clean) { t.cleanSets++; if (s.falseIds.length) t.cleanFlagged++; }
}

/** sets: [{ errors, docs }]. Комплект, на котором запрос к модели не удался, в счёт не идёт, но сбой считается. */
export async function runCompare(sets, cfg, { fetchImpl = fetch, onProgress } = {}) {
  // та же модель и тот же провайдер для нашей цепочки, что и для базового варианта
  const p = PROVIDERS[cfg.provider ?? "meta"];
  const env = { LLM_PROVIDER: cfg.provider ?? "meta", [p.keyVar]: cfg.key, [p.modelVar]: cfg.model, [p.baseVar]: cfg.base, LLM_RPM: String(cfg.rpm ?? 60), LLM_CACHE: "off" };
  const ours = emptyTotals(), base = emptyTotals();
  for (const [i, set] of sets.entries()) {
    const text = Object.fromEntries(set.docs.map((d) => [d.type, d.text]));
    const clean = set.errors.length === 0;

    const r = await checkPack(set.docs, { env, fetchImpl });
    if (r.aiUnavailable) ours.failedRequests++; // наша цепочка упала бы на MOCK: такой результат не про модель
    else {
      const items = r.findings.map((f) => ({ id: f.id, quoted: f.evidence.length > 0 && f.evidence.every((e) => quoteIn(text[e.doc], e.quote)) }));
      add(ours, scoreSet(set.errors, new Set(r.findings.map((f) => f.id)), items), clean);
    }

    try {
      const issues = await baselineIssues(set.docs, cfg, fetchImpl);
      const items = issues.map((x) => ({ id: x.check, quoted: quoteIn(text[x.doc], x.quote) }));
      add(base, scoreSet(set.errors, new Set(issues.map((x) => x.check)), items), clean);
    } catch {
      base.failedRequests++;
    }
    onProgress?.(i + 1, sets.length);
  }
  return { ours, baseline: base };
}
