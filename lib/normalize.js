// Нормализация и сравнение названий сторон. Чистый код, без ИИ.
// Идея: одна и та же компания пишется кириллицей, латиницей, узбекской латиницей.
// Приводим всё к одному виду, а спорные случаи показываем человеку.

const MAP = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "i",
  к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
  х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sh", ъ: "", ы: "i", ь: "", э: "e", ю: "iu", я: "ia",
  қ: "q", ғ: "g", ң: "n", ү: "u", ұ: "u", һ: "h", ә: "a", ө: "o", і: "i", ў: "u", ҳ: "h",
};

// организационно-правовые формы (после транслитерации)
const LEGAL = new Set([
  "llp", "llc", "ooo", "too", "mchj", "xk", "ltd", "ip", "jsc", "ao", "oao", "zao", "oo", "ac",
  "tov", "co", "inc", "gmbh", "ag", "sia", "ouu",
]);

export function translit(s) {
  let out = "";
  for (const ch of String(s).toLowerCase()) out += MAP[ch] !== undefined ? MAP[ch] : ch;
  return out;
}

/** Каноническая форма названия: латиница, без юр. формы, без знаков, порядок слов не важен. */
// свёртка частых вариантов написания (y/i, w/v, x/h, j/i) и двойных букв; цифры не сворачиваются: 100 и 10 разные
function fold(s) {
  return s.replace(/y/g, "i").replace(/w/g, "v").replace(/x/g, "h").replace(/j/g, "i").replace(/([a-z])\1+/g, "$1");
}
const numbersOf = (c) => (c.match(/\d+/g) ?? []).sort().join(" ");
const LEGAL_FOLDED = new Set([...LEGAL].map(fold));

export function canonName(raw) {
  let s = translit(String(raw ?? ""));
  s = s.normalize("NFKD").replace(/[̀-ͯ]/g, ""); // убрать диакритику
  s = s.replace(/[ʻʼ'’`´]/g, ""); // o'zbek -> ozbek
  s = s.replace(/[^a-z0-9\s]/g, " ");
  const tokens = s.split(/\s+/).filter(Boolean).map(fold);
  const core = tokens.filter((t) => !LEGAL_FOLDED.has(t));
  return (core.length ? core : tokens).sort().join(" ");
}

export function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

// Сравнение квадратичное по длине, поэтому названия длиннее предела не сравниваются вовсе (это не название, а
// мусор или склейка строк): verdict unknown, сверка уходит на ручную проверку и не блокирует сервер.
export const MAX_NAME_CHARS = 200;

/** same: одно и то же | variant: очень похоже, но написано иначе | different | unknown (пусто или слишком длинно) */
export function compareNames(a, b) {
  if (String(a ?? "").length > MAX_NAME_CHARS * 4 || String(b ?? "").length > MAX_NAME_CHARS * 4) return { verdict: "unknown", ratio: 0, tooLong: true };
  const ca = canonName(a), cb = canonName(b);
  if (ca.length > MAX_NAME_CHARS || cb.length > MAX_NAME_CHARS) return { verdict: "unknown", ratio: 0, tooLong: true };
  if (!ca || !cb) return { verdict: "unknown", ratio: 0 };
  if (ca === cb) return { verdict: "same", ratio: 1 };
  const ratio = Math.round((1 - levenshtein(ca, cb) / Math.max(ca.length, cb.length)) * 100) / 100;
  // разные числа в названии («Trade 100» и «Trade 10», «AB1» и «AB11») это разные названия, а не опечатка
  if (numbersOf(ca) !== numbersOf(cb)) return { verdict: "different", ratio };
  return { verdict: ratio >= 0.8 ? "variant" : "different", ratio };
}
