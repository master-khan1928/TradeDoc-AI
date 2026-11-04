// Сверка документов. Чистый код: ИИ здесь не участвует и ничего не «угадывает».
// Каждая проверка возвращает pass | fail | skip. Система никогда не предлагает значений:
// она показывает, что где написано, и просит человека подтвердить верное.
import { compareNames } from "./normalize.js";
import { readNumber, parseDate, near, massFactor, unitOf, itemUnit } from "./parse.js";
import { DROP } from "./extract/verify.js";

// Причины «нужна проверка человеком». Значение не подставляется и «правильный» вариант не называется:
// человек подтверждает сам. Принцип: то, что не удалось проверить, не бывает ни pass, ни «исправлено».
export const AMBIGUOUS = "number_format_ambiguous";
export const UNVERIFIED = "quote_unverified";
export const UNREADABLE = "value_unreadable";
export const UNIT = "unit_unknown";
export const CONFLICT = "field_conflict";
export const INCOMPLETE = "extraction_incomplete";
export const DATE_INVALID = "date_invalid";
export const ITEMS_MISMATCH = "items_mismatch";
export const SKIP_REASONS = {
  [AMBIGUOUS]: { ru: "формат числа неоднозначен, подтвердите вручную", en: "number format is ambiguous, please confirm by hand" },
  [UNVERIFIED]: { ru: "прочитанное значение не подтвердилось цитатой из документа, подтвердите вручную", en: "a read value was not confirmed by a quote from the document, please confirm by hand" },
  [UNREADABLE]: { ru: "часть значений не удалось прочитать (нет числа, несколько чисел или неподдерживаемая запись), подтвердите вручную", en: "some values could not be read (no number, several numbers or an unsupported format), please confirm by hand" },
  [UNIT]: { ru: "единица измерения не указана, неизвестна или несовместима, подтвердите вручную", en: "the unit is missing, unknown or incompatible, please confirm by hand" },
  [CONFLICT]: { ru: "в документе противоречивые значения (повтор поля или номера позиции), подтвердите вручную", en: "the document has conflicting values (a repeated field or line number), please confirm by hand" },
  [INCOMPLETE]: { ru: "документ прочитан не полностью (позиций больше лимита), подтвердите вручную", en: "the document was read only in part (more lines than the limit), please confirm by hand" },
  [DATE_INVALID]: { ru: "дату не удалось разобрать: формат не поддерживается или такой даты нет, подтвердите вручную", en: "a date could not be read: unsupported format or no such date, please confirm by hand" },
  [ITEMS_MISMATCH]: { ru: "позиции с одним номером описывают разные товары, сопоставьте вручную", en: "lines with the same number describe different goods, please match them by hand" },
};
// Какие поля нужны каждой проверке. Если у документа такое поле прочитано, но отброшено (цитаты нет на странице),
// проверка не может считаться пройденной: «нужна проверка человеком», а не «всё хорошо».
export const CHECK_FIELDS = {
  line_totals: ["items"], invoice_sum: ["total", "items"], gross_weight: ["gross_weight"], net_weight: ["net_weight"],
  packages: ["packages"], item_qty: ["items"], party_seller: ["seller"], party_buyer: ["buyer"],
  date_order: ["date", "shipment_date"], hs_format: ["hs_code"], hs_match: ["hs_code"], reference: ["reference", "number"],
  net_le_gross: ["gross_weight", "net_weight"],
};

// причина отбрасывания поля -> причина «нужна проверка»; при нескольких берётся самая серьёзная
const DROP_TO_REASON = { [DROP.conflict]: CONFLICT, [DROP.limit]: INCOMPLETE, [DROP.value]: UNVERIFIED, [DROP.quote]: UNVERIFIED };
const DROP_ORDER = [CONFLICT, INCOMPLETE, UNVERIFIED];

