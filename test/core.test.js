import test from "node:test";
import assert from "node:assert/strict";
import { compareNames, canonName } from "../lib/normalize.js";
import { parseNumber, parseDate } from "../lib/parse.js";
import { runAudit } from "../lib/audit.js";
import { mockExtract } from "../lib/extract/mock.js";
import { verifyExtraction } from "../lib/extract/verify.js";
import { checkPack, validateDocs } from "../lib/pipeline.js";
import { makeSet, samples } from "../lib/generate.js";
import { buildLetter } from "../lib/letters.js";
import { inspect, loadRules } from "../lib/inspector.js";

test("названия: кириллица, латиница и юр. форма считаются одной компанией", () => {
  assert.equal(compareNames("Altyn Bidai LLP", "ТОО «Алтын Бидай»").verdict, "same");
  assert.equal(compareNames('OOO "Sharq Oziq-Ovqat"', "Sharq Oziq-Ovqat MChJ").verdict, "same");
  assert.equal(compareNames("Tashkent Agro MChJ", "Tashkint Agro MChJ").verdict, "variant");
  assert.equal(compareNames("Altyn Bidai LLP", "Karavan Trade LLP").verdict, "different");
  assert.ok(canonName("") === "");
});

test("числа и даты", () => {
  assert.equal(parseNumber("35,000.50 kg"), 35000.5);
  assert.equal(parseNumber("1.234,50"), 1234.5);
  assert.equal(parseNumber("12,5"), 12.5);
  assert.equal(parseNumber("n/a"), null);
  assert.equal(parseDate("2026-10-12").getUTCDate(), 12);
  assert.equal(parseDate("12.10.2026").getUTCMonth(), 9);
  assert.equal(parseDate("nonsense"), null);
});

test("чистый комплект проходит все проверки и даёт 0 замечаний", async () => {
  const r = await checkPack(samples()[0].docs, { env: {} });
  assert.equal(r.findings.length, 0);
  assert.equal(r.passed, r.total);
  assert.equal(r.total, 13);
});

test("комплект с ошибками: находятся именно внесённые", async () => {
  const s = samples().find((x) => x.id === "four");
  const r = await checkPack(s.docs, { env: {} });
  const ids = r.findings.map((f) => f.id);
  for (const id of ["line_totals", "gross_weight", "party_buyer", "date_order"]) assert.ok(ids.includes(id), id);
  assert.ok(r.passed < r.total);
});

test("у каждого замечания есть цитата и страница", async () => {
  const r = await checkPack(samples().find((x) => x.id === "five").docs, { env: {} });
  assert.ok(r.findings.length >= 4);
  for (const f of r.findings) {
    assert.ok(f.evidence.length >= 1);
    for (const e of f.evidence) { assert.ok(e.quote && e.page >= 1 && e.doc); }
  }
});

test("защита от выдумок: поле с цитатой, которой нет на странице, отбрасывается", () => {
  const doc = { type: "invoice", text: "INVOICE\nInvoice No: INV-1\nTotal: 100.00" };
  const ex = mockExtract(doc);
  ex.fields.total = { value: "999", page: 1, quote: "Total: 999.00", confidence: 1 }; // выдумка
  ex.fields.seller = { value: "X", page: 2, quote: "Seller: X", confidence: 1 }; // нет такой страницы
  const v = verifyExtraction(doc, ex);
  assert.ok(!v.fields.total && !v.fields.seller);
  assert.ok(v.fields.number);
  assert.equal(v.dropped.length, 2);
});

test("письмо: только факты, значений не предлагает", async () => {
  const r = await checkPack(samples().find((x) => x.id === "four").docs, { env: {} });
  for (const lang of ["en", "ru"]) {
    const t = buildLetter(r.findings, lang);
    assert.ok(t.includes("«"));
    assert.ok(!/should be|correct value is|must be|нужно указать|следует указать|правильное значение:/i.test(t));
  }
  assert.match(buildLetter([], "en"), /No differences/);
});

test("Инспектор: нет правила, нет вопроса", () => {
  const rules = loadRules();
  const { questions, noRule } = inspect([{ id: "gross_weight" }, { id: "unknown_check" }], rules);
  assert.equal(questions.length, 1);
  assert.equal(questions[0].rule, "R-DEMO-03");
  assert.deepEqual(noRule, ["unknown_check"]);
  assert.ok(rules.every((r) => r.demo && r.status === "needs_review" && r.source_url === null));
});

test("проверка входных данных", () => {
  assert.ok(validateDocs([]));
  assert.ok(validateDocs([{ type: "passport", text: "x" }]));
  assert.ok(validateDocs([{ type: "invoice", text: "x" }, { type: "invoice", text: "y" }]));
  assert.ok(validateDocs([{ type: "invoice", text: "x".repeat(20001) }]));
  assert.equal(validateDocs([{ type: "invoice", text: "ok" }]), null);
});

test("пропуск проверок, если данных не хватает", async () => {
  const r = await checkPack([{ type: "invoice", text: "INVOICE\nInvoice No: A1" }], { env: {} });
  assert.equal(r.findings.length, 0);
  assert.ok(r.skipped >= 8);
});

test("runAudit не падает на пустом разборе", () => {
  const r = runAudit([{ type: "invoice", fields: {}, items: [] }]);
  assert.equal(r.findings.length, 0);
});

test("генератор детерминирован", () => {
  assert.deepEqual(makeSet(5, ["gross_weight_mismatch"]).docs, makeSet(5, ["gross_weight_mismatch"]).docs);
});
