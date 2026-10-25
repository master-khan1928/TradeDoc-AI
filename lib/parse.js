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
 * Число из строки. decimal: десятичный знак из контекста документа ("." или ","), иначе null.
 * Возвращает { value, ambiguous }: неоднозначная запись без контекста даёт value = null, ambiguous = true.
 */
export function readNumber(raw, decimal = null) {
  if (raw == null) return { value: null, ambiguous: false };
  const str = String(raw);
  const m = str.match(SPACE_GROUPED) ?? str.match(PLAIN);
  if (!m) return { value: null, ambiguous: false };
  const r = interpret(m[0]);
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

/**
 * Десятичный знак документа по его однозначным числам: «1.234,50», «7,5», «1.234.567», «54 000,00».
 * Даты не считаются. Если в документе есть доказательства для обоих знаков, контекста нет.
 * Возвращает { decimal: "." | "," | null, conflict }.
 */
export function numberContext(text) {
  const clean = String(text ?? "")
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, " ")
    .replace(/\b\d{1,2}[./]\d{1,2}[./]\d{2,4}\b/g, " ");
  const seen = new Set();
  for (const m of clean.matchAll(TOKENS)) {
    const r = interpret(m[0]);
    if (r.evidence) seen.add(r.evidence);
  }
  return seen.size === 1 ? { decimal: [...seen][0], conflict: false } : { decimal: null, conflict: seen.size > 1 };
}

export function parseDate(raw) {
  if (!raw) return null;
  const m = String(raw).match(/(\d{4})-(\d{2})-(\d{2})/) || null;
  if (m) {
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const r = String(raw).match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (r) {
    const d = new Date(Date.UTC(+r[3], +r[2] - 1, +r[1]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export const near = (a, b, eps = 0.005) => Math.abs(a - b) <= eps;
