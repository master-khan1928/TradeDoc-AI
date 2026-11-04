// «Грязный» генератор СИНТЕТИЧЕСКИХ комплектов: те же данные и те же внесённые ошибки, что в generate.js,
// но документы выглядят как настоящие и разные: 3 шаблона (английский, русский, двуязычный),
// разные форматы чисел (1,234.50 / 1.234,50 / 1 234,50) и дат, шапка с адресами, лишние строки,
// ошибки пробелов в метках. Каждый документ комплекта получает свой шаблон: инвойс, упаковочный лист
// и CMR обычно оформляют разные люди. Компании и адреса вымышленные.
//
// Шум трогает только метки и пробелы вокруг двоеточия, значения не меняет: «правда» для бенчмарка
// остаётся в данных, а не в тексте.
import { baseData, INJECTORS, rng } from "./generate.js";

export const TEMPLATES = ["en", "ru", "bi"];
export const NUMBER_STYLES = ["en", "eu", "ru", "plain"];
export const DATE_STYLES = ["iso", "dot", "slash"];

const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const chance = (r, p) => r() < p;

/** 1234.5 -> "1,234.50" (en) | "1.234,50" (eu) | "1 234,50" (ru) | "1234.50" (plain) */
export function formatNumber(x, style, decimals = 2) {
  const [int, frac] = Math.abs(x).toFixed(decimals).split(".");
  const group = (sep) => int.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
  const sign = x < 0 ? "-" : "";
  const tail = (sep) => (frac ? sep + frac : "");
  if (style === "en") return sign + group(",") + tail(".");
  if (style === "eu") return sign + group(".") + tail(",");
  if (style === "ru") return sign + group(" ") + tail(",");
  return sign + int + tail(".");
}

/** "2026-10-07" -> "2026-10-07" | "07.10.2026" | "07/10/2026" */
export function formatDate(iso, style) {
  const [y, m, d] = iso.split("-");
  if (style === "dot") return `${d}.${m}.${y}`;
  if (style === "slash") return `${d}/${m}/${y}`;
  return iso;
}

const GOODS_RU = {
  "Wheat flour premium grade": "Мука пшеничная высшего сорта",
  "Wheat flour first grade": "Мука пшеничная первого сорта",
  "Wheat bran in bags": "Отруби пшеничные в мешках",
  "Sunflower oil in cans": "Масло подсолнечное в банках",
};
const UNIT_RU = { bags: "меш." };
// вымышленные адреса и реквизиты (нули вместо номеров)
const ADDR = {
  seller: { en: "Industrial zone 7, Almaty, Republic of Kazakhstan", ru: "Республика Казахстан, г. Алматы, промзона 7" },
  buyer: { en: "Warehouse 3, Sergeli district, Tashkent, Uzbekistan", ru: "Узбекистан, г. Ташкент, Сергелийский р-н, склад 3" },
};
const hsVariant = (r, hs) => pick(r, [hs, `${hs.slice(0, 4)} ${hs.slice(4, 6)} ${hs.slice(6, 9)} ${hs.slice(9)}`.trim(), `${hs.slice(0, 4)}.${hs.slice(4, 6)}.${hs.slice(6)}`]);

function docStyle(r) {
  const tpl = pick(r, TEMPLATES);
  return { tpl, num: pick(r, NUMBER_STYLES), date: pick(r, tpl === "en" ? DATE_STYLES : ["iso", "dot"]), wdec: pick(r, [0, 0, 2, 3]) };
}

function fmt(st, r) {
  const n = (x, dec = 2) => formatNumber(x, st.num, dec);
  return { n, w: (x) => n(x, st.wdec), date: (iso) => formatDate(iso, st.date), hs: (code) => hsVariant(r, code) };
}

