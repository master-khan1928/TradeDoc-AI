// Регрессии по аудиту 05.11.2026, группа 4: тексты и документация не обещают больше, чем делает код.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { buildLetter } from "../lib/letters.js";
import { runProbe } from "../lib/probe.js";
import { resetLimiters } from "../lib/extract/limits.js";
import { resetJsonFallback } from "../lib/extract/meta.js";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const reply = (obj) => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify(obj) } }] }) });

test("обещания «проходит границу с первого раза» нет ни в интерфейсе, ни в README", () => {
  for (const f of ["public/app.js", "public/index.html", "README.md"]) {
    const s = read(f);
    assert.doesNotMatch(s, /с первого раза|on the first try|first time|бірінші ретте/i, f);
  }
});

test("№45: письмо без выполненных проверок не пишет «расхождений не найдено»", () => {
  const summary = { found: 0, notFound: 0, needsReview: 0, noData: 13 };
  for (const lang of ["ru", "en"]) {
    const s = buildLetter([], lang, { ai: false }, summary);
    assert.doesNotMatch(s, /Расхождений не найдено|No differences found/, lang);
    assert.match(s, lang === "ru" ? /не выполнена/ : /not performed/);
    assert.match(s, /TradeDoc AI/, "подпись о черновике и ограничениях на месте");
  }
  // есть пройденные проверки, но часть ждёт человека: это сказано прямо
  const partial = buildLetter([], "ru", {}, { found: 0, notFound: 5, needsReview: 2, noData: 6 });
  assert.match(partial, /2/);
  assert.match(partial, /ручн/);
});

test("№44: зонд сообщает фактический формат и не считает пустой ответ успехом", async () => {
  const lines = [];
  const cfg = { provider: "groq", label: "Groq", base: "https://x", key: "k", model: "m", responseFormat: "json_object", timeoutMs: 1000, rpm: 1000 };
  for (const answer of [{}, { fields: {}, items: [] }]) {
    resetLimiters(); resetJsonFallback(); lines.length = 0;
    const code = await runProbe({ cfg, fetchImpl: async () => reply(answer), log: (l) => lines.push(l) });
    assert.equal(code, 1, JSON.stringify(answer));
    const out = lines.join("\n");
    assert.doesNotMatch(out, /json_schema: поддерживается/);
  }
  assert.match(lines.join("\n"), /json_object/);
  assert.match(lines.join("\n"), /контрольн/);
});

test("№23: версия Node согласована с зависимостью unpdf, CI и DEPLOY.md", () => {
  const pkg = JSON.parse(read("package.json"));
  const lock = JSON.parse(read("package-lock.json"));
  const need = Number(lock.packages["node_modules/unpdf"].engines.node.match(/\d+/)[0]);
  assert.ok(Number(pkg.engines.node.match(/\d+/)[0]) >= need, "engines.node");
  const ci = read(".github/workflows/ci.yml");
  for (const v of ci.match(/node: \[([^\]]+)\]/)[1].split(",").map(Number)) assert.ok(v >= need, `CI node ${v}`);
  assert.match(read("docs/DEPLOY.md"), new RegExp(`Node ${need}\\+`));
  assert.doesNotMatch(read("docs/DEPLOY.md"), /Node 20\+/);
  assert.doesNotMatch(read("README.md"), /Нужен Node 20/);
});

test("№24: DEPLOY.md ссылается только на существующие файлы и корень текущего дерева", () => {
  const d = read("docs/DEPLOY.md");
  for (const m of d.matchAll(/`([\w./-]+\.(?:md|json|template|mjs|js))`/g)) {
    assert.ok(existsSync(new URL(`../${m[1]}`, import.meta.url)) || existsSync(new URL(`../docs/${m[1]}`, import.meta.url)), `нет файла ${m[1]}`);
  }
  assert.doesNotMatch(d, /папка `tradedoc`/);
  assert.doesNotMatch(read("README.md"), /папка `tradedoc`/);
});
