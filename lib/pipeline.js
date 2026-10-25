import { extractAll } from "./extract/index.js";
import { runAudit } from "./audit.js";
import { inspect } from "./inspector.js";

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
  const audit = runAudit(extraction.docs);
  const inspector = inspect(audit.findings);
  return {
    mode: extraction.mode,
    aiUnavailable: extraction.aiUnavailable,
    origins: Object.fromEntries(extraction.docs.map((d) => [d.type, d.origin])),
    dropped: extraction.docs.flatMap((d) => d.dropped.map((x) => ({ doc: d.type, ...x }))),
    ...audit,
    inspector,
  };
}
