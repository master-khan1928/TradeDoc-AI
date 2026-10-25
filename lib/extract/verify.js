// Защита от выдумок: поле остаётся, только если его цитата дословно есть на указанной странице.
import { splitPages } from "./mock.js";

const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

export function verifyExtraction(doc, extraction) {
  const pages = splitPages(doc.text).map(norm);
  const has = (page, quote) => {
    const q = norm(quote);
    return q.length > 0 && Number.isInteger(page) && pages[page - 1] !== undefined && pages[page - 1].includes(q);
  };
  const dropped = [];
  const fields = {};
  for (const [k, f] of Object.entries(extraction.fields ?? {})) {
    if (f && has(f.page, f.quote)) fields[k] = f;
    else dropped.push({ kind: "field", key: k, reason: "quote not found on page" });
  }
  const items = [];
  for (const it of extraction.items ?? []) {
    if (it && has(it.page, it.quote)) items.push(it);
    else dropped.push({ kind: "item", key: it?.n ?? "?", reason: "quote not found on page" });
  }
  return { ...extraction, fields, items, dropped };
}
