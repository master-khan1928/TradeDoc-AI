// Признаки реальных персональных данных в тексте документа и их маскирование перед отправкой в модель.
// Это эвристика, а не гарантия: она ловит типичные форматы и пропускает заведомо вымышленные значения
// (нули, example.com). Для сверки эти данные не нужны: вес, количество, суммы и названия компаний не трогаются.

const MASK = { iin: "[скрыто: ИИН/БИН]", email: "[скрыто: e-mail]", phone: "[скрыто: телефон]", iban: "[скрыто: IBAN]", passport: "[скрыто: паспорт]", person: "[скрыто: ФИО]" };

/** Контрольная цифра ИИН/БИН Казахстана (12 цифр). Все одинаковые цифры считаем заглушкой. */
export function validIin(s) {
  if (!/^\d{12}$/.test(s) || /^(\d)\1{11}$/.test(s)) return false;
  const d = [...s].map(Number);
  const sum = (w) => w.reduce((a, x, i) => a + x * d[i], 0) % 11;
  let c = sum([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  if (c === 10) c = sum([3, 4, 5, 6, 7, 8, 9, 10, 11, 1, 2]);
  return c !== 10 && c === d[11];
}

/** IBAN Казахстана: KZ + 2 контрольные цифры + 16 знаков, проверка mod 97. */
export function validKzIban(s) {
  const v = s.replace(/\s/g, "").toUpperCase();
  if (!/^KZ\d{2}[A-Z0-9]{16}$/.test(v)) return false;
  const r = (v.slice(4) + v.slice(0, 4)).replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let m = 0;
  for (const ch of r) m = (m * 10 + Number(ch)) % 97;
  return m === 1;
}

const FAKE_EMAIL = /@(example\.(com|org|net)|[\w.-]+\.(test|invalid|example|localhost))$/i;
const RE = {
  iin: /(?<!\d)\d{12}(?!\d)/g,
  email: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  // телефон: с «+» и кодом страны, 10-15 цифр
  phone: /\+\d[\d\s().-]{8,18}\d/g,
  iban: /\bKZ\d{2}(?:\s?[A-Z0-9]){16}\b/gi,
  passport: /(паспорт|passport|удостоверени[ея] личности|ID card)[^:\n]{0,20}[:№#]?\s*([A-ZА-Я]{0,2}\s?\d{6,10})/giu,
  person: /^(\s*(?:водитель|driver|ф\.?и\.?о\.?|full name|представитель|representative)\s*[:\-])\s*(.+)$/gimu,
};
const digits = (s) => s.replace(/\D/g, "");
const fakePhone = (s) => /0{6,}/.test(digits(s)); // +7 700 000 0000 в синтетике

/** Какие виды реальных данных найдены (без самих значений). */
export function findRealDataMarkers(text) {
  const t = String(text ?? "");
  const kinds = new Set();
  for (const m of t.matchAll(RE.iin)) if (validIin(m[0])) kinds.add("iin");
  for (const m of t.matchAll(RE.email)) if (!FAKE_EMAIL.test(m[0])) kinds.add("email");
  for (const m of t.matchAll(RE.phone)) { const n = digits(m[0]).length; if (n >= 10 && n <= 15 && !fakePhone(m[0])) kinds.add("phone"); }
  for (const m of t.matchAll(RE.iban)) if (validKzIban(m[0])) kinds.add("iban");
  for (const m of t.matchAll(RE.passport)) if (!/^0+$/.test(digits(m[2]))) kinds.add("passport");
  return [...kinds];
}

/**
 * Маскирование перед отправкой в модель. Возвращает { text, masked: { вид: сколько } }.
 * Маскируются ИИН/БИН, e-mail, телефоны, IBAN, номера паспортов и ФИО в строках «Водитель:», «Представитель:».
 */
export function maskPersonalData(text) {
  const masked = {};
  const hit = (k) => { masked[k] = (masked[k] ?? 0) + 1; return MASK[k]; };
  let t = String(text ?? "");
  t = t.replace(RE.person, (_, label) => `${label} ${hit("person")}`);
  t = t.replace(RE.passport, (all, label, num) => all.replace(num, hit("passport")));
  t = t.replace(RE.iban, (m) => (validKzIban(m) ? hit("iban") : m));
  t = t.replace(RE.email, (m) => (FAKE_EMAIL.test(m) ? m : hit("email")));
  t = t.replace(RE.phone, (m) => { const n = digits(m).length; return n >= 10 && n <= 15 && !fakePhone(m) ? hit("phone") : m; });
  t = t.replace(RE.iin, (m) => (validIin(m) ? hit("iin") : m));
  return { text: t, masked };
}
