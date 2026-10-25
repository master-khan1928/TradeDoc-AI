// Неоднозначные числа: «32.500» не угадываем. Контекст документа помогает, только если он однозначен.
import test from "node:test";
import assert from "node:assert/strict";
import { readNumber, parseNumber, numberContext } from "../lib/parse.js";
import { runAudit, AMBIGUOUS } from "../lib/audit.js";
import { checkPack } from "../lib/pipeline.js";

test("однозначные записи читаются", () => {
  assert.deepEqual(readNumber("1,234.50"), { value: 1234.5, ambiguous: false });
  assert.deepEqual(readNumber("1.234,50"), { value: 1234.5, ambiguous: false });
  assert.deepEqual(readNumber("1 234,50"), { value: 1234.5, ambiguous: false });
  assert.deepEqual(readNumber("1 234,50"), { value: 1234.5, ambiguous: false }, "неразрывный пробел");
  assert.equal(parseNumber("54 000 kg"), 54000);
  assert.equal(parseNumber("1.234.567"), 1234567);
  assert.equal(parseNumber("12,5"), 12.5);
  assert.equal(parseNumber("0,500"), 0.5, "ведущий ноль: разделитель тысяч невозможен");
  assert.equal(parseNumber("28500,000"), 28500, "больше трёх цифр перед знаком: разделитель тысяч невозможен");
});

test("28 500,000 kg: тысячи уже разделены пробелом, значит запятая десятичная", () => {
  assert.deepEqual(readNumber("28 500,000 kg"), { value: 28500, ambiguous: false });
});

test("32.500 kg без контекста: «неоднозначно», значение не подставляется", () => {
  assert.deepEqual(readNumber("32.500 kg"), { value: null, ambiguous: true });
  assert.deepEqual(readNumber("1,080"), { value: null, ambiguous: true });
  assert.equal(parseNumber("32.500 kg"), null);
});

test("контекст документа: однозначный разрешает, противоречивый нет", () => {
  const eu = numberContext("Price: 15,00\nAmount: 1.840,00\nGross weight: 32.500 kg");
  assert.deepEqual(eu, { decimal: ",", conflict: false });
  assert.equal(readNumber("32.500 kg", eu.decimal).value, 32500);
  const en = numberContext("Unit price: 11.50\nPackages: 1,080");
  assert.equal(readNumber("1,080", en.decimal).value, 1080);
  assert.equal(readNumber("32.500", en.decimal).value, 32.5);
  // оба варианта в одном документе: контекста нет
  assert.deepEqual(numberContext("Price: 15,00\nTotal: 1,234.50"), { decimal: null, conflict: true });
  // даты, коды ТН ВЭД и телефоны доказательством не считаются
  assert.equal(numberContext("Date: 07.10.2026\nHS: 1101.00.1500\nTel: +7 700 000 0000\nGross: 32.500").decimal, null);
});

const doc = (type, fields, text = "") => ({
  type, origin: "text", items: [], numberContext: numberContext(text),
  fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, { value: v, page: 1, quote: `${k}: ${v}` }])),
});

test("сверка без контекста: skip с причиной и цитатой, без значения и без замечания", () => {
  const a = runAudit([doc("invoice", { gross_weight: "32.500 kg" }), doc("cmr", { gross_weight: "32500 kg" })]);
  const g = a.checks.find((c) => c.id === "gross_weight");
  assert.equal(g.status, "skip");
  assert.equal(g.reason, AMBIGUOUS);
  assert.equal(g.reasonText.ru, "формат числа неоднозначен, подтвердите вручную");
  assert.deepEqual(g.evidence.map((e) => [e.doc, e.quote]), [["invoice", "gross_weight: 32.500 kg"]], "цитата только неоднозначного числа");
  assert.equal(g.detail, "", "ни один вариант значения не назван");
  assert.equal(a.findings.length, 0);
});

test("сверка с контекстом: число понято, совпадение или расхождение как обычно", () => {
  const ctx = "Price: 15,00\nAmount: 1.840,00";
  const same = runAudit([doc("invoice", { gross_weight: "32.500 kg" }, ctx), doc("cmr", { gross_weight: "32 500 kg" })]);
  assert.equal(same.checks.find((c) => c.id === "gross_weight").status, "pass");
  const diff = runAudit([doc("invoice", { gross_weight: "32.500 kg" }, ctx), doc("cmr", { gross_weight: "32 700 kg" })]);
  assert.equal(diff.checks.find((c) => c.id === "gross_weight").status, "fail");
});

test("явное расхождение однозначных чисел остаётся замечанием, даже если третье число неоднозначно", () => {
  const a = runAudit([doc("invoice", { gross_weight: "32 500 kg" }), doc("packing", { gross_weight: "32 700 kg" }), doc("cmr", { gross_weight: "32.500" })]);
  assert.equal(a.checks.find((c) => c.id === "gross_weight").status, "fail");
});

test("вся цепочка: контекст берётся только из того же документа", async () => {
  const inv = "INVOICE\nInvoice No: INV-1\n1 | Flour | 100 | bags | 15,00 | 1.500,00\nTotal: 1.500,00\nGross weight: 32.500 kg";
  const cmr = "CMR\nInvoice reference: INV-1\nGross weight: 32.500 kg";
  const r = await checkPack([{ type: "invoice", text: inv }, { type: "cmr", text: cmr }], { env: {} });
  const g = r.checks.find((c) => c.id === "gross_weight");
  assert.equal(g.status, "skip", "в CMR контекста нет: не угадываем, что формат как в инвойсе");
  assert.deepEqual(g.evidence.map((e) => e.doc), ["cmr"]);
  assert.equal(r.findings.length, 0);
});
