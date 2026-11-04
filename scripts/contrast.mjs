// Контраст ключевых пар цветов дизайн-системы (WCAG 2.2): npm run contrast. Пары читаются из public/app.css (:root).
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../public/app.css", import.meta.url), "utf8");
const vars = {};
for (const m of css.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\b/g)) vars[m[1]] = m[2];
const lum = (hex) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// [передний план, фон, минимум, описание]: 4.5 для текста, 3 для крупного текста и границ элементов управления
const PAIRS = [
  ["text", "bg", 4.5, "основной текст на фоне"], ["text", "surface", 4.5, "основной текст на карточке"],
  ["text-2", "surface", 4.5, "вторичный текст на карточке"], ["muted", "surface", 4.5, "подписи на карточке"], ["muted", "bg", 4.5, "подписи на фоне"],
  ["muted", "surface-2", 4.5, "подписи на приподнятой карточке"],
  ["accent", "surface", 4.5, "ссылки и акцент на карточке"], ["accent", "bg", 4.5, "ссылки и акцент на фоне"],
  ["on-accent", "accent-strong", 4.5, "текст основной кнопки"],
  ["found", "found-bg", 4.5, "статус «найдено»"], ["review", "review-bg", 4.5, "статус «нужна проверка»"], ["ok", "ok-bg", 4.5, "статус «не найдено»"],
  ["found", "surface", 4.5, "красный текст на карточке"], ["review", "surface", 4.5, "жёлтый текст на карточке"], ["ok", "surface", 4.5, "зелёный текст на карточке"],
  ["paper-text", "paper", 4.5, "текст на листе документа"], ["paper-muted", "paper", 4.5, "подписи на листе документа"],
  ["paper-text", "hl", 4.5, "подсвеченная цитата на листе"],
  ["focus", "bg", 3, "рамка фокуса на фоне"], ["focus", "surface", 3, "рамка фокуса на карточке"],
  ["line-strong", "surface", 3, "граница полей ввода"],
];
let bad = 0;
for (const [fg, bg, min, what] of PAIRS) {
  if (!vars[fg] || !vars[bg]) { console.log(`?    ${fg} / ${bg}: нет переменной`); bad++; continue; }
  const r = ratio(vars[fg], vars[bg]);
  const ok = r >= min;
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"} ${r.toFixed(2).padStart(5)}:1 (нужно ${min}) ${what}: ${fg} ${vars[fg]} на ${bg} ${vars[bg]}`);
}
console.log(bad ? `\nНиже нормы: ${bad}` : `\nВсе ${PAIRS.length} пар не ниже нормы WCAG AA.`);
process.exit(bad ? 1 : 0);
