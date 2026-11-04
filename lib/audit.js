// Сверка документов. Чистый код: ИИ здесь не участвует и ничего не «угадывает».
// Каждая проверка возвращает pass | fail | skip. Система никогда не предлагает значений:
// она показывает, что где написано, и просит человека подтвердить верное.
import { compareNames } from "./normalize.js";
import { readNumber, parseDate, near } from "./parse.js";

// Причина пропуска: число записано неоднозначно («32.500»), а контекст документа не помог.
// Значение не подставляется и «правильный» вариант не называется: человек подтверждает сам.
export const AMBIGUOUS = "number_format_ambiguous";
export const UNVERIFIED = "quote_unverified";
export const SKIP_REASONS = {
  [AMBIGUOUS]: { ru: "формат числа неоднозначен, подтвердите вручную", en: "number format is ambiguous, please confirm by hand" },
  [UNVERIFIED]: { ru: "прочитанное значение не подтвердилось цитатой из документа, подтвердите вручную", en: "a read value was not confirmed by a quote from the document, please confirm by hand" },
};
// Какие поля нужны каждой проверке. Если у документа такое поле прочитано, но отброшено (цитаты нет на странице),
// проверка не может считаться пройденной: «нужна проверка человеком», а не «всё хорошо».
export const CHECK_FIELDS = {
  line_totals: ["items"], invoice_sum: ["total", "items"], gross_weight: ["gross_weight"], net_weight: ["net_weight"],
  packages: ["packages"], item_qty: ["items"], party_seller: ["seller"], party_buyer: ["buyer"],
  date_order: ["date", "shipment_date"], hs_format: ["hs_code"], hs_match: ["hs_code"], reference: ["reference", "number"],
  net_le_gross: ["gross_weight", "net_weight"],
};

