// Определение типа документа по содержимому. Чистый код: считаем совпадения заголовков и меток.
// Заголовок весит много, отдельные слова мало: в CMR и упаковочном листе тоже встречается слово «invoice».
// Флаг u и \p{L}: без них \w в JS не видит кириллицу.

const SIGNS = {
  invoice: {
    strong: [/\b(commercial\s+)?invoice\b(?!\s*(no|number|ref|reference)\b)/iu, /инвойс(?!\s*(№|no|номер))/iu, /сч[её]т[-\s]?фактур/iu, /\bproforma\b/iu],
    weak: [/unit\s+price/iu, /цена\s+за\s+ед/iu, /\btotal\b/iu, /итого/iu, /incoterms|инкотермс/iu, /\bcurrency\b|валюта/iu],
  },
  packing: {
    strong: [/packing\s+list/iu, /упаковочн\p{L}*\s+лист/iu, /спецификаци\p{L}*\s+упаковки/iu],
    weak: [/\bnet\s+weight\b|вес\s+нетто/iu, /\bshipper\b/iu, /\bcartons?\b|короб/iu, /места/iu],
  },
  cmr: {
    strong: [/^\s*cmr\b/imu, /\bconsignment\s+note\b/iu, /товарно-транспортн\p{L}*\s+накладн/iu],
    weak: [/place\s+of\s+delivery|место\s+(разгрузки|доставки)/iu, /\bcarrier\b|перевозчик/iu, /date\s+of\s+shipment|дата\s+отгрузки/iu, /\bvehicle\b|транспортн\p{L}*\s+средств/iu],
  },
};

/** Возвращает { type, scores } ; type = null, если однозначно определить нельзя. */
export function detectType(text) {
  const head = String(text ?? "").split("\n").slice(0, 12).join("\n"); // заголовок обычно в начале
  const all = String(text ?? "");
  const scores = {};
  for (const [type, s] of Object.entries(SIGNS)) {
    scores[type] = s.strong.reduce((a, re) => a + (re.test(head) ? 5 : re.test(all) ? 2 : 0), 0) + s.weak.reduce((a, re) => a + (re.test(all) ? 1 : 0), 0);
  }
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [best, second] = ranked;
  const type = best[1] >= 3 && best[1] - second[1] >= 2 ? best[0] : null;
  return { type, scores };
}