function invoice(d, st, r) {
  const { n, w, date, hs } = fmt(st, r);
  const v = d.inv;
  if (st.tpl === "en") return [
    v.seller, ADDR.seller.en, "Tel: +7 700 000 0000 | BIN: 000000000000", "",
    pick(r, ["COMMERCIAL INVOICE", "INVOICE"]),
    `${pick(r, ["Invoice No", "Invoice No.", "Invoice #", "Invoice Number"])}: ${d.number}`,
    `Date: ${date(v.date)}`,
    `Contract No: CT-2026/14 dated ${date("2026-09-01")}`,
    `Seller: ${v.seller}, ${ADDR.seller.en}`,
    `Buyer: ${v.buyer}, ${ADDR.buyer.en}`,
    "Terms of delivery (Incoterms 2020): DAP Tashkent",
    "Currency: USD",
    `HS Code: ${hs(v.hs)}`,
    "No | Description of goods | Qty | Unit | Unit price | Amount",
    ...v.items.map((i) => `${i.n} | ${i.desc} | ${n(i.qty, 0)} | ${i.unit} | ${n(i.price)} | ${n(i.total)}`),
    `${pick(r, ["Total", "TOTAL AMOUNT", "Total amount"])}: USD ${n(v.total)}`,
    `Gross weight: ${w(v.gross)} kg`,
    `Net weight: ${w(v.net)} kg`,
    `${pick(r, ["Packages", "Number of packages"])}: ${n(v.packages, 0)} bags`,
    "Bank: First Steppe Bank (fictional), SWIFT XXXXKZKA",
    "Page 1 of 1", "Authorized signature: ____________",
  ];
  if (st.tpl === "ru") return [
    d.sellerPair[1], ADDR.seller.ru, "",
    `${pick(r, ["ИНВОЙС", "СЧЁТ-ФАКТУРА (ИНВОЙС)"])} № ${d.number} от ${date(v.date)}`,
    `Продавец: ${v.seller}`,
    `Покупатель: ${v.buyer}, ${ADDR.buyer.ru}`,
    "Условия поставки: DAP Ташкент (Инкотермс 2020)",
    "Валюта: доллар США (USD)",
    `Код ТН ВЭД: ${hs(v.hs)}`,
    ...v.items.map((i) => `${i.n}. ${GOODS_RU[i.desc] ?? i.desc} — ${n(i.qty, 0)} ${UNIT_RU[i.unit] ?? i.unit} × ${n(i.price)} = ${n(i.total)}`),
    `Итого: ${n(v.total)} USD`,
    `Вес брутто, кг: ${w(v.gross)}`,
    `Вес нетто, кг: ${w(v.net)}`,
    `Количество мест: ${n(v.packages, 0)}`,
    "Директор ____________ М.П.",
  ];
  return [
    "INVOICE / ИНВОЙС",
    `Invoice No. / Номер инвойса: ${d.number}`,
    `Date / Дата: ${date(v.date)}`,
    `Seller / Продавец: ${v.seller}, ${ADDR.seller.en}`,
    `Buyer / Покупатель: ${v.buyer}, ${ADDR.buyer.ru}`,
    "Incoterms 2020 / Инкотермс 2020: DAP Tashkent",
    "Currency / Валюта: USD",
    `HS code / Код ТН ВЭД: ${hs(v.hs)}`,
    "№\tDescription / Наименование\tQty / Кол-во\tUnit / Ед.\tPrice / Цена\tAmount / Сумма",
    ...v.items.map((i) => `${i.n}\t${i.desc} / ${GOODS_RU[i.desc] ?? ""}\t${n(i.qty, 0)}\t${i.unit}\t${n(i.price)}\t${n(i.total)}`),
    `Total / Итого: ${n(v.total)} USD`,
    `Gross weight / Вес брутто: ${w(v.gross)} kg`,
    `Net weight / Вес нетто: ${w(v.net)} kg`,
    `Packages / Количество мест: ${n(v.packages, 0)}`,
  ];
}

function packing(d, st, r) {
  const { n, w, date } = fmt(st, r);
  const v = d.pl;
  if (st.tpl === "en") return [
    v.seller, ADDR.seller.en, "",
    "PACKING LIST",
    `${pick(r, ["Reference", "Invoice reference", "Invoice ref"])}: ${v.reference}`,
    `Date: ${date(v.date)}`,
    `Shipper: ${v.seller}`,
    `Consignee: ${v.buyer}`,
    "No | Description | Qty | Unit",
    ...v.items.map((i) => `${i.n} | ${i.desc} | ${n(i.qty, 0)} | ${i.unit}`),
    `Gross weight: ${w(v.gross)} kg`,
    `Net weight: ${w(v.net)} kg`,
    `Packages: ${n(v.packages, 0)}`,
    "Marks: TD/2026",
  ];
  if (st.tpl === "ru") return [
    "УПАКОВОЧНЫЙ ЛИСТ",
    `к инвойсу № ${v.reference}`,
    `Дата: ${date(v.date)}`,
    `Грузоотправитель: ${v.seller}, ${ADDR.seller.ru}`,
    `Грузополучатель: ${v.buyer}`,
    ...v.items.map((i) => `${i.n}. ${GOODS_RU[i.desc] ?? i.desc} — ${n(i.qty, 0)} ${UNIT_RU[i.unit] ?? i.unit}`),
    `Вес брутто: ${w(v.gross)} кг`,
    `Вес нетто: ${w(v.net)} кг`,
    `Всего мест: ${n(v.packages, 0)}`,
  ];
  return [
    "PACKING LIST / УПАКОВОЧНЫЙ ЛИСТ",
    `Invoice reference / Ссылка на инвойс: ${v.reference}`,
    `Date / Дата: ${date(v.date)}`,
    `Shipper / Грузоотправитель: ${v.seller}`,
    `Consignee / Грузополучатель: ${v.buyer}`,
    ...v.items.map((i) => `${i.n}\t${i.desc}\t${n(i.qty, 0)}\t${i.unit}`),
    `Gross weight / Вес брутто: ${w(v.gross)} kg`,
    `Net weight / Вес нетто: ${w(v.net)} kg`,
    `Packages / Количество мест: ${n(v.packages, 0)}`,
  ];
}

