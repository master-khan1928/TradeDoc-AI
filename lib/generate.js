// Генератор СИНТЕТИЧЕСКИХ комплектов документов (вымышленные компании) с известными ошибками.
// Нужен для примеров на сайте, тестов и бенчмарка. Реальные документы не используются.

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];

// пары «латиница / кириллица» одной и той же вымышленной компании
const SELLERS = [
  ["Altyn Bidai LLP", "ТОО «Алтын Бидай»"],
  ["Almaty Agro LLP", "ТОО «Алматы Агро»"],
  ["Tulpar Agro LLP", "ТОО «Тулпар Агро»"],
];
const BUYERS = [
  ['OOO "Tashkent Agro"', "Tashkent Agro MChJ"],
  ['Sharq Oziq-Ovqat OOO', 'OOO "Sharq Oziq-Ovqat"'],
  ["Fergana Don MChJ", "ООО «Фергана Дон»"],
];
const GOODS = ["Wheat flour premium grade", "Wheat flour first grade", "Wheat bran in bags", "Sunflower oil in cans"];
const HS = ["1101001500", "1101009000", "1514110000", "2302300000"];

export function baseData(seed) {
  const r = rng(seed);
  const seller = pick(r, SELLERS), buyer = pick(r, BUYERS);
  const lines = 2 + Math.floor(r() * 2);
  const items = [];
  const used = new Set();
  for (let i = 0; i < lines; i++) {
    let g; do { g = pick(r, GOODS); } while (used.has(g)); used.add(g);
    const qty = (10 + Math.floor(r() * 40)) * 10;
    const price = 8 + Math.floor(r() * 30) * 0.5;
    items.push({ n: i + 1, desc: g, qty, unit: "bags", price, total: +(qty * price).toFixed(2) });
  }
  const qtySum = items.reduce((a, b) => a + b.qty, 0);
  const net = qtySum * 49, gross = net + qtySum;
  const day = 1 + Math.floor(r() * 14);
  const date = `2026-10-${String(day).padStart(2, "0")}`;
  const ship = `2026-10-${String(day + 1 + Math.floor(r() * 3)).padStart(2, "0")}`;
  const number = `INV-2026-${String(100 + Math.floor(r() * 800)).padStart(4, "0")}`;
  const hs = pick(r, HS);
  const total = +items.reduce((a, b) => a + b.total, 0).toFixed(2);
  const common = { seller: seller[0], buyer: buyer[0], gross, net, packages: qtySum, hs, date };
  return {
    seed, sellerPair: seller, buyerPair: buyer, number, ship,
    inv: { ...common, items: items.map((i) => ({ ...i })), total },
    // в упаковочном листе и CMR те же компании пишутся иначе: это обычная вариативность, а не ошибка
    pl: { ...common, seller: seller[1], buyer: buyer[1], reference: number, items: items.map((i) => ({ ...i })) },
    cmr: { ...common, seller: seller[0].replace(/\s*(LLP|LLC)$/i, ""), buyer: buyer[0], reference: number, date: ship },
  };
}

// --- внесение ошибок: каждый тип проверяется своей проверкой audit.js ---
function typo(name) {
  const vowels = "aeiou";
  for (let i = 4; i < name.length; i++) {
    const c = name[i].toLowerCase();
    if (vowels.includes(c)) {
      const next = vowels[(vowels.indexOf(c) + 1) % vowels.length];
      return name.slice(0, i) + next + name.slice(i + 1);
    }
  }
  return name + "x";
}
const OTHER_SELLER = "Karavan Trade LLP";
const OTHER_BUYER = "Bukhara Foods MChJ";