/**
 * Проверки, для которых часть данных отброшена (нет цитаты, значение не из цитаты, конфликт, неполное чтение),
 * не могут быть ни «пройдено», ни «нет данных»: они переводятся в «нужна проверка» с причиной.
 * Найденное расхождение (fail) остаётся замечанием.
 */
export function downgradeUnverified(audit, dropped) {
  const byKey = new Map();
  for (const d of dropped) {
    const k = d.kind === "item" ? "items" : d.key;
    const r = DROP_TO_REASON[d.reason] ?? UNVERIFIED;
    const prev = byKey.get(k);
    if (!prev || DROP_ORDER.indexOf(r) < DROP_ORDER.indexOf(prev)) byKey.set(k, r);
  }
  const checks = audit.checks.map((c) => {
    if (c.status === "fail" || (c.status === "skip" && c.reason)) return c;
    const reasons = (CHECK_FIELDS[c.id] ?? []).map((k) => byKey.get(k)).filter(Boolean);
    if (!reasons.length) return c;
    const reason = DROP_ORDER.find((r) => reasons.includes(r));
    return { ...c, status: "skip", reason, reasonText: SKIP_REASONS[reason], title: CHECKS[c.id] };
  });
  const counted = checks.filter((c) => c.status !== "skip");
  return { ...audit, checks, passed: counted.filter((c) => c.status === "pass").length, total: counted.length, skipped: checks.length - counted.length };
}
const num = (d, raw) => readNumber(raw, d?.numberContext?.decimal ?? null);

export const CHECKS = {
  line_totals: { ru: "Суммы по строкам счёта", en: "Invoice line totals" },
  invoice_sum: { ru: "Итого по счёту", en: "Invoice total" },
  gross_weight: { ru: "Вес брутто совпадает", en: "Gross weight matches" },
  net_weight: { ru: "Вес нетто совпадает", en: "Net weight matches" },
  packages: { ru: "Количество мест совпадает", en: "Number of packages matches" },
  item_qty: { ru: "Количество по строкам: счёт и упаковочный лист", en: "Line quantities: invoice and packing list" },
  party_seller: { ru: "Название продавца / отправителя", en: "Seller / sender name" },
  party_buyer: { ru: "Название покупателя / получателя", en: "Buyer / consignee name" },
  date_order: { ru: "Порядок дат", en: "Order of dates" },
  hs_format: { ru: "Формат кода ТН ВЭД (HS)", en: "HS code format" },
  hs_match: { ru: "Код ТН ВЭД совпадает", en: "HS code matches" },
  reference: { ru: "Ссылка на номер инвойса", en: "Invoice number reference" },
  net_le_gross: { ru: "Нетто не больше брутто", en: "Net weight is not above gross" },
};

// Заголовок замечания: проблема, а не условие проверки (условие остаётся в CHECKS для списка всех проверок).
export const PROBLEMS = {
  line_totals: { ru: "Сумма по строке счёта не сходится", en: "Invoice line total does not add up" },
  invoice_sum: { ru: "Итого по счёту не равно сумме строк", en: "Invoice total does not equal the sum of lines" },
  gross_weight: { ru: "Вес брутто не совпадает", en: "Gross weight does not match" },
  net_weight: { ru: "Вес нетто не совпадает", en: "Net weight does not match" },
  packages: { ru: "Количество мест не совпадает", en: "Number of packages does not match" },
  item_qty: { ru: "Количество по строкам в счёте и упаковочном листе различается", en: "Line quantities differ between invoice and packing list" },
  party_seller: { ru: "Название продавца / отправителя различается", en: "Seller / sender name differs" },
  party_buyer: { ru: "Название покупателя / получателя различается", en: "Buyer / consignee name differs" },
  date_order: { ru: "Дата документа позже даты отгрузки", en: "A document is dated after the shipment date" },
  hs_format: { ru: "Код ТН ВЭД (HS) записан в неверном формате", en: "HS code format is invalid" },
  hs_match: { ru: "Код ТН ВЭД различается", en: "HS code differs" },
  reference: { ru: "Ссылка на номер инвойса не совпадает", en: "Invoice number reference does not match" },
  net_le_gross: { ru: "Вес нетто больше веса брутто", en: "Net weight is above gross weight" },
};