/** Пройденные проверки, для которых часть данных отброшена как неподтверждённая, переводятся в «нужна проверка». */
export function downgradeUnverified(audit, dropped) {
  const keys = new Set(dropped.map((d) => (d.kind === "item" ? "items" : d.key)));
  const checks = audit.checks.map((c) => (c.status === "pass" && (CHECK_FIELDS[c.id] ?? []).some((k) => keys.has(k))
    ? { ...c, status: "skip", reason: UNVERIFIED, reasonText: SKIP_REASONS[UNVERIFIED], title: CHECKS[c.id] }
    : c));
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

function numericAcross(id, key, docs, kg = false) {
  const rows = docs.filter((d) => F(d, key)).map((d) => ({ d, n: num(d, F(d, key).value) }));
  const clear = rows.filter((r) => r.n.value !== null), vague = rows.filter((r) => r.n.ambiguous);
  if (clear.length >= 2 && !clear.every((r) => near(r.n.value, clear[0].n.value))) {
    return fail(id, "high", both((w) => clear.map((r) => `${w.doc[r.d.type]}: ${r.n.value}${kg ? w.kg : ""}`).join(" · ")), clear.map((r) => ev(r.d, key)));
  }
  if (vague.length) return unclear(id, vague.map((r) => ev(r.d, key)));
  if (clear.length < 2) return skip(id);
  return pass(id, clear.map((r) => ev(r.d, key)));
}

export function runAudit(docs) {
  const by = Object.fromEntries(docs.map((d) => [d.type, d]));
  const inv = by.invoice, pl = by.packing, cmr = by.cmr;
  const present = compact([inv, pl, cmr]);
  const checks = [];

  // 1. суммы по строкам счёта
  {
    const bad = [], vague = [];
    let computable = 0;
    for (const it of inv?.items ?? []) {
      const [q, p, t] = [it.qty, it.price, it.total].map((x) => num(inv, x));
      if (q.ambiguous || p.ambiguous || t.ambiguous) { vague.push(it); continue; }
      if (q.value === null || p.value === null || t.value === null) continue;
      computable++;
      if (!near(q.value * p.value, t.value, 0.01)) bad.push({ it, expected: q.value * p.value, t: t.value });
    }
    if (bad.length) checks.push(fail("line_totals", "high",
      both((w) => bad.map((b) => w.line(b.it.n, `${b.it.qty} × ${b.it.price} = ${b.expected.toFixed(2)}, ${w.written} ${b.t}`)).join(" · ")),
      bad.map((b) => evItem(inv, b.it))));
    else if (vague.length) checks.push(unclear("line_totals", vague.map((it) => evItem(inv, it))));
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
    } else if (total === null || !lines.length || lines.some((x) => x === null)) checks.push(skip("invoice_sum"));
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
    else {
      const bad = [], vague = [];
      for (const it of inv.items) {
        const other = pl.items.find((x) => x.n === it.n);
        if (!other) { bad.push({ text: (w) => w.line(it.n, w.missingPl), evidence: [evItem(inv, it)] }); continue; }
        const a = num(inv, it.qty), b = num(pl, other.qty);
        if (a.ambiguous || b.ambiguous) { vague.push(...(a.ambiguous ? [evItem(inv, it)] : []), ...(b.ambiguous ? [evItem(pl, other)] : [])); continue; }
        if (a.value !== null && b.value !== null && !near(a.value, b.value)) bad.push({ text: (w) => w.line(it.n, w.qty(a.value, b.value)), evidence: [evItem(inv, it), evItem(pl, other)] });
      }
      for (const o of pl.items) if (!inv.items.some((x) => x.n === o.n)) bad.push({ text: (w) => w.line(o.n, w.missingInv), evidence: [evItem(pl, o)] });
      checks.push(bad.length ? fail("item_qty", "high", both((w) => bad.map((b) => b.text(w)).join(" · ")), bad.flatMap((b) => b.evidence))
        : vague.length ? unclear("item_qty", vague) : pass("item_qty"));
    }
  }

  // 7-8. названия сторон
  for (const [id, key] of [["party_seller", "seller"], ["party_buyer", "buyer"]]) {
    const rows = present.filter((d) => F(d, key));
    if (rows.length < 2) { checks.push(skip(id)); continue; }
    const base = rows[0];
    const notes = [];
    let worst = "same";
    for (const d of rows.slice(1)) {
      // в строке рядом с названием часто идёт адрес: сравниваем только часть до первой запятой
      const nameOf = (doc) => String(F(doc, key).value).split(",")[0];
      const c = compareNames(nameOf(base), nameOf(d));
      if (c.verdict === "different") worst = "different";
      else if (c.verdict === "variant" && worst !== "different") worst = "variant";
      if (c.verdict !== "same") notes.push((w) => w.names(w.doc[base.type], w.doc[d.type], c.verdict, c.ratio));
    }
    const evidence = rows.map((d) => ev(d, key));
    if (worst === "same") checks.push(pass(id, evidence));
    else checks.push(fail(id, worst === "different" ? "high" : "medium", both((w) => notes.map((n) => n(w)).join(" · ")), evidence));
  }

  // 9. порядок дат
  {
    const shipRaw = F(cmr, "shipment_date") ?? F(cmr, "date");
    const ship = parseDate(shipRaw?.value);
    const pairs = [["invoice", inv], ["packing", pl]]
      .map(([name, d]) => ({ name, d, date: parseDate(F(d, "date")?.value) }))
      .filter((x) => x.d && x.date);
    if (!ship || !pairs.length) checks.push(skip("date_order"));
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
        const a = digits(rows[0]);
        const agree = rows.every((d) => { const b = digits(d); const [s, l] = a.length <= b.length ? [a, b] : [b, a]; return s.length >= 6 && l.startsWith(s); });
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
      .map((d) => ({ d, gN: num(d, F(d, "gross_weight").value), nN: num(d, F(d, "net_weight").value) }));
    const vague = all.filter((r) => r.gN.ambiguous || r.nN.ambiguous);
    const rows = all.filter((r) => r.gN.value !== null && r.nN.value !== null).map((r) => ({ d: r.d, g: r.gN.value, n: r.nN.value }));
    const bad = rows.filter((r) => r.n > r.g + 0.005);
    if (bad.length) checks.push(fail("net_le_gross", "high", both((w) => bad.map((r) => w.netGross(w.doc[r.d.type], r.n, r.g)).join(" · ")), bad.flatMap((r) => compact([ev(r.d, "gross_weight"), ev(r.d, "net_weight")]))));
    else if (vague.length) checks.push(unclear("net_le_gross", vague.flatMap((r) => [r.gN.ambiguous ? ev(r.d, "gross_weight") : null, r.nN.ambiguous ? ev(r.d, "net_weight") : null])));
    else if (!rows.length) checks.push(skip("net_le_gross"));
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
