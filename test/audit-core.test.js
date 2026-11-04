// Регрессии по аудиту 05.11.2026, группа 1: достоверность ядра. Каждый тест повторяет сценарий из аудита
// (вход тот же) и проверяет новый результат. Принцип: «не смогли проверить» не бывает pass.
import test from "node:test";
import assert from "node:assert/strict";
import { checkPack } from "../lib/pipeline.js";
import { readNumber, parseDate, numberContext } from "../lib/parse.js";
import { compareNames } from "../lib/normalize.js";
import { verifyExtraction } from "../lib/extract/verify.js";
import { mockExtract } from "../lib/extract/mock.js";
import { callModel, EXTRACTION_SCHEMA, resetJsonFallback } from "../lib/extract/meta.js";
import { readUpload } from "../lib/upload.js";
import { resetLimiters, extractionCache } from "../lib/extract/limits.js";
const resetLimits = () => { resetLimiters(); extractionCache.clear(); };

const status = async (docs, id, opts = { env: {} }) => (await checkPack(docs, opts)).checks.find((c) => c.id === id);
const AI = { META_API_KEY: "fake", META_MODEL: "audit", LLM_RPM: "1000" };
const reply = (obj) => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify(obj) } }] }) });
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");

test("№1: настоящая цитата и выдуманное значение: поле отбрасывается, сверка не pass", async () => {
  const v = verifyExtraction({ text: "Gross weight: 100 kg" }, { fields: { gross_weight: { value: "1000 kg", quote: "Gross weight: 100 kg", page: 1 } }, items: [] });
  assert.deepEqual(Object.keys(v.fields), []);
  assert.equal(v.dropped[0].key, "gross_weight");
  assert.equal(v.dropped[0].reason, "value not in quote");
  // строка товара: количество не из цитаты
  const it = verifyExtraction({ text: "1 | A | 10 | pcs | 1 | 10" }, { fields: {}, items: [{ n: 1, desc: "A", qty: "100", unit: "pcs", price: "1", total: "10", page: 1, quote: "1 | A | 10 | pcs | 1 | 10" }] });
  assert.equal(it.items.length, 0);
  // цифры совпадают как подстрока, но число другое: «100 kg» не подтверждается цитатой «1100 kg»
  assert.equal(Object.keys(verifyExtraction({ text: "Gross weight: 1100 kg" }, { fields: { gross_weight: { value: "100 kg", quote: "Gross weight: 1100 kg", page: 1 } } }).fields).length, 0);

  // сценарий целиком: модель возвращает 1000 kg для инвойса с цитатой «100 kg»
  const docs = [{ type: "invoice", text: "INVOICE\nGross weight: 100 kg" }, { type: "packing", text: "PACKING LIST\nGross weight: 1000 kg" }];
  const fetchImpl = async (url, init) => {
    const inv = JSON.parse(init.body).messages[1].content.includes("invoice");
    return reply({ fields: { gross_weight: { value: "1000 kg", quote: inv ? "Gross weight: 100 kg" : "Gross weight: 1000 kg", page: 1, confidence: 1 } }, items: [] });
  };
  const r = await checkPack(docs, { env: AI, fetchImpl });
  assert.notEqual(r.checks.find((c) => c.id === "gross_weight").status, "pass");
  assert.ok(r.dropped.some((d) => d.doc === "invoice" && d.key === "gross_weight"));
});

test("№2: вес с единицами: 1 t и 1 kg расходятся, 1 t и 1000 kg совпадают, неизвестная единица на ручную проверку", async () => {
  const w = (a, b) => status([{ type: "invoice", text: `Gross weight: ${a}` }, { type: "packing", text: `Gross weight: ${b}` }], "gross_weight");
  assert.equal((await w("1 t", "1 kg")).status, "fail");
  assert.equal((await w("1 t", "1000 kg")).status, "pass");
  const odd = await w("1 stone", "1 kg");
  assert.equal(odd.status, "skip");
  assert.equal(odd.reason, "unit_unknown");
  assert.equal((await w("100", "100 kg")).reason, "unit_unknown", "единица не указана в одном документе");
  // количество по строкам тоже с единицами
  const q = (a, b) => status([{ type: "invoice", text: `1 | Flour | ${a} | 1 | 1` }, { type: "packing", text: `1 | Flour | ${b}` }], "item_qty");
  assert.equal((await q("1 | t", "1000 | kg")).status, "pass");
  assert.equal((await q("10 | pcs", "10 | bags")).reason, "unit_unknown");
});

