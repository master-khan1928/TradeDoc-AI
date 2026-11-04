// Этап 5: демо-файлы. Нужны devDependencies (pdf-lib, @pdf-lib/fontkit) и шрифт из assets/fonts.
// Проверяем то, что увидит зритель: кириллица из PDF читается без искажений, тип документа определяется,
// заложенные ошибки находятся, исправленный CMR снимает ошибку веса. Всё в памяти, файлы не пишутся.
import test from "node:test";
import assert from "node:assert/strict";
import { readPdfText, sniffFormat, MAX_FILE_BYTES } from "../lib/files.js";
import { detectType } from "../lib/doctype.js";
import { readUpload } from "../lib/upload.js";
import { checkPack } from "../lib/pipeline.js";
import { expectedChecks } from "../lib/generate.js";

// без dev-зависимостей (npm install --omit=dev) демо-тесты честно пропускаются, а не роняют npm test
let demo = null;
try { demo = await import("../scripts/lib/demo-pack.mjs"); } catch {}
if (!demo) test("демо-файлы: пропущено, нет dev-зависимостей pdf-lib и @pdf-lib/fontkit (npm install без --omit=dev)", { skip: true }, () => {});
const { buildDemoPack, DEMO_ERRORS } = demo ?? {};
const pack = demo ? await buildDemoPack() : { files: [] };
const run = demo ? test : test.skip;
const byName = Object.fromEntries(pack.files.map((f) => [f.name, f]));
const pdfs = pack.files.filter((f) => f.kind === "pdf");
const NOTE = "Синтетический документ для демонстрации. Компании и адреса вымышленные.";

run("unpdf читает из демо-PDF кириллицу и латиницу без искажений", async () => {
  assert.equal(pdfs.length, 4);
  for (const f of pdfs) {
    const pages = await readPdfText(f.bytes);
    assert.equal(pages.length, 1, f.name);
    assert.deepEqual(pages[0].split("\n").map((l) => l.trim()), [...f.lines, NOTE], f.name);
  }
  const inv = (await readPdfText(byName["01-invoice.pdf"].bytes))[0];
  for (const s of ["ИНВОЙС", "ТОО «Алтын Бидай»", "Мука пшеничная высшего сорта", "Код ТН ВЭД", "Altyn Bidai LLP"]) assert.ok(inv.includes(s), s);
});

run("тип каждого документа определяется по содержимому", async () => {
  for (const f of pdfs) assert.equal(detectType((await readPdfText(f.bytes))[0]).type, f.docType, f.name);
  const photo = byName["05-packing-list-photo.png"];
  assert.equal(detectType(photo.lines.join("\n")).type, "packing", "и по тексту, нарисованному на картинке");
});

run("изображение: настоящий PNG, русские буквы дорисованы (ни одного «?»), меньше лимита загрузки", () => {
  const photo = byName["05-packing-list-photo.png"];
  assert.equal(sniffFormat(photo.bytes).mime, "image/png");
  assert.ok(!photo.lines.join("").includes("?"));
  assert.ok(photo.lines.some((l) => l.includes("ГРУЗООТПРАВИТЕЛЬ: ТОО «АЛТЫН БИДАЙ»")));
  for (const f of pack.files) assert.ok(f.bytes.length < MAX_FILE_BYTES, f.name);
});

run("путь демо в MOCK: загрузка PDF без указания типа, проверка находит ровно заложенные ошибки", async () => {
  const read = async (name) => readUpload({ buf: byName[name].bytes }, { env: {} });
  const docs = [];
  for (const n of ["01-invoice.pdf", "02-packing-list.pdf", "03-cmr.pdf"]) {
    const r = await read(n);
    assert.equal(r.typeSource, "detected");
    docs.push({ type: r.type, text: r.text, origin: r.origin });
  }
  const r1 = await checkPack(docs, { env: {} });
  const want = expectedChecks(DEMO_ERRORS);
  assert.deepEqual(r1.findings.map((f) => f.id).sort(), [...want].sort());
  assert.equal(r1.dropped.length, 0);

  const fixed = await read("04-cmr-corrected.pdf");
  const r2 = await checkPack(docs.map((d) => (d.type === "cmr" ? { type: "cmr", text: fixed.text, origin: "pdf" } : d)), { env: {} });
  assert.deepEqual(r2.findings.map((f) => f.id), ["item_qty"], "вес брутто исправлен, количество в упаковочном листе осталось");

  await assert.rejects(read("05-packing-list-photo.png"), (e) => e.code === "photo_needs_ai");
});

run("сборка воспроизводима: те же входные данные дают те же байты", async () => {
  const again = await buildDemoPack();
  for (const [i, f] of pack.files.entries()) assert.ok(f.bytes.equals(again.files[i].bytes), f.name);
});
