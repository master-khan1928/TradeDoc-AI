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

// Разбор фото приходит обратно от браузера вместе с расшифровкой, чтобы не звать модель второй раз.
// Ему не доверяем: оставляем только известную форму, а цитаты всё равно проверяются по тексту заново.
const str = (v, max) => (typeof v === "string" ? v.slice(0, max) : null);
export function sanitizeExtraction(raw) {
  const fields = {};
  for (const [k, f] of Object.entries(raw?.fields ?? {})) {
    if (!/^[a-z_]{1,32}$/.test(k) || !f || typeof f !== "object") continue;
    const value = str(f.value, 500), quote = str(f.quote, 1000);
    if (value === null || quote === null || !Number.isInteger(f.page)) continue;
    fields[k] = { value, quote, page: f.page, confidence: typeof f.confidence === "number" ? f.confidence : null };
  }
  const items = [];
  for (const it of Array.isArray(raw?.items) ? raw.items.slice(0, 200) : []) {
    if (!it || !Number.isInteger(it.n) || !Number.isInteger(it.page) || typeof it.quote !== "string") continue;
    items.push({
      n: it.n, desc: str(it.desc, 500) ?? "", qty: str(it.qty, 50), unit: str(it.unit, 50),
      price: str(it.price, 50), total: str(it.total, 50), page: it.page, quote: it.quote.slice(0, 1000),
    });
  }
  return { fields, items };
}