test("№3, №14: непрочитанная часть проверки даёт «нужна проверка», а не pass", async () => {
  const lt = await status([{ type: "invoice", text: "1 | A | 2 | pcs | 5 | 10\n2 | B | n/a | pcs | 5 | 10" }], "line_totals");
  assert.equal(lt.status, "skip");
  assert.equal(lt.reason, "value_unreadable");
  const iq = await status([{ type: "invoice", text: "1 | A | n/a | pcs | 1 | 1" }, { type: "packing", text: "1 | A | 100 | pcs" }], "item_qty");
  assert.equal(iq.reason, "value_unreadable");
  const gw = await status([{ type: "invoice", text: "Gross weight: 100 kg" }, { type: "packing", text: "Gross weight: 100 kg" }, { type: "cmr", text: "Gross weight: unknown" }], "gross_weight");
  assert.equal(gw.reason, "value_unreadable");
  const names = await status([{ type: "invoice", text: "Seller: ---" }, { type: "packing", text: "Seller: ???" }], "party_seller");
  assert.equal(names.status, "skip");
  assert.equal(names.reason, "value_unreadable");
});

test("№25: readNumber разбирает ровно одно число во всём поле", () => {
  for (const s of ["12 kg; 1 000 packages", "1234 567 kg", "100-200 kg", "1e3 kg", "1/2 kg", "−100 kg", "1,2,3.45 kg"]) {
    const r = readNumber(s);
    assert.equal(r.value, null, s);
    assert.equal(r.unsupported, true, s);
  }
  // обычные записи не задеты
  assert.deepEqual(readNumber("54 000 kg"), { value: 54000, ambiguous: false });
  assert.deepEqual(readNumber("USD 1,234.50"), { value: 1234.5, ambiguous: false });
  assert.deepEqual(readNumber("-5"), { value: -5, ambiguous: false });
});

test("№25 в сверке: «12 kg; 1 000 packages» против 1000 kg не даёт pass", async () => {
  const r = await status([{ type: "invoice", text: "Gross weight: 12 kg; 1 000 packages" }, { type: "packing", text: "Gross weight: 1000 kg" }], "gross_weight");
  assert.notEqual(r.status, "pass");
});

test("№26: повтор номера позиции с другим товаром не прячется", async () => {
  const r = await status([{ type: "invoice", text: "1 | A | 10 | pcs | 1 | 10" }, { type: "packing", text: "1 | A | 10 | pcs\n1 | B | 999 | pcs" }], "item_qty");
  assert.notEqual(r.status, "pass");
  assert.equal(r.reason, "field_conflict");
});

test("№19: позиции переставлены — сопоставление по описанию; один номер, разные товары — не pass", async () => {
  const swapped = await status([{ type: "invoice", text: "1 | A | 10 | pcs | 1 | 10\n2 | B | 20 | pcs | 1 | 20" }, { type: "packing", text: "1 | B | 20 | pcs\n2 | A | 10 | pcs" }], "item_qty");
  assert.equal(swapped.status, "pass");
  const other = await status([{ type: "invoice", text: "1 | Wheat flour | 10 | pcs | 1 | 10" }, { type: "packing", text: "1 | Copper cables | 10 | pcs" }], "item_qty");
  assert.notEqual(other.status, "pass");
});

test("№27: цифры в названии различают компании", async () => {
  assert.equal(compareNames("Trade 100 Ltd", "Trade 10 Ltd").verdict, "different");
  assert.equal(compareNames("AB1", "AB11").verdict, "different");
  assert.equal(compareNames("Altyn Bidai LLP", "ТОО Алтын Бидай").verdict, "same", "обычная транслитерация не задета");
  assert.equal((await status([{ type: "invoice", text: "Seller: Trade 100 Ltd" }, { type: "packing", text: "Seller: Trade 10 Ltd" }], "party_seller")).status, "fail");
});

test("№28: 201-я позиция не теряется молча: результат неполный, нужна проверка", async () => {
  resetLimits();
  const text = Array.from({ length: 201 }, (_, i) => `${i + 1} | A | 1 | pcs | 1 | ${i === 200 ? 999 : 1}`).join("\n");
  const extraction = mockExtract({ type: "invoice", text });
  const fetchImpl = async () => reply(extraction);
  const r = await checkPack([{ type: "invoice", text }], { env: AI, fetchImpl });
  assert.notEqual(r.checks.find((c) => c.id === "line_totals").status, "pass");
  assert.ok(r.dropped.some((d) => d.reason === "too many items"));
});

