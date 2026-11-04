// Разбор чисел и дат. Чистый код.
//
// Числа. Однозначные записи: 1,234.50 / 1.234,50 / 1 234,50 / 12,5 / 1.234.567 / 54 000.
// Неоднозначная запись: один разделитель (точка или запятая) и ровно три цифры после него, например
// «32.500» или «1,080»: это и 32,5, и 32 500. Такое число код не угадывает. Его можно понять только по
// контексту того же документа (numberContext), и только если контекст однозначен.

const SP = "[ \\u00a0\\u202f]"; // пробел, неразрывный и узкий неразрывный: разделители тысяч
const SPACE_GROUPED = new RegExp(`-?\\d{1,3}(?:${SP}\\d{3})+(?:[.,]\\d+)?(?![\\d.,])`);
const PLAIN = /-?\d+(?:[.,]\d+)*/;
const TOKENS = new RegExp(`${SPACE_GROUPED.source}|${PLAIN.source}`, "g");
const other = (sep) => (sep === "." ? "," : ".");
// Одна запись числа в поле: цифры, точки, запятые и пробелы между цифрами. Всё поле должно содержать ровно одну такую запись.
const RUN = new RegExp(`[-+]?\\d(?:[\\d.,]|${SP}(?=\\d))*`, "g");
const SPACE_GROUP_OK = new RegExp(`^\\d{1,3}(?:${SP}\\d{3})+(?:[.,]\\d+)?$`);
const MINUS_LIKE = /[‐-―−﹣－]/; // «−», «–» и подобные: знак неочевиден, число не угадываем
const UNSUPPORTED = Object.freeze({ value: null, ambiguous: false, unsupported: true });

/**
 * Разбор одной записи числа.
 * { s }          строка для Number(), s = null если это не число
 * { ambiguous }  знак, после которого ровно три цифры, а значение без контекста не определить
 * { evidence }   знак, который в этой записи точно десятичный (для контекста документа)
 */
function interpret(token) {
  let s = token;
  const neg = s.startsWith("-");
  if (neg) s = s.slice(1);
  if (new RegExp(SP).test(s)) {
    // «28 500,000»: тысячи уже разделены пробелом, значит точка или запятая здесь десятичная
    s = s.replace(new RegExp(SP, "g"), "");
    const sep = s.includes(",") ? "," : s.includes(".") ? "." : null;
    return { neg, s: sep ? s.replace(sep, ".") : s, evidence: sep };
  }
  const dots = (s.match(/\./g) ?? []).length, commas = (s.match(/,/g) ?? []).length;
  if (dots && commas) {
    const dec = s.lastIndexOf(".") > s.lastIndexOf(",") ? "." : ",";
    return { neg, s: s.split(other(dec)).join("").replace(dec, "."), evidence: dec };
  }
  const sep = dots ? "." : commas ? "," : null;
  if (!sep) return { neg, s };
  const parts = s.split(sep);
  if (parts.length > 2) {
    // 1.234.567: несколько одинаковых знаков бывают только разделителями тысяч (коды вроде 1101.00.1500 не число)
    return parts.slice(1).every((p) => p.length === 3) && parts[0].length <= 3 ? { neg, s: parts.join(""), evidence: other(sep) } : { neg, s: null };
  }
  const [int, frac] = parts;
  if (frac.length !== 3) return { neg, s: `${int}.${frac}`, evidence: frac.length <= 2 ? sep : null };
  // «28500,000», «0,500»: перед разделителем тысяч не бывает больше трёх цифр или ведущего нуля
  if (int.length > 3 || int.startsWith("0")) return { neg, s: `${int}.${frac}` };
  return { neg, s: null, ambiguous: sep, int, frac };
}

/**
 * Число из поля. decimal: десятичный знак из контекста документа ("." или ","), иначе null.
 * Возвращает { value, ambiguous }: неоднозначная запись без контекста даёт value = null, ambiguous = true.
 * Поле должно содержать ровно одну запись числа. Два числа («12 kg; 1 000 packages»), диапазон, дробь,
 * экспонента, необычный минус или неверная группировка дают { value: null, unsupported: true }:
 * подстрока не выбирается, человек подтверждает сам.
 */
export function readNumber(raw, decimal = null) {
  if (raw == null) return { value: null, ambiguous: false };
  const str = String(raw);
  const runs = str.match(RUN);
  if (!runs) return { value: null, ambiguous: false };
  if (runs.length !== 1 || MINUS_LIKE.test(str)) return UNSUPPORTED;
  const token = runs[0].replace(/[.,]+$/, "").replace(/^\+/, "");
  const body = token.replace(/^-/, "");
  if (new RegExp(SP).test(body) && !SPACE_GROUP_OK.test(body)) return UNSUPPORTED; // «1234 567»
  if (body.includes(".") && body.includes(",")) {
    // «1,234.50»: десятичный знак один и последний, перед ним правильные группы по три цифры
    const dec = body.lastIndexOf(".") > body.lastIndexOf(",") ? "." : ",";
    const [int, ...rest] = body.split(dec);
    if (rest.length !== 1 || !new RegExp(`^\\d{1,3}(?:\\${other(dec)}\\d{3})+$`).test(int)) return UNSUPPORTED;
  }
  const r = interpret(token);
  if (r.s === null && !r.ambiguous) return UNSUPPORTED;
  let s = r.s;
  if (r.ambiguous) {
    if (decimal !== "." && decimal !== ",") return { value: null, ambiguous: true };
    s = decimal === r.ambiguous ? `${r.int}.${r.frac}` : r.int + r.frac;
  }
  const n = s == null ? NaN : Number(s) * (r.neg ? -1 : 1);
  return { value: Number.isFinite(n) ? n : null, ambiguous: false };
}