function cmr(d, st, r) {
  const { n, w, date, hs } = fmt(st, r);
  const v = d.cmr;
  if (st.tpl === "en") return [
    "CMR INTERNATIONAL CONSIGNMENT NOTE",
    `1. Sender: ${v.seller}, ${ADDR.seller.en}`,
    `2. Consignee: ${v.buyer}, ${ADDR.buyer.en}`,
    "3. Place of delivery: Tashkent, Uzbekistan",
    `4. Date of shipment: ${date(d.ship)}`,
    `5. Documents attached: Invoice ${v.reference}, packing list`,
    `7. Number of packages: ${n(v.packages, 0)} bags`,
    `10. HS Code: ${hs(v.hs)}`,
    `11. Gross weight, kg: ${w(v.gross)}`,
    "16. Carrier: Silk Road Haulage LLP (fictional)", "Vehicle: 000 AAA 02",
  ];
  if (st.tpl === "ru") return [
    "МЕЖДУНАРОДНАЯ ТОВАРНО-ТРАНСПОРТНАЯ НАКЛАДНАЯ CMR",
    `1. Отправитель: ${v.seller}`,
    `2. Получатель: ${v.buyer}`,
    "3. Место разгрузки: г. Ташкент",
    `4. Место и дата погрузки: г. Алматы, ${date(d.ship)}`,
    `5. Прилагаемые документы: инвойс № ${v.reference}, упаковочный лист`,
    `7. Количество мест: ${n(v.packages, 0)}`,
    `10. Код ТН ВЭД: ${hs(v.hs)}`,
    `11. Вес брутто, кг: ${w(v.gross)}`,
    "16. Перевозчик: ТОО «Жибек Жолы Транс» (вымышленный)",
  ];
  return [
    "CMR",
    `Invoice reference / Ссылка на инвойс: ${v.reference}`,
    `Date of shipment / Дата отгрузки: ${date(d.ship)}`,
    `Sender / Отправитель: ${v.seller}`,
    `Consignee / Получатель: ${v.buyer}`,
    "Place of delivery / Место разгрузки: Tashkent",
    `HS Code / Код ТН ВЭД: ${hs(v.hs)}`,
    `Gross weight / Вес брутто: ${w(v.gross)} kg`,
    `Packages / Количество мест: ${n(v.packages, 0)}`,
  ];
}

const EXTRA_LINES = ["", "--------------------------------", "Page 1 of 1", "Стр. 1 из 1", "Original / Оригинал", "Thank you for your business."];

/** Ошибки оформления: только в метках и пробелах вокруг двоеточия; значения не меняются. */
export function addNoise(lines, r) {
  const out = [];
  for (const line of lines) {
    let l = line;
    const m = l.match(/^([^:|\t\d][^:|\t]{1,60}):\s?(.*)$/u);
    if (m) {
      let [, label, value] = m;
      if (chance(r, 0.15)) label = label.replace(" ", "  ");
      if (chance(r, 0.1)) label = label.toUpperCase();
      l = label + pick(r, [": ", ": ", ": ", " : ", ":", ":  "]) + value;
    }
    if (chance(r, 0.1)) l += "  ";
    out.push(l);
    if (chance(r, 0.06)) out.push(pick(r, EXTRA_LINES));
  }
  return out;
}

/** Комплект в «грязном» оформлении. Тот же seed и те же ошибки, что у makeSet, дают те же данные. */
export function makeDirtySet(seed, errors = []) {
  const d = baseData(seed);
  for (const e of errors) INJECTORS[e].apply(d);
  const r = rng(seed * 7919 + 13);
  const styles = { invoice: docStyle(r), packing: docStyle(r), cmr: docStyle(r) };
  const docs = [
    { type: "invoice", text: addNoise(invoice(d, styles.invoice, r), r).join("\n") },
    { type: "packing", text: addNoise(packing(d, styles.packing, r), r).join("\n") },
    { type: "cmr", text: addNoise(cmr(d, styles.cmr, r), r).join("\n") },
  ];
  return { seed, errors, styles, docs };
}
