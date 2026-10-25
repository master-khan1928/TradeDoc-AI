// Сверка документов. Чистый код: ИИ здесь не участвует и ничего не «угадывает».
// Каждая проверка возвращает pass | fail | skip. Система никогда не предлагает значений:
// она показывает, что где написано, и просит человека подтвердить верное.
import { compareNames } from "./normalize.js";
import { parseNumber, parseDate, near } from "./parse.js";

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

const F = (d, k) => d?.fields?.[k];
const ev = (d, k) => {
  const f = F(d, k);
  return f ? { doc: d.type, field: k, value: f.value, page: f.page, quote: f.quote } : null;
};
const evItem = (d, it) => ({ doc: d.type, field: `item ${it.n}`, value: it.quote, page: it.page, quote: it.quote });
const compact = (a) => a.filter(Boolean);

function result(id, status, severity, detail, evidence) {
  return { id, title: CHECKS[id], status, severity: status === "fail" ? severity : null, detail: detail ?? "", evidence: evidence ?? [] };
}
const skip = (id) => result(id, "skip");
const pass = (id, evidence) => result(id, "pass", null, "", evidence);
const fail = (id, severity, detail, evidence) => result(id, "fail", severity, detail, evidence);

function numericAcross(id, key, docs, unit = "") {
  const rows = docs.map((d) => ({ d, f: F(d, key), v: parseNumber(F(d, key)?.value) })).filter((r) => r.f && r.v !== null);
  if (rows.length < 2) return skip(id);
  const evidence = rows.map((r) => ev(r.d, key));
  if (rows.every((r) => near(r.v, rows[0].v))) return pass(id, evidence);
  return fail(id, "high", rows.map((r) => `${r.d.type}: ${r.v}${unit}`).join(" · "), evidence);
}

export function runAudit(docs) {
  const by = Object.fromEntries(docs.map((d) => [d.type, d]));
  const inv = by.invoice, pl = by.packing, cmr = by.cmr;
  const present = compact([inv, pl, cmr]);
  const checks = [];

  // 1. суммы по строкам счёта
  {
    const bad = [];
    let computable = 0;
    for (const it of inv?.items ?? []) {
      const q = parseNumber(it.qty), p = parseNumber(it.price), t = parseNumber(it.total);
      if (q === null || p === null || t === null) continue;
      computable++;
      if (!near(q * p, t, 0.01)) bad.push({ it, expected: q * p, t });
    }
    if (!computable) checks.push(skip("line_totals"));
    else if (!bad.length) checks.push(pass("line_totals"));
    else checks.push(fail("line_totals", "high",
      bad.map((b) => `line ${b.it.n}: ${b.it.qty} × ${b.it.price} = ${b.expected.toFixed(2)}, written ${b.t}`).join(" · "),
      bad.map((b) => evItem(inv, b.it))));
  }

  // 2. итог по счёту
  {
    const total = parseNumber(F(inv, "total")?.value);
    const lines = (inv?.items ?? []).map((i) => parseNumber(i.total));
    if (total === null || !lines.length || lines.some((x) => x === null)) checks.push(skip("invoice_sum"));
    else {
      const sum = lines.reduce((a, b) => a + b, 0);
      checks.push(near(sum, total, 0.01)
        ? pass("invoice_sum", compact([ev(inv, "total")]))
        : fail("invoice_sum", "high", `sum of lines = ${sum.toFixed(2)}, written total ${total}`,
          compact([ev(inv, "total"), ...(inv.items ?? []).map((i) => evItem(inv, i))])));
    }
  }

  // 3-5. числа между документами
  checks.push(numericAcross("gross_weight", "gross_weight", present, " kg"));
  checks.push(numericAcross("net_weight", "net_weight", compact([inv, pl])));
  checks.push(numericAcross("packages", "packages", present));

  // 6. количество по строкам: счёт и упаковочный лист
  {
    if (!inv?.items?.length || !pl?.items?.length) checks.push(skip("item_qty"));
    else {
      const bad = [];
      for (const it of inv.items) {
        const other = pl.items.find((x) => x.n === it.n);
        if (!other) { bad.push({ text: `line ${it.n}: missing in packing list`, evidence: [evItem(inv, it)] }); continue; }
        const a = parseNumber(it.qty), b = parseNumber(other.qty);
        if (a !== null && b !== null && !near(a, b)) bad.push({ text: `line ${it.n}: ${a} vs ${b}`, evidence: [evItem(inv, it), evItem(pl, other)] });
      }
      for (const o of pl.items) if (!inv.items.some((x) => x.n === o.n)) bad.push({ text: `line ${o.n}: missing in invoice`, evidence: [evItem(pl, o)] });
      checks.push(bad.length ? fail("item_qty", "high", bad.map((b) => b.text).join(" · "), bad.flatMap((b) => b.evidence)) : pass("item_qty"));
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
      if (c.verdict !== "same") notes.push(`${base.type} vs ${d.type}: ${c.verdict} (${c.ratio})`);
    }
    const evidence = rows.map((d) => ev(d, key));
    if (worst === "same") checks.push(pass(id, evidence));
    else checks.push(fail(id, worst === "different" ? "high" : "medium", notes.join(" · "), evidence));
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
      const evidence = compact([...pairs.map((p) => ev(p.d, "date")), { doc: "cmr", field: "shipment_date", value: shipRaw.value, page: shipRaw.page, quote: shipRaw.quote }]);
      checks.push(late.length ? fail("date_order", "medium", late.map((p) => `${p.name} date is after shipment date`).join(" · "), evidence) : pass("date_order", evidence));
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
        ? fail("hs_format", "medium", badFmt.map((d) => `${d.type}: "${F(d, "hs_code").value}"`).join(" · "), badFmt.map((d) => ev(d, "hs_code")))
        : pass("hs_format"));
      if (rows.length < 2) checks.push(skip("hs_match"));
      else {
        const a = digits(rows[0]);
        const agree = rows.every((d) => { const b = digits(d); const [s, l] = a.length <= b.length ? [a, b] : [b, a]; return s.length >= 6 && l.startsWith(s); });
        checks.push(agree ? pass("hs_match", rows.map((d) => ev(d, "hs_code"))) : fail("hs_match", "high", rows.map((d) => `${d.type}: ${digits(d)}`).join(" · "), rows.map((d) => ev(d, "hs_code"))));
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
      checks.push(bad.length ? fail("reference", "high", bad.map((d) => `${d.type}: ${F(d, "reference").value} vs ${num.value}`).join(" · "), evidence) : pass("reference", evidence));
    }
  }

  // 13. нетто не больше брутто
  {
    const rows = present.map((d) => ({ d, g: parseNumber(F(d, "gross_weight")?.value), n: parseNumber(F(d, "net_weight")?.value) })).filter((r) => r.g !== null && r.n !== null);
    if (!rows.length) checks.push(skip("net_le_gross"));
    else {
      const bad = rows.filter((r) => r.n > r.g + 0.005);
      checks.push(bad.length
        ? fail("net_le_gross", "high", bad.map((r) => `${r.d.type}: net ${r.n} > gross ${r.g}`).join(" · "), bad.flatMap((r) => compact([ev(r.d, "gross_weight"), ev(r.d, "net_weight")])))
        : pass("net_le_gross"));
    }
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
