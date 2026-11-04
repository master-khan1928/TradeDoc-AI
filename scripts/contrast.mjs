// Контраст ключевых пар цветов оформления (WCAG 2.2): npm run contrast.
// Цвета читаются из :root в public/app.css; полупрозрачные цвета смешиваются с тем, что под ними.
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../public/app.css", import.meta.url), "utf8");
const root = css.slice(css.indexOf(":root{"), css.indexOf("}", css.indexOf(":root{")));
const V = {};
for (const m of root.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{3,6}\b|rgba?\([^)]*\))/g)) {
  V[m[1]] = /^#[0-9a-fA-F]{3}$/.test(m[2]) ? "#" + [...m[2].slice(1)].map((c) => c + c).join("") : m[2]; // #fff -> #ffffff
}

const parse = (c) => {
  if (c.startsWith("#")) return [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)).concat(1);
  const [r, g, b, a = 1] = c.match(/[\d.]+/g).map(Number);
  return [r, g, b, a];
};
const over = (fg, bg) => { const [r, g, b, a] = parse(fg), [R, G, B] = parse(bg); return [r * a + R * (1 - a), g * a + G * (1 - a), b * a + B * (1 - a)]; };
const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const hex = ([r, g, b]) => "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

// поверхности: фон страницы, стеклянная карточка (белый .05 поверх фона), тёмное «окно» (чёрный .35 поверх карточки)
const bg = V.bg, card = hex(over("rgba(255,255,255,.05)", bg)), win = hex(over("rgba(0,0,0,.35)", card));
const tint = (c, a) => hex(over(`rgba(${parse(c).slice(0, 3).join(",")},${a})`, bg));
const hlBg = hex(over("rgba(47,214,195,.45)", win));

// [текст, фон, минимум, описание]: 4.5 для текста, 3 для рамки фокуса
const PAIRS = [
  [V.fg, bg, 4.5, "основной текст на фоне"], [V.fg, card, 4.5, "основной текст на карточке"],
  [V.fg2, bg, 4.5, "вторичный текст (.lead) на фоне"], [V.fg2, card, 4.5, "вторичный текст на карточке"],
  [V.fg3, bg, 4.5, "подписи (.note, .eyebrow) на фоне"], [V.fg3, card, 4.5, "подписи на карточке"], [V.fg3, win, 4.5, "подписи в тёмном окне листа"],
  [V.fg, win, 4.5, "текст в тёмном окне листа"],
  [V.teal, bg, 4.5, "ссылки и акцент на фоне"], [V.teal, card, 4.5, "акцент на карточке"],
  ["#04100e", V.teal, 4.5, "текст основной кнопки (начало градиента)"], ["#04100e", V.blue, 4.5, "текст основной кнопки (конец градиента)"],
  ["#000000", "#ffffff", 4.5, "выбранный язык и вкладка"],
  [V.gold, tint(V.gold, 0.08), 4.5, "бейдж «MOCK / демо»"], [V.orange, tint(V.orange, 0.1), 4.5, "бейдж «бесплатная модель»"],
  [V.teal, tint(V.teal, 0.08), 4.5, "бейдж «модель ИИ»"], [V.green, tint(V.green, 0.08), 4.5, "бейдж «не найдено»"], [V.red, tint(V.red, 0.09), 4.5, "бейдж «найдено»"],
  ["#ffd36a", tint(V.gold, 0.08), 4.5, "предупреждение"], ["#ffb3ba", bg, 4.5, "ошибка в статусе"],
  ["#ffffff", hlBg, 4.5, "подсвеченная цитата на листе"],
  [V.teal, bg, 3, "рамка фокуса на фоне"], [V.teal, card, 3, "рамка фокуса на карточке"],
];
let bad = 0;
for (const [fg, back, min, what] of PAIRS) {
  const under = parse(back).slice(0, 3);
  const f = over(fg, hex(under));
  const r = ratio(f, under);
  const ok = r >= min;
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"} ${r.toFixed(2).padStart(5)}:1 (нужно ${min}) ${what}: ${hex(f)} на ${hex(under)}`);
}
console.log(bad ? `\nНиже нормы: ${bad} из ${PAIRS.length}` : `\nВсе ${PAIRS.length} пар не ниже нормы WCAG AA.`);
process.exit(bad ? 1 : 0);