// Слова для строки деталей на двух языках. Детали только пересказывают, что написано; значений не предлагают.
const W = {
  ru: {
    doc: { invoice: "инвойс", packing: "упаковочный лист", cmr: "CMR" }, kg: " кг",
    line: (n, rest) => `строка ${n}: ${rest}`, written: "написано",
    sum: (s, t) => `сумма строк = ${s}, в итоге написано ${t}`,
    missingPl: "нет в упаковочном листе", missingInv: "нет в инвойсе",
    qty: (a, b) => `${a} в инвойсе, ${b} в упаковочном листе`,
    names: (a, b, v, r) => `${a} и ${b}: ${v === "different" ? "разные названия" : "похожее написание"} (сходство ${r})`,
    late: (doc) => `дата документа «${doc}» позже даты отгрузки`,
    ref: (doc, ref, num) => `${doc}: ${ref}, а в инвойсе ${num}`,
    netGross: (doc, n, g) => `${doc}: нетто ${n} больше брутто ${g}`,
  },
  en: {
    doc: { invoice: "invoice", packing: "packing list", cmr: "CMR" }, kg: " kg",
    line: (n, rest) => `line ${n}: ${rest}`, written: "written",
    sum: (s, t) => `sum of lines = ${s}, written total ${t}`,
    missingPl: "missing in packing list", missingInv: "missing in invoice",
    qty: (a, b) => `${a} in invoice, ${b} in packing list`,
    names: (a, b, v, r) => `${a} vs ${b}: ${v === "different" ? "different names" : "similar spelling"} (similarity ${r})`,
    late: (doc) => `${doc} date is after the shipment date`,
    ref: (doc, ref, num) => `${doc}: ${ref}, invoice says ${num}`,
    netGross: (doc, n, g) => `${doc}: net ${n} > gross ${g}`,
  },
};
/** Детали на двух языках: fn получает словарь языка. */
const both = (fn) => ({ ru: fn(W.ru), en: fn(W.en) });

const F = (d, k) => d?.fields?.[k];
const ev = (d, k) => {
  const f = F(d, k);
  return f ? { doc: d.type, field: k, value: f.value, page: f.page, quote: f.quote, origin: d.origin } : null;
};
const evItem = (d, it) => ({ doc: d.type, field: `item ${it.n}`, value: it.quote, page: it.page, quote: it.quote, origin: d.origin });
const compact = (a) => a.filter(Boolean);

// details: { ru, en }. detail (английская строка) оставлен для совместимости API.
function result(id, status, severity, details, evidence, reason) {
  const r = {
    id, title: status === "fail" ? PROBLEMS[id] : CHECKS[id], check: CHECKS[id], status,
    severity: status === "fail" ? severity : null, detail: details?.en ?? "", details: details ?? null, evidence: evidence ?? [],
  };
  if (reason) { r.reason = reason; r.reasonText = SKIP_REASONS[reason]; }
  return r;
}
const skip = (id, reason, evidence) => result(id, "skip", null, null, evidence, reason);
const pass = (id, evidence) => result(id, "pass", null, null, evidence);
const fail = (id, severity, detail, evidence) => result(id, "fail", severity, detail, evidence);
// Общее правило для чисел: явное расхождение среди однозначных чисел остаётся замечанием;
// иначе, если хоть одно число неоднозначно, проверка пропускается с причиной и цитатами этих чисел.
const unclear = (id, evidence) => skip(id, AMBIGUOUS, compact(evidence));

