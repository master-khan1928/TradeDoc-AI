// Лёгкий линт без зависимостей: синтаксис всех .js/.mjs (node --check) и простые правила проекта.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" })
  .split("\n").filter((f) => /\.(m?js)$/.test(f) && !f.startsWith("node_modules/"));
const problems = [];
for (const f of files) {
  try { execFileSync(process.execPath, ["--check", f], { stdio: "pipe" }); } catch (e) { problems.push(`${f}: синтаксис: ${String(e.stderr).split("\n").find((l) => /Error/.test(l)) ?? "ошибка"}`); }
  const src = readFileSync(f, "utf8");
  if (f.startsWith("public/") && /\.innerHTML\s*=|insertAdjacentHTML|document\.write\(/.test(src)) problems.push(`${f}: вывод через innerHTML запрещён (XSS), используйте textContent`);
  if (/\beval\(|new Function\(/.test(src)) problems.push(`${f}: eval/new Function запрещены`);
  if (/console\.log\([^)]*\b(text|doc\.text|transcription)\b/.test(src)) problems.push(`${f}: похоже, в журнал пишется текст документа`);
}
const html = readFileSync("public/index.html", "utf8");
if (/<script(?![^>]*\ssrc=)[^>]*>/.test(html) || /\sstyle="/.test(html) || /\son[a-z]+="/.test(html)) problems.push("public/index.html: встроенные скрипты, стили или обработчики нарушают CSP");
if (problems.length) { for (const p of problems) console.log(p); process.exit(1); }
console.log(`Линт: ${files.length} файлов, замечаний нет.`);
