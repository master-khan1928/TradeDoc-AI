// Этап 1: загрузка файлов, PDF, фото, определение типа. Все документы синтетические.
import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../scripts/server.mjs";
import { readUpload } from "../lib/upload.js";
import { detectType } from "../lib/doctype.js";
import { sniffFormat, MAX_FILE_BYTES } from "../lib/files.js";
import { IMAGE_EXTRACTION_SCHEMA } from "../lib/extract/meta.js";
import { checkPack } from "../lib/pipeline.js";
import { samples, makeSet } from "../lib/generate.js";
import { minipdf } from "./helpers/minipdf.js";

const META = { META_API_KEY: "k", META_MODEL: "m" };
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex"); // хватает сигнатуры: модель подделана
const four = samples().find((s) => s.id === "four").docs;
const byType = Object.fromEntries(four.map((d) => [d.type, d.text]));

async function withServer(fn) {
  const app = createApp();
  await new Promise((r) => app.listen(0, "127.0.0.1", r));
  try { await fn(`http://127.0.0.1:${app.address().port}`); } finally { await new Promise((r) => app.close(r)); }
}
const read = (base, body, type) => fetch(base + "/api/read" + (type ? `?type=${type}` : ""), { method: "POST", body });

test("формат определяется по сигнатуре, а не по имени", () => {
  assert.equal(sniffFormat(minipdf([["x"]])).kind, "pdf");
  assert.equal(sniffFormat(PNG).mime, "image/png");
  assert.equal(sniffFormat(Buffer.from([0xff, 0xd8, 0xff, 0xe0])).mime, "image/jpeg");
  assert.equal(sniffFormat(Buffer.from("Invoice No: 1\nDate: 2026-10-01")).kind, "text");
  assert.equal(sniffFormat(Buffer.from("PK\x03\x04junk")), null, "zip/docx не текст");
});

test("тип документа по содержимому; неоднозначный текст не угадываем", () => {
  for (const d of [...four, ...makeSet(5, []).docs]) assert.equal(detectType(d.text).type, d.type, d.type);
  assert.equal(detectType("Hello\nTotal: 5").type, null);
  assert.equal(detectType("УПАКОВОЧНЫЙ ЛИСТ\nВес нетто: 5 кг").type, "packing");
  assert.equal(detectType("Международная товарно-транспортная накладная CMR\nМесто разгрузки: Ташкент").type, "cmr");
});

test("MOCK: PDF с текстовым слоем проходит всю цепочку без ИИ", async () => {
  await withServer(async (base) => {
    const docs = [];
    for (const type of ["invoice", "packing", "cmr"]) {
      // кириллицу встроенный шрифт Helvetica не умеет: для теста латиница, по 2 страницы у инвойса
      const lines = byType[type].replace(/[^\x20-\x7e\n]/g, "?").split("\n");
      const pages = type === "invoice" ? [lines.slice(0, 8), lines.slice(8)] : [lines];
      const res = await read(base, minipdf(pages)); // тип не указан: определяется по содержимому
      assert.equal(res.status, 200);
      const r = await res.json();
      assert.equal(r.kind, "pdf");
      assert.equal(r.type, type);
      assert.equal(r.typeSource, "detected");
      if (type === "invoice") assert.equal(r.pages, 2);
      docs.push({ type: r.type, text: r.text, origin: r.origin });
    }
    const chk = await (await fetch(base + "/api/check", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ docs }) })).json();
    assert.equal(chk.mode, "mock");
    assert.equal(chk.origins.invoice, "pdf");
    const ids = chk.findings.map((f) => f.id);
    for (const id of ["gross_weight", "line_totals", "date_order"]) assert.ok(ids.includes(id), id);
    const total = chk.findings.find((f) => f.id === "line_totals").evidence[0];
    assert.equal(total.page, 2, "цитата со второй страницы PDF");
  });
});

test("MOCK: фото честно сообщает, что нужен режим ИИ", async () => {
  await withServer(async (base) => {
    const res = await read(base, PNG, "invoice");
    assert.equal(res.status, 422);
    assert.equal((await res.json()).code, "photo_needs_ai");
  });
});

test("слишком большой файл: 413; неподдерживаемый формат: понятная ошибка", async () => {
  await withServer(async (base) => {
    const big = await read(base, Buffer.alloc(MAX_FILE_BYTES + 1, 0x41));
    assert.equal(big.status, 413);
    assert.equal((await big.json()).code, "file_too_large");
    const zip = await read(base, Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]));
    assert.equal(zip.status, 415);
    const body = await zip.json();
    assert.equal(body.code, "unsupported_format");
    assert.match(body.error, /PDF, JPG, PNG/);
    const scan = await read(base, minipdf([]));
    assert.equal(scan.status, 422);
    assert.equal((await scan.json()).code, "pdf_no_text");
    assert.equal((await read(base, Buffer.from("%PDF-1.4 broken"))).status, 422);
  });
});

test("META фото: data URI в формате OpenAI, схема требует transcription, выдуманная цитата отбрасывается", async () => {
  const transcription = byType.invoice;
  const numberLine = transcription.split("\n").find((l) => l.startsWith("Invoice No:"));
  let seen;
  const fetchImpl = async (url, init) => {
    seen = JSON.parse(init.body);
    const content = JSON.stringify({
      transcription,
      fields: {
        number: { value: numberLine.slice(12), page: 1, quote: numberLine, confidence: 0.9 },
        total: { value: "99999.00", page: 1, quote: "Total: 99999.00", confidence: 0.99 }, // этой строки на фото нет
        gross_weight: { value: "1", page: 2, quote: numberLine, confidence: 0.9 }, // у фото одна страница
      },
      items: [{ n: 1, desc: "x", qty: "1", unit: "bags", price: "1", total: "1", page: 1, quote: "1 | invented line" }],
    });
    return { ok: true, json: async () => ({ choices: [{ message: { content } }] }) };
  };
  const r = await readUpload({ buf: PNG }, { env: META, fetchImpl });
  const img = seen.messages[1].content.find((c) => c.type === "image_url");
  assert.match(img.image_url.url, /^data:image\/png;base64,/);
  assert.equal(seen.response_format.json_schema.name, IMAGE_EXTRACTION_SCHEMA.name);
  assert.ok(IMAGE_EXTRACTION_SCHEMA.schema.required.includes("transcription"));
  assert.equal(r.kind, "photo");
  assert.equal(r.type, "invoice", "тип определён по расшифровке");
  assert.ok(r.extraction.fields.number);
  assert.ok(!r.extraction.fields.total, "цитаты нет в расшифровке");
  assert.ok(!r.extraction.fields.gross_weight, "страница не та");
  assert.equal(r.extraction.items.length, 0);
  assert.equal(r.dropped.length, 3);

  // разбор фото возвращается от браузера: сервер проверяет цитаты заново и помечает происхождение
  const forged = { ...r.extraction, fields: { ...r.extraction.fields, total: { value: "1", page: 1, quote: "Total: 1.00" } } };
  const chk = await checkPack([{ type: "invoice", text: r.text, origin: "photo", extraction: forged }], { env: {} });
  assert.ok(chk.dropped.some((d) => d.key === "total"), "подделанная цитата отброшена и при проверке");
  assert.equal(chk.origins.invoice, "photo");
});

test("META недоступен при чтении фото: понятная ошибка, без падения", async () => {
  const fetchImpl = async () => ({ ok: false, status: 503, json: async () => ({}) });
  await assert.rejects(readUpload({ buf: PNG }, { env: META, fetchImpl }), (e) => e.code === "ai_unavailable" && e.status === 502);
});
