// Демо-комплект: настоящие PDF с текстовым слоем (кириллица и латиница) и одно «фото» документа PNG.
// Документы СИНТЕТИЧЕСКИЕ: данные из lib/generate.js, компании и адреса вымышленные.
// Использует devDependencies (pdf-lib, @pdf-lib/fontkit) и шрифт Noto Sans (OFL) из assets/fonts.
// Рабочий сервис этот файл не загружает.
import { readFile } from "node:fs/promises";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { baseData, INJECTORS } from "../../lib/generate.js";
import { renderTextPng } from "../../lib/text-image.js";

export const DEMO_SEED = 23;
// две ошибки из каталога, у разных сторон: перевозчик (CMR) и склад (упаковочный лист)
export const DEMO_ERRORS = ["gross_weight_mismatch", "qty_mismatch"];

const GOODS_RU = {
  "Wheat flour premium grade": "Мука пшеничная высшего сорта",
  "Wheat flour first grade": "Мука пшеничная первого сорта",
  "Wheat bran in bags": "Отруби пшеничные в мешках",
  "Sunflower oil in cans": "Масло подсолнечное в банках",
};
const money = (x) => Number(x).toFixed(2);
const NOTE = "Синтетический документ для демонстрации. Компании и адреса вымышленные.";

function data(errors) {
  const d = baseData(DEMO_SEED);
  for (const e of errors) INJECTORS[e].apply(d);
  return d;
}

// Метки в формате «Метка: значение», русские и английские: их понимает и шаблонный разбор (MOCK), и модель.
function invoiceLines(d) {
  const v = d.inv;
  return [
    "ИНВОЙС / INVOICE",
    d.sellerPair[1],
    "Республика Казахстан, г. Алматы, промзона 7",
    `Номер инвойса: ${d.number}`,
    `Дата: ${v.date}`,
    `Продавец: ${v.seller}, Almaty, Kazakhstan`,
    `Покупатель: ${v.buyer}, Tashkent, Uzbekistan`,
    "Валюта: USD",
    `Код ТН ВЭД: ${v.hs}`,
    "Инкотермс: DAP Ташкент",
    "Товары / Goods:",
    ...v.items.map((i) => `${i.n} | ${GOODS_RU[i.desc] ?? i.desc} | ${i.qty} | мешков | ${money(i.price)} | ${money(i.total)}`),
    `Итого: ${money(v.total)}`,
    `Вес брутто: ${v.gross} kg`,
    `Вес нетто: ${v.net} kg`,
    `Количество мест: ${v.packages}`,
  ];
}

function packingLines(d) {
  const v = d.pl;
  return [
    "УПАКОВОЧНЫЙ ЛИСТ / PACKING LIST",
    `Ссылка на инвойс: ${v.reference}`,
    `Дата: ${v.date}`,
    `Грузоотправитель: ${v.seller}`,
    `Грузополучатель: ${v.buyer}`,
    "Товары / Goods:",
    ...v.items.map((i) => `${i.n} | ${GOODS_RU[i.desc] ?? i.desc} | ${i.qty} | мешков`),
    `Вес брутто: ${v.gross} kg`,
    `Вес нетто: ${v.net} kg`,
    `Количество мест: ${v.packages}`,
  ];
}

function cmrLines(d) {
  const v = d.cmr;
  return [
    "CMR / МЕЖДУНАРОДНАЯ ТОВАРНО-ТРАНСПОРТНАЯ НАКЛАДНАЯ",
    `Ссылка на инвойс: ${v.reference}`,
    `Дата отгрузки: ${d.ship}`,
    `Отправитель: ${v.seller}`,
    `Получатель: ${v.buyer}`,
    "Место разгрузки: Ташкент",
    `Код ТН ВЭД: ${v.hs}`,
    `Вес брутто: ${v.gross} kg`,
    `Количество мест: ${v.packages}`,
    "Перевозчик: ТОО «Жибек Жолы Транс»",
  ];
}

async function makePdf(lines, title, fonts) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const regular = await pdf.embedFont(fonts.regular, { subset: true });
  const bold = await pdf.embedFont(fonts.bold, { subset: true });
  // одинаковые метаданные: файлы воспроизводимы и не выдают ничего о машине, где созданы
  const fixed = new Date(Date.UTC(2026, 9, 1));
  pdf.setTitle(title); pdf.setProducer("TradeDoc AI demo"); pdf.setCreator("scripts/make-demo-files.mjs");
  pdf.setCreationDate(fixed); pdf.setModificationDate(fixed);
  const page = pdf.addPage([595.28, 841.89]);
  let y = 790;
  lines.forEach((line, i) => {
    const font = i === 0 ? bold : regular, size = i === 0 ? 13 : 10.5;
    page.drawText(line, { x: 56, y, size, font, color: rgb(0.08, 0.08, 0.1) });
    y -= i === 0 ? 24 : 16;
  });
  page.drawText(NOTE, { x: 56, y: 48, size: 8, font: regular, color: rgb(0.4, 0.4, 0.45) });
  return Buffer.from(await pdf.save({ useObjectStreams: false }));
}

/** Все файлы демо в памяти: [{ name, docType, kind, bytes, lines }]. */
export async function buildDemoPack({ fontsDir = new URL("../../assets/fonts/", import.meta.url) } = {}) {
  const fonts = {
    regular: await readFile(new URL("NotoSans-Regular.ttf", fontsDir)),
    bold: await readFile(new URL("NotoSans-Bold.ttf", fontsDir)),
  };
  const d = data(DEMO_ERRORS);
  const fixedD = data(DEMO_ERRORS.filter((e) => e !== "gross_weight_mismatch")); // CMR после исправления перевозчиком
  const docs = [
    { name: "01-invoice.pdf", docType: "invoice", lines: invoiceLines(d), title: "Invoice (synthetic demo)" },
    { name: "02-packing-list.pdf", docType: "packing", lines: packingLines(d), title: "Packing list (synthetic demo)" },
    { name: "03-cmr.pdf", docType: "cmr", lines: cmrLines(d), title: "CMR (synthetic demo)" },
    { name: "04-cmr-corrected.pdf", docType: "cmr", lines: cmrLines(fixedD), title: "CMR corrected (synthetic demo)" },
  ];
  const files = [];
  for (const doc of docs) files.push({ ...doc, kind: "pdf", bytes: await makePdf(doc.lines, doc.title, fonts) });
  // «фото» упаковочного листа: тот же документ, растровый шрифт, лёгкий шум; кириллица дорисована в шрифт
  const img = renderTextPng([...packingLines(d), "", NOTE], { scale: 3, noise: 0.25, seed: DEMO_SEED });
  files.push({ name: "05-packing-list-photo.png", docType: "packing", kind: "image", bytes: img.png, lines: img.text.split("\n") });
  return { seed: DEMO_SEED, errors: DEMO_ERRORS, files };
}
