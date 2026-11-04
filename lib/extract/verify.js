// Защита от выдумок: поле остаётся, только если его цитата дословно есть на указанной странице
// и само значение стоит в этой цитате. Настоящая цитата с выдуманным числом отбрасывается.
import { splitPages } from "./mock.js";

const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
export const MAX_ITEMS = 200;
// Причины отбрасывания: по ним сверка решает, какую «нужна проверка» показать (lib/audit.js).
export const DROP = {
  quote: "quote not found on page",
  value: "value not in quote",
  conflict: "conflicting values",
  limit: "too many items",
};
const KNOWN_REASONS = new Set(Object.values(DROP));

/**
 * Значение стоит в цитате отдельной записью: «100 kg» есть в «Gross weight: 100 kg», но не в «1100 kg»
 * и не в «100 500 kg». Регистр и пробелы не важны.
 */
export function valueInQuote(value, quote) {
  const v = norm(value).toLowerCase(), q = norm(quote).toLowerCase();
  if (!v) return false;
  for (let i = q.indexOf(v); i >= 0; i = q.indexOf(v, i + 1)) {
    const before = q.slice(0, i), after = q.slice(i + v.length);
    if (/^\d/.test(v) && /(?:\d|[.,\-−]|\d )$/.test(before)) continue;
    if (/\d$/.test(v) && /^(?:\d|[.,]\d| \d{3}(?!\d))/.test(after)) continue;
    return true;
  }
  return false;
}

export function verifyExtraction(doc, extraction) {
  const pages = splitPages(doc.text).map(norm);
  const has = (page, quote) => {
    const q = norm(quote);
    return q.length > 0 && Number.isInteger(page) && pages[page - 1] !== undefined && pages[page - 1].includes(q);
  };
  // то, что уже отброшено раньше (фото при загрузке), не забывается при повторной проверке
  const dropped = [...(extraction.dropped ?? [])];
  const conflicts = new Set(extraction.conflicts ?? []);
  const fields = {};
  for (const [k, f] of Object.entries(extraction.fields ?? {})) {
    if (conflicts.has(k)) dropped.push({ kind: "field", key: k, reason: DROP.conflict });
    else if (!f || !has(f.page, f.quote)) dropped.push({ kind: "field", key: k, reason: DROP.quote });
    else if (!valueInQuote(f.value, f.quote)) dropped.push({ kind: "field", key: k, reason: DROP.value });
    else fields[k] = f;
  }
  for (const k of conflicts) if (!(k in (extraction.fields ?? {}))) dropped.push({ kind: "field", key: k, reason: DROP.conflict });
  const items = [];
  for (const it of extraction.items ?? []) {
    if (!it || !has(it.page, it.quote)) { dropped.push({ kind: "item", key: it?.n ?? "?", reason: DROP.quote }); continue; }
    const wrong = ["qty", "unit", "price", "total"].some((c) => it[c] != null && it[c] !== "" && !valueInQuote(it[c], it.quote));
    if (wrong) dropped.push({ kind: "item", key: it.n, reason: DROP.value });
    else items.push(it);
  }
  if (extraction.itemsOverLimit) dropped.push({ kind: "item", key: "limit", reason: DROP.limit, count: extraction.itemsOverLimit });
  const { conflicts: _c, itemsOverLimit: _l, ...rest } = extraction;
  return { ...rest, fields, items, dropped };
}

// Разбор фото приходит обратно от браузера вместе с расшифровкой, чтобы не звать модель второй раз.
// Ему не доверяем: оставляем только известную форму, а цитаты всё равно проверяются по тексту заново.
// Строк товаров не больше MAX_ITEMS; лишние не выбрасываются молча, а отмечаются (itemsOverLimit).
const str = (v, max) => (typeof v === "string" ? v.slice(0, max) : null);
export function sanitizeExtraction(raw) {
  const fields = {};
  for (const [k, f] of Object.entries(raw?.fields ?? {})) {
    if (!/^[a-z_]{1,32}$/.test(k) || !f || typeof f !== "object") continue;
    const value = str(f.value, 500), quote = str(f.quote, 1000);
    if (value === null || quote === null || !Number.isInteger(f.page)) continue;
    fields[k] = { value, quote, page: f.page, confidence: typeof f.confidence === "number" ? f.confidence : null };
  }
  const all = Array.isArray(raw?.items) ? raw.items : [];
  const items = [];
  for (const it of all.slice(0, MAX_ITEMS)) {
    if (!it || !Number.isInteger(it.n) || !Number.isInteger(it.page) || typeof it.quote !== "string") continue;
    items.push({
      n: it.n, desc: str(it.desc, 500) ?? "", qty: str(it.qty, 50), unit: str(it.unit, 50),
      price: str(it.price, 50), total: str(it.total, 50), page: it.page, quote: it.quote.slice(0, 1000),
    });
  }
  const out = { fields, items };
  const over = all.length > MAX_ITEMS ? all.length : Number.isInteger(raw?.itemsOverLimit) ? raw.itemsOverLimit : 0;
  if (over) out.itemsOverLimit = over;
  const dropped = (Array.isArray(raw?.dropped) ? raw.dropped : []).slice(0, 500)
    .filter((d) => d && (d.kind === "field" || d.kind === "item") && KNOWN_REASONS.has(d.reason))
    .map((d) => ({ kind: d.kind, key: String(d.key).slice(0, 32), reason: d.reason }));
  if (dropped.length) out.dropped = dropped;
  return out;
}