test("№11: HS сравнивается по всем парам", async () => {
  const r = await status([{ type: "invoice", text: "HS code: 123456" }, { type: "packing", text: "HS code: 12345678" }, { type: "cmr", text: "HS code: 12345699" }], "hs_match");
  assert.equal(r.status, "fail");
});

test("№37: поле фото, отброшенное при загрузке, не превращается в pass при проверке", async () => {
  resetLimits();
  const fetchImpl = async () => reply({ transcription: "CMR\nGross weight: 120 kg", fields: { gross_weight: { value: "100 kg", quote: "Gross weight: 100 kg", page: 1, confidence: 1 } }, items: [] });
  const up = await readUpload({ buf: PNG, type: "cmr" }, { env: AI, fetchImpl });
  assert.equal(up.dropped[0].key, "gross_weight");
  const docs = [
    { type: "invoice", text: "INVOICE\nGross weight: 100 kg" }, { type: "packing", text: "PACKING LIST\nGross weight: 100 kg" },
    { type: "cmr", text: up.text, origin: "photo", extraction: up.extraction },
  ];
  const r = await checkPack(docs, { env: {} });
  const gw = r.checks.find((c) => c.id === "gross_weight");
  assert.notEqual(gw.status, "pass");
  assert.ok(r.dropped.some((d) => d.doc === "cmr" && d.key === "gross_weight"));
});

test("№12: невозможные даты не нормализуются, сверка дат — на ручную проверку", async () => {
  assert.equal(parseDate("2026-02-31"), null);
  assert.equal(parseDate("2026-13-01"), null);
  assert.equal(parseDate("31.02.2026"), null);
  assert.equal(parseDate("2026-02-28").toISOString().slice(0, 10), "2026-02-28");
  const r = await status([{ type: "invoice", text: "Date: 2026-02-31" }, { type: "cmr", text: "Date of shipment: 2026-03-02" }], "date_order");
  assert.equal(r.status, "skip");
  assert.equal(r.reason, "date_invalid");
});

test("№13: верный JSON неверной формы — bad_response", async () => {
  resetJsonFallback();
  const cfg = { provider: "meta", base: "https://x", key: "k", model: "m" };
  const msgs = [{ role: "system", content: "s" }, { role: "user", content: "u" }];
  for (const bad of [{ wrong: "schema" }, { fields: [], items: [] }, { fields: { gross_weight: { value: 5, page: 1, quote: "q", confidence: 1 } }, items: [] }, { fields: {}, items: [{ n: "1", page: 1, quote: "q" }] }, { fields: { gross_weight: { value: "5", page: 0, quote: "q", confidence: 1 } }, items: [] }]) {
    await assert.rejects(callModel(cfg, msgs, EXTRACTION_SCHEMA, async () => reply(bad), { quiet: true, maxLimiterWaitMs: 1 }), (e) => e.kind === "bad_response", JSON.stringify(bad));
  }
});

test("№29: противоречивые повторы одного поля — конфликт, а не первый попавшийся", async () => {
  const r = await status([{ type: "invoice", text: "Gross weight: 100 kg\nGross weight: 999 kg" }, { type: "packing", text: "Gross weight: 100 kg" }], "gross_weight");
  assert.notEqual(r.status, "pass");
  assert.equal(r.reason, "field_conflict");
  // одинаковый повтор конфликтом не считается
  assert.equal((await status([{ type: "invoice", text: "Gross weight: 100 kg\nGross weight: 100 kg" }, { type: "packing", text: "Gross weight: 100 kg" }], "gross_weight")).status, "pass");
});

test("№30: номер документа и версия не снимают неоднозначность десятичного знака", async () => {
  assert.equal(numberContext("Gross weight: 32.500 kg\nInvoice No: INV-1.20").decimal, null);
  assert.equal(numberContext("Version: 1.20\nGross weight: 32.500 kg").decimal, null);
  assert.equal(numberContext("Email: v1.20@example.test\nHS code: 1101.00").decimal, null);
  const r = await status([{ type: "invoice", text: "Gross weight: 32.500 kg\nInvoice No: INV-1.20" }, { type: "packing", text: "Gross weight: 32.5 kg" }], "gross_weight");
  assert.equal(r.status, "skip");
  assert.equal(r.reason, "number_format_ambiguous");
});