/** Число или null. Неоднозначная запись без контекста тоже даёт null: для причины пропуска есть readNumber. */
export function parseNumber(raw, decimal = null) {
  return readNumber(raw, decimal).value;
}

// Контекст берётся только из величин: суммы, цены, веса, количества и столбцы строк товаров.
// Номера документов, версии, коды ТН ВЭД, контакты и даты в нём не участвуют («INV-1.20» не говорит о весе).
const NUMERIC_LABEL = /(total|amount|sum|price|weight|packages|qty|quantit|итого|сумм|цена|стоимост|вес|количеств|мест)/i;
const ID_LABEL = /(\bno\b|number|номер|№|\bref|version|верси|\bhs\b|code|код|тел|phone|mail|почт|date|дата|iban|swift|\bbic\b|инн|бин|\bbin\b)/i;
function quantityParts(text) {
  const parts = [];
  for (const line of String(text ?? "").split("\n")) {
    const t = line.trim();
    const item = t.match(/^\d+\s*(?:\||\t)(.+)$/);
    if (item) { parts.push(...item[1].split(/\||\t/).slice(1)); continue; } // без номера строки и описания
    const m = t.match(/^([^:|]{2,60}):\s*(.+)$/u);
    if (m && NUMERIC_LABEL.test(m[1]) && !ID_LABEL.test(m[1])) parts.push(m[2]);
  }
  return parts;
}

/**
 * Десятичный знак документа по его однозначным величинам: «1.234,50», «7,5», «1.234.567», «54 000,00».
 * Если в документе есть доказательства для обоих знаков, контекста нет.
 * Возвращает { decimal: "." | "," | null, conflict }.
 */
export function numberContext(text) {
  const seen = new Set();
  for (const part of quantityParts(text)) {
    for (const m of part.matchAll(TOKENS)) {
      if (/[\p{L}\-/._@]$/u.test(part.slice(0, m.index))) continue; // приклеено к букве или коду: не величина
      const r = interpret(m[0]);
      if (r.evidence) seen.add(r.evidence);
    }
  }
  return seen.size === 1 ? { decimal: [...seen][0], conflict: false } : { decimal: null, conflict: seen.size > 1 };
}

/** Дата или null. Несуществующая дата (2026-02-31, месяц 13) не переносится на соседний день: null. */
export function parseDate(raw) {
  if (!raw) return null;
  const s = String(raw);
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  const r = m ? null : s.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  const [y, mo, d] = m ? [+m[1], +m[2], +m[3]] : r ? [+r[3], +r[2], +r[1]] : [];
  if (y === undefined) return null;
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (Number.isNaN(date.getTime()) || date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return date;
}

// Единицы массы: множитель к килограммам. Неизвестная или неуказанная единица даёт null (ручная проверка).
// «ton» без уточнения не принимается: бывают короткие и длинные тонны.
const MASS = [
  [/^(kg|kgs|кг|kilos?|kilograms?|килограмм\p{L}*)$/u, 1],
  [/^(t|т|tn|тн|mt|tonnes?|metric tons?|тонн\p{L}*)$/u, 1000],
  [/^(g|г|gr|grams?|грамм\p{L}*)$/u, 0.001],
  [/^(lbs?|pounds?)$/u, 0.45359237],
];
/** Множитель массы по единице («kg», «т», «lbs») или null. */
export function massFactor(unit) {
  const u = String(unit ?? "").toLowerCase().replace(/[.()]/g, " ").replace(/\s+/g, " ").trim();
  for (const [re, f] of MASS) if (re.test(u)) return f;
  return null;
}
/** Единица из поля с числом: всё, что осталось без самого числа («54 000 kg» -> «kg»). */
export const unitOf = (raw) => String(raw ?? "").replace(RUN, " ").replace(/\s+/g, " ").trim();

// Единицы счёта для строк товаров: синонимы приводятся к одному слову, массы считаются отдельно.
const COUNT = [
  [/^(pcs?|pieces?|шт|штук\p{L}*|units?|ea|each)$/u, "pcs"],
  [/^(bags?|мешк\p{L}*|мешок)$/u, "bag"],
  [/^(box(es)?|cartons?|ctns?|коробк\p{L}*)$/u, "box"],
  [/^(pallets?|паллет\p{L}*|поддон\p{L}*)$/u, "pallet"],
  [/^(rolls?|рулон\p{L}*)$/u, "roll"],
  [/^(m|м|meters?|metres?|метр\p{L}*)$/u, "m"],
  [/^(l|л|liters?|litres?|литр\p{L}*)$/u, "l"],
];
/** Единица строки товара: { kind: "mass", f } | { kind: "count", u } | null (не указана или неизвестна). */
export function itemUnit(unit) {
  const u = String(unit ?? "").toLowerCase().replace(/[.()]/g, " ").replace(/\s+/g, " ").trim();
  if (!u) return null;
  const f = massFactor(u);
  if (f !== null) return { kind: "mass", f };
  for (const [re, name] of COUNT) if (re.test(u)) return { kind: "count", u: name };
  return null;
}

export const near = (a, b, eps = 0.005) => Math.abs(a - b) <= eps;