export const INJECTORS = {
  line_total_wrong: { check: "line_totals", apply: (d) => { d.inv.items[0].total = +(d.inv.items[0].total + 100).toFixed(2); } },
  invoice_sum_wrong: { check: "invoice_sum", apply: (d) => { d.inv.total = +(d.inv.total + 250).toFixed(2); } },
  gross_weight_mismatch: { check: "gross_weight", apply: (d) => { d.cmr.gross += 200; } },
  net_weight_mismatch: { check: "net_weight", apply: (d) => { d.pl.net -= 150; } },
  packages_mismatch: { check: "packages", apply: (d) => { d.cmr.packages += 10; } },
  qty_mismatch: { check: "item_qty", apply: (d) => { d.pl.items[0].qty += 20; } },
  buyer_different: { check: "party_buyer", apply: (d) => { d.cmr.buyer = OTHER_BUYER; } },
  buyer_typo: { check: "party_buyer", apply: (d) => { d.pl.buyer = typo(d.pl.buyer); } },
  seller_different: { check: "party_seller", apply: (d) => { d.pl.seller = OTHER_SELLER; } },
  date_order_wrong: { check: "date_order", apply: (d) => { const [y, m, dd] = d.ship.split("-").map(Number); d.inv.date = `${y}-${String(m).padStart(2, "0")}-${String(dd + 2).padStart(2, "0")}`; } },
  hs_mismatch: { check: "hs_match", apply: (d) => { d.cmr.hs = d.inv.hs === "2302300000" ? "1514110000" : "2302300000"; } },
  hs_bad_format: { check: "hs_format", apply: (d) => { d.inv.hs = "11-01"; } },
  reference_mismatch: { check: "reference", apply: (d) => { d.pl.reference = d.number.replace(/\d$/, (x) => String((+x + 1) % 10)); } },
  net_gt_gross: { check: "net_le_gross", apply: (d) => { d.inv.net = d.inv.gross + 100; } },
};
export const ERROR_TYPES = Object.keys(INJECTORS);

const money = (x) => Number(x).toFixed(2);

export function render(d) {
  const invoice = [
    "INVOICE",
    `Invoice No: ${d.number}`,
    `Date: ${d.inv.date}`,
    `Seller: ${d.inv.seller}, Almaty, Kazakhstan`,
    `Buyer: ${d.inv.buyer}, Uzbekistan`,
    "Currency: USD",
    `HS Code: ${d.inv.hs}`,
    "Incoterms: DAP Tashkent",
    "Items:",
    ...d.inv.items.map((i) => `${i.n} | ${i.desc} | ${i.qty} | ${i.unit} | ${money(i.price)} | ${money(i.total)}`),
    `Total: ${money(d.inv.total)}`,
    `Gross weight: ${d.inv.gross} kg`,
    `Net weight: ${d.inv.net} kg`,
    `Packages: ${d.inv.packages}`,
  ].join("\n");
  const packing = [
    "PACKING LIST",
    `Reference: ${d.pl.reference}`,
    `Date: ${d.pl.date}`,
    `Shipper: ${d.pl.seller}`,
    `Consignee: ${d.pl.buyer}`,
    "Items:",
    ...d.pl.items.map((i) => `${i.n} | ${i.desc} | ${i.qty} | ${i.unit}`),
    `Gross weight: ${d.pl.gross} kg`,
    `Net weight: ${d.pl.net} kg`,
    `Packages: ${d.pl.packages}`,
  ].join("\n");
  const cmr = [
    "CMR",
    `Invoice reference: ${d.cmr.reference}`,
    `Date of shipment: ${d.ship}`,
    `Sender: ${d.cmr.seller}`,
    `Consignee: ${d.cmr.buyer}`,
    "Place of delivery: Tashkent",
    `HS Code: ${d.cmr.hs}`,
    `Gross weight: ${d.cmr.gross} kg`,
    `Packages: ${d.cmr.packages}`,
  ].join("\n");
  return [{ type: "invoice", text: invoice }, { type: "packing", text: packing }, { type: "cmr", text: cmr }];
}

export function makeSet(seed, errors = []) {
  const d = baseData(seed);
  for (const e of errors) INJECTORS[e].apply(d);
  return { seed, errors, docs: render(d) };
}

export function samples() {
  return [
    { id: "clean", label: { ru: "Чистый комплект", en: "Clean pack" }, ...makeSet(11, []) },
    { id: "four", label: { ru: "Комплект с 4 ошибками", en: "Pack with 4 errors" }, ...makeSet(23, ["gross_weight_mismatch", "buyer_typo", "line_total_wrong", "date_order_wrong"]) },
    { id: "five", label: { ru: "Комплект с 5 ошибками", en: "Pack with 5 errors" }, ...makeSet(37, ["seller_different", "qty_mismatch", "hs_mismatch", "reference_mismatch", "packages_mismatch"]) },
  ];
}