/** Число поля вместе с единицей. weight: значение приводится к килограммам; без известной единицы unit = false. */
function quantity(d, key, weight) {
  const raw = F(d, key).value;
  const n = num(d, raw);
  if (!weight || n.value === null) return { d, n, v: n.value, unit: true };
  const f = massFactor(unitOf(raw));
  return { d, n, v: f === null ? null : n.value * f, unit: f !== null };
}

function numericAcross(id, key, docs, weight = false) {
  const rows = docs.filter((d) => F(d, key)).map((d) => quantity(d, key, weight));
  const clear = rows.filter((r) => r.v !== null);
  if (clear.length >= 2 && !clear.every((r) => near(r.v, clear[0].v))) {
    return fail(id, "high", both((w) => clear.map((r) => `${w.doc[r.d.type]}: ${r.v}${weight ? w.kg : ""}`).join(" · ")), clear.map((r) => ev(r.d, key)));
  }
  const vague = rows.filter((r) => r.n.ambiguous);
  if (vague.length) return unclear(id, vague.map((r) => ev(r.d, key)));
  // число не прочитано или единица не известна: проверка не выполнена полностью, значит не pass
  const unread = rows.filter((r) => r.n.value === null);
  if (unread.length) return skip(id, UNREADABLE, compact(unread.map((r) => ev(r.d, key))));
  const noUnit = rows.filter((r) => !r.unit);
  if (noUnit.length) return skip(id, UNIT, compact(noUnit.map((r) => ev(r.d, key))));
  if (clear.length < 2) return skip(id);
  return pass(id, clear.map((r) => ev(r.d, key)));
}

