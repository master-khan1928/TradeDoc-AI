import { extractAll } from "./extract/index.js";
import { runAudit, downgradeUnverified } from "./audit.js";
import { inspect } from "./inspector.js";
import { sha256 } from "./extract/limits.js";
import { readFileSync } from "node:fs";

const APP_VERSION = (() => { try { return JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version; } catch { return "unknown"; } })();

export const MAX_DOC_CHARS = 20000;
export const MAX_DOCS = 3;
export const DOC_TYPES = new Set(["invoice", "packing", "cmr"]);
const ORIGINS = new Set(["text", "pdf", "photo"]);

export function validateDocs(docs) {
  if (!Array.isArray(docs) || !docs.length) return "docs must be a non-empty array";
  if (docs.length > MAX_DOCS) return `at most ${MAX_DOCS} documents`;
  const seen = new Set();
  for (const d of docs) {
    if (!d || !DOC_TYPES.has(d.type)) return "unknown document type";
    if (seen.has(d.type)) return "duplicate document type";
    seen.add(d.type);
    if (typeof d.text !== "string" || !d.text.trim()) return "empty document text";
    if (d.text.length > MAX_DOC_CHARS) return `document is longer than ${MAX_DOC_CHARS} characters`;
    if (d.origin !== undefined && !ORIGINS.has(d.origin)) return "unknown document origin";
    if (d.extraction !== undefined && (d.origin !== "photo" || typeof d.extraction !== "object" || !d.extraction)) return "extraction is accepted only for photos";
  }
  return null;
}

export async function checkPack(docs, opts) {
  const extraction = await extractAll(docs, opts);
  const dropped = extraction.docs.flatMap((d) => d.dropped.map((x) => ({ doc: d.type, ...x })));
  // неподтверждённое чтение не превращается в «проверено»: такие проверки уходят в «нужна проверка человеком»
  const audit = downgradeUnverified(runAudit(extraction.docs), dropped);
  const inspector = inspect(audit.findings);
  return {
    // какой режим реально читал документы: mock | gemini | groq | openrouter | meta; с моделью и меткой для сайта
    mode: extraction.mode,
    provider: { name: extraction.mode, label: extraction.label, model: extraction.model, demoOnly: extraction.demoOnly, fallbackFrom: extraction.fallbackFrom },
    cachedDocs: extraction.cachedDocs, // сколько документов взято из кэша (только бесплатные провайдеры, синтетика)
    masked: extraction.masked, // что замаскировано перед отправкой в модель (виды и количество, без значений)
    aiUnavailable: extraction.aiUnavailable,
    aiError: extraction.aiError, // вид сбоя модели: auth, model, rate, timeout, network, server, bad_response, bad_request
    jsonFallback: extraction.jsonFallback, // json_schema отклонён, модель читала в запасном режиме «верни JSON»
    origins: Object.fromEntries(extraction.docs.map((d) => [d.type, d.origin])),
    // кто прочитал каждый документ: модель (какая), MOCK после сбоя (с причиной), кэш или разбор фото из /api/read
    provenance: Object.fromEntries(extraction.docs.map((d) => [d.type, d.source])),
    dropped,
    ...audit,
    // итог тремя статусами: найдено / не найдено / нужна проверка человеком (+ нет данных для проверки)
    summary: {
      found: audit.findings.length,
      notFound: audit.checks.filter((c) => c.status === "pass").length,
      needsReview: audit.checks.filter((c) => c.status === "skip" && c.reason).length,
      noData: audit.checks.filter((c) => c.status === "skip" && !c.reason).length,
    },
    inspector,
    // журнал проверки: чтобы результат можно было воспроизвести (файлы не хранятся, только их хэши)
    run: {
      at: new Date().toISOString(),
      app: APP_VERSION,
      provider: extraction.mode, model: extraction.model, fallbackFrom: extraction.fallbackFrom,
      rules: { source: inspector.catalog.source, version: inspector.catalog.version },
      // хэш комплекта: SHA-256 от хэшей текстов документов в порядке инвойс, упаковочный лист, CMR
      packSha256: sha256(["invoice", "packing", "cmr"].map((t) => sha256(docs.find((d) => d.type === t)?.text ?? "")).join("")),
      docs: docs.map((d) => ({ type: d.type, origin: d.origin ?? "text", mode: extraction.docs.find((x) => x.type === d.type)?.source?.mode ?? "mock", textSha256: sha256(d.text), ...(/^[0-9a-f]{64}$/.test(d.fileSha256 ?? "") ? { fileSha256: d.fileSha256 } : {}) })),
    },
  };
}
