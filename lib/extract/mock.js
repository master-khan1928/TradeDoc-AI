// MOCK-экстрактор. Это НЕ ИИ: простой разбор строк «Метка: значение» по шаблону.
// Он нужен, чтобы вся цепочка работала и тестировалась без ключа Meta.
// Настоящее чтение PDF и фото будет делать Muse Spark (lib/extract/meta.js).

const LABELS = {
  number: ["invoice no", "invoice number", "номер счёта", "номер инвойса"],
  reference: ["reference", "invoice reference", "invoice ref", "ссылка на инвойс"],
  date: ["date", "invoice date", "дата"],
  shipment_date: ["date of shipment", "shipment date", "дата отгрузки"],
  seller: ["seller", "shipper", "sender", "exporter", "продавец", "отправитель", "грузоотправитель"],
  buyer: ["buyer", "consignee", "importer", "покупатель", "получатель", "грузополучатель"],
  currency: ["currency", "валюта"],
  hs_code: ["hs code", "hs", "код тн вэд", "тн вэд"],
  incoterms: ["incoterms", "инкотермс"],
  total: ["total", "итого", "total amount"],
  gross_weight: ["gross weight", "вес брутто"],
  net_weight: ["net weight", "вес нетто"],
  packages: ["packages", "number of packages", "количество мест", "места"],
};
const LOOKUP = new Map();
for (const [key, names] of Object.entries(LABELS)) for (const n of names) LOOKUP.set(n, key);

const sameValue = (a, b) => a.replace(/\s+/g, " ").toLowerCase() === b.replace(/\s+/g, " ").toLowerCase();

export function splitPages(text) {
  return String(text ?? "").split(/\f|^-{3,}\s*page\s*-{3,}$/gim).map((p) => p.replace(/\r/g, ""));
}

export function mockExtract(doc) {
  const pages = splitPages(doc.text);
  const fields = {};
  const items = [];
  const conflicts = [];
  pages.forEach((page, pi) => {
    for (const line of page.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const item = trimmed.match(/^(\d+)\s*\|(.+)$/);
      if (item) {
        const c = item[2].split("|").map((x) => x.trim());
        // счёт: описание | кол-во | ед. | цена | сумма ; упаковочный: описание | кол-во | ед.
        items.push({
          n: Number(item[1]), desc: c[0] ?? "", qty: c[1] ?? null, unit: c[2] ?? null,
          price: c[3] ?? null, total: c[4] ?? null, page: pi + 1, quote: trimmed,
        });
        continue;
      }
      const m = trimmed.match(/^([^:|]{2,40}):\s*(.+)$/u);
      if (!m) continue;
      const key = LOOKUP.get(m[1].trim().toLowerCase());
      if (!key) continue;
      const value = m[2].trim();
      if (!fields[key]) fields[key] = { value, page: pi + 1, quote: trimmed, confidence: 1 };
      // то же поле ещё раз с другим значением: не выбираем первое, а отмечаем конфликт (verify.js отбросит поле)
      else if (!sameValue(fields[key].value, value) && !conflicts.includes(key)) conflicts.push(key);
    }
  });
  return { type: doc.type, fields, items, mode: "mock", ...(conflicts.length ? { conflicts } : {}) };
}