const descKey = (s) => String(s ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const dupNumbers = (items) => { const seen = new Set(), dup = new Set(); for (const i of items) (seen.has(i.n) ? dup : seen).add(i.n); return dup; };

/**
 * Количество по строкам: счёт и упаковочный лист. Сопоставление один к одному: по описанию, если описания
 * есть везде, различны и совпадают как множества (строки могли переставить), иначе по номеру строки.
 * Повтор номера строки — конфликт; один номер с разными товарами — ручное сопоставление;
 * лишняя строка в любом документе — расхождение. Количества сравниваются вместе с единицами.
 */
function itemQty(inv, pl) {
  const unique = (arr) => arr.every((i) => descKey(i.desc)) && new Set(arr.map((i) => descKey(i.desc))).size === arr.length;
  const byDesc = unique(inv.items) && unique(pl.items) && inv.items.length === pl.items.length
    && inv.items.every((i) => pl.items.some((o) => descKey(o.desc) === descKey(i.desc)));
  if (!byDesc) {
    const di = dupNumbers(inv.items), dp = dupNumbers(pl.items);
    if (di.size || dp.size) {
      return skip("item_qty", CONFLICT, [...inv.items.filter((i) => di.has(i.n)).map((i) => evItem(inv, i)), ...pl.items.filter((o) => dp.has(o.n)).map((o) => evItem(pl, o))]);
    }
  }
  const match = (it) => (byDesc ? pl.items.find((o) => descKey(o.desc) === descKey(it.desc)) : pl.items.find((o) => o.n === it.n));
  const bad = [], vague = [], unread = [], units = [], mismatch = [];
  const usedPl = new Set();
  for (const it of inv.items) {
    const other = match(it);
    if (!other) { bad.push({ text: (w) => w.line(it.n, w.missingPl), evidence: [evItem(inv, it)] }); continue; }
    usedPl.add(other);
    const pair = [evItem(inv, it), evItem(pl, other)];
    if (!byDesc && descKey(it.desc) && descKey(other.desc) && compareNames(it.desc, other.desc).verdict === "different") { mismatch.push(...pair); continue; }
    const a = num(inv, it.qty), b = num(pl, other.qty);
    if (a.ambiguous || b.ambiguous) { vague.push(...(a.ambiguous ? [pair[0]] : []), ...(b.ambiguous ? [pair[1]] : [])); continue; }
    if (a.value === null || b.value === null) { unread.push(...pair); continue; }
    const ua = itemUnit(it.unit), ub = itemUnit(other.unit);
    let qa = a.value, qb = b.value;
    if (ua?.kind === "mass" && ub?.kind === "mass") { qa *= ua.f; qb *= ub.f; }
    else if (!(ua?.kind === "count" && ub?.kind === "count" && ua.u === ub.u)) { units.push(...pair); continue; }
    if (!near(qa, qb)) bad.push({ text: (w) => w.line(it.n, w.qty(a.value, b.value)), evidence: pair });
  }
  for (const o of pl.items) if (!usedPl.has(o)) bad.push({ text: (w) => w.line(o.n, w.missingInv), evidence: [evItem(pl, o)] });
  if (bad.length) return fail("item_qty", "high", both((w) => bad.map((b) => b.text(w)).join(" · ")), bad.flatMap((b) => b.evidence));
  if (vague.length) return unclear("item_qty", vague);
  if (mismatch.length) return skip("item_qty", ITEMS_MISMATCH, mismatch);
  if (unread.length) return skip("item_qty", UNREADABLE, unread);
  if (units.length) return skip("item_qty", UNIT, units);
  return pass("item_qty");
}

export function runAudit(docs) {
  const by = Object.fromEntries(docs.map((d) => [d.type, d]));
  const inv = by.invoice, pl = by.packing, cmr = by.cmr;
  const present = compact([inv, pl, cmr]);
  const checks = [];

  // 1. суммы по строкам счёта
  {
    const bad = [], vague = [], unread = [];
    let computable = 0;
    for (const it of inv?.items ?? []) {
      const [q, p, t] = [it.qty, it.price, it.total].map((x) => num(inv, x));
      if (q.ambiguous || p.ambiguous || t.ambiguous) { vague.push(it); continue; }
      if (q.value === null || p.value === null || t.value === null) { unread.push(it); continue; }
      computable++;
      if (!near(q.value * p.value, t.value, 0.01)) bad.push({ it, expected: q.value * p.value, t: t.value });
    }
    if (bad.length) checks.push(fail("line_totals", "high",
      both((w) => bad.map((b) => w.line(b.it.n, `${b.it.qty} × ${b.it.price} = ${b.expected.toFixed(2)}, ${w.written} ${b.t}`)).join(" · ")),
      bad.map((b) => evItem(inv, b.it))));
    else if (vague.length) checks.push(unclear("line_totals", vague.map((it) => evItem(inv, it))));
    else if (unread.length) checks.push(skip("line_totals", UNREADABLE, unread.map((it) => evItem(inv, it))));
    else if (!computable) checks.push(skip("line_totals"));
    else checks.push(pass("line_totals"));
  }

  // 2. итог по счёту
  {
    const totalN = num(inv, F(inv, "total")?.value);
    const linesN = (inv?.items ?? []).map((i) => ({ i, n: num(inv, i.total) }));
    const total = totalN.value, lines = linesN.map((x) => x.n.value);
    if (totalN.ambiguous || linesN.some((x) => x.n.ambiguous)) {
      checks.push(unclear("invoice_sum", [totalN.ambiguous ? ev(inv, "total") : null, ...linesN.filter((x) => x.n.ambiguous).map((x) => evItem(inv, x.i))]));
    } else if (F(inv, "total") && lines.length && (total === null || lines.some((x) => x === null))) {
      // итог и строки есть, но часть чисел не прочитана: сверку выполнить не удалось
      checks.push(skip("invoice_sum", UNREADABLE, compact([total === null ? ev(inv, "total") : null, ...linesN.filter((x) => x.n.value === null).map((x) => evItem(inv, x.i))])));
    } else if (total === null || !lines.length) checks.push(skip("invoice_sum"));
    else {
      const sum = lines.reduce((a, b) => a + b, 0);
      checks.push(near(sum, total, 0.01)
        ? pass("invoice_sum", compact([ev(inv, "total")]))
        : fail("invoice_sum", "high", both((w) => w.sum(sum.toFixed(2), total)),
          compact([ev(inv, "total"), ...(inv.items ?? []).map((i) => evItem(inv, i))])));
    }
  }

  // 3-5. числа между документами
  checks.push(numericAcross("gross_weight", "gross_weight", present, true));
  checks.push(numericAcross("net_weight", "net_weight", compact([inv, pl])));
  checks.push(numericAcross("packages", "packages", present));

  // 6. количество по строкам: счёт и упаковочный лист
  {
    if (!inv?.items?.length || !pl?.items?.length) checks.push(skip("item_qty"));
    else checks.push(itemQty(inv, pl));
  }

  // 7-8. названия сторон
  for (const [id, key] of [["party_seller", "seller"], ["party_buyer", "buyer"]]) {
    const rows = present.filter((d) => F(d, key));
    if (rows.length < 2) { checks.push(skip(id)); continue; }
    const base = rows[0];
    const notes = [];
    let worst = "same", unknown = false;
    for (const d of rows.slice(1)) {
      // в строке рядом с названием часто идёт адрес: сравниваем только часть до первой запятой
      const nameOf = (doc) => String(F(doc, key).value).split(",")[0];
      const c = compareNames(nameOf(base), nameOf(d));
      if (c.verdict === "unknown") { unknown = true; continue; } // «---» и «???» не совпадение, а нечитаемое название
      if (c.verdict === "different") worst = "different";
      else if (c.verdict === "variant" && worst !== "different") worst = "variant";
      if (c.verdict !== "same") notes.push((w) => w.names(w.doc[base.type], w.doc[d.type], c.verdict, c.ratio));
    }
    const evidence = rows.map((d) => ev(d, key));
    if (worst === "same" && unknown) checks.push(skip(id, UNREADABLE, evidence));
    else if (worst === "same") checks.push(pass(id, evidence));
    else checks.push(fail(id, worst === "different" ? "high" : "medium", both((w) => notes.map((n) => n(w)).join(" · ")), evidence));
  }

  // 9. порядок дат
  {
    const shipRaw = F(cmr, "shipment_date") ?? F(cmr, "date");
    const ship = parseDate(shipRaw?.value);
    const all = [["invoice", inv], ["packing", pl]].map(([name, d]) => ({ name, d, date: parseDate(F(d, "date")?.value) }));
    const pairs = all.filter((x) => x.d && x.date);
    // дата есть, но не разбирается (2026-02-31, месяц 13, другой формат): порядок дат не проверен
    const invalid = compact([shipRaw && !ship ? { doc: "cmr", field: "shipment_date", value: shipRaw.value, page: shipRaw.page, quote: shipRaw.quote, origin: cmr.origin } : null,
      ...all.filter((x) => F(x.d, "date") && !x.date).map((x) => ev(x.d, "date"))]);
    if (invalid.length) checks.push(skip("date_order", DATE_INVALID, invalid));
    else if (!ship || !pairs.length) checks.push(skip("date_order"));
    else {
      const late = pairs.filter((p) => p.date.getTime() > ship.getTime());
      const evidence = compact([...pairs.map((p) => ev(p.d, "date")), { doc: "cmr", field: "shipment_date", value: shipRaw.value, page: shipRaw.page, quote: shipRaw.quote, origin: cmr.origin }]);
      checks.push(late.length ? fail("date_order", "medium", both((w) => late.map((p) => w.late(w.doc[p.name])).join(" · ")), evidence) : pass("date_order", evidence));
    }
  }

  // 10-11. код ТН ВЭД
  {
    const rows = present.filter((d) => F(d, "hs_code"));
    const digits = (d) => String(F(d, "hs_code").value).replace(/[\s.]/g, "");
    if (!rows.length) { checks.push(skip("hs_format")); checks.push(skip("hs_match")); }
    else {
      const badFmt = rows.filter((d) => !/^\d{6,10}$/.test(digits(d)));
      checks.push(badFmt.length
        ? fail("hs_format", "medium", both((w) => badFmt.map((d) => `${w.doc[d.type]}: "${F(d, "hs_code").value}"`).join(" · ")), badFmt.map((d) => ev(d, "hs_code")))
        : pass("hs_format"));
      if (rows.length < 2) checks.push(skip("hs_match"));
      else {
        // совместимость по префиксу нетранзитивна: 123456 подходит и к 12345678, и к 12345699, а те между собой нет
        const fits = (a, b) => { const [s, l] = a.length <= b.length ? [a, b] : [b, a]; return s.length >= 6 && l.startsWith(s); };
        const codes = rows.map(digits);
        const agree = codes.every((a, i) => codes.slice(i + 1).every((b) => fits(a, b)));
        checks.push(agree ? pass("hs_match", rows.map((d) => ev(d, "hs_code"))) : fail("hs_match", "high", both((w) => rows.map((d) => `${w.doc[d.type]}: ${digits(d)}`).join(" · ")), rows.map((d) => ev(d, "hs_code"))));
      }
    }
  }

  // 12. ссылка на номер инвойса
  {
    const num = F(inv, "number");
    const refs = compact([pl, cmr]).filter((d) => F(d, "reference"));
    if (!num || !refs.length) checks.push(skip("reference"));
    else {
      const same = (a, b) => String(a).trim().toUpperCase() === String(b).trim().toUpperCase();
      const bad = refs.filter((d) => !same(F(d, "reference").value, num.value));
      const evidence = compact([ev(inv, "number"), ...refs.map((d) => ev(d, "reference"))]);
      checks.push(bad.length ? fail("reference", "high", both((w) => bad.map((d) => w.ref(w.doc[d.type], F(d, "reference").value, num.value)).join(" · ")), evidence) : pass("reference", evidence));
    }
  }

  // 13. нетто не больше брутто
  {
    const all = present.filter((d) => F(d, "gross_weight") && F(d, "net_weight"))
      .map((d) => ({ d, g: quantity(d, "gross_weight", true), n: quantity(d, "net_weight", true) }));
    const both2 = (r) => [ev(r.d, "gross_weight"), ev(r.d, "net_weight")];
    const vague = all.filter((r) => r.g.n.ambiguous || r.n.n.ambiguous);
    const rows = all.filter((r) => r.g.v !== null && r.n.v !== null).map((r) => ({ d: r.d, g: r.g.v, n: r.n.v }));
    const incomplete = all.filter((r) => !vague.includes(r) && (r.g.v === null || r.n.v === null));
    const bad = rows.filter((r) => r.n > r.g + 0.005);
    if (bad.length) checks.push(fail("net_le_gross", "high", both((w) => bad.map((r) => w.netGross(w.doc[r.d.type], r.n, r.g)).join(" · ")), bad.flatMap((r) => compact(both2(r)))));
    else if (vague.length) checks.push(unclear("net_le_gross", vague.flatMap((r) => [r.g.n.ambiguous ? ev(r.d, "gross_weight") : null, r.n.n.ambiguous ? ev(r.d, "net_weight") : null])));
    else if (incomplete.length) {
      const noUnit = incomplete.some((r) => r.g.n.value !== null && r.n.n.value !== null);
      checks.push(skip("net_le_gross", noUnit ? UNIT : UNREADABLE, incomplete.flatMap((r) => compact(both2(r)))));
    } else if (!rows.length) checks.push(skip("net_le_gross"));
    else checks.push(pass("net_le_gross"));
  }

  const counted = checks.filter((c) => c.status !== "skip");
  return {
    checks,
    findings: checks.filter((c) => c.status === "fail"),
    passed: counted.filter((c) => c.status === "pass").length,
    total: counted.length,
    skipped: checks.length - counted.length,
  };
}
