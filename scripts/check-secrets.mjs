// Проверка на утечку секретов без зависимостей (замена gitleaks для этого проекта).
//   node scripts/check-secrets.mjs                 отслеживаемые и подготовленные к коммиту файлы
//   node scripts/check-secrets.mjs --history       вся история git
//   node scripts/check-secrets.mjs --deep [папка…] вся рабочая папка (включая игнорируемые файлы, кроме node_modules и .git),
//                                                  логи, bench-results/, docs/, и .tar-архивы: каждый распаковывается
//                                                  во временную папку, сканируется и удаляется. Дополнительные папки
//                                                  (например, со снимками) передаются аргументами.
// Найденное значение не печатается: только файл, строка и вид секрета.
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync, readdirSync, statSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const RULES = [
  ["Google API key", /AIza[0-9A-Za-z_-]{35}/],
  ["Google/Gemini key (AQ. format)", /\bAQ\.[A-Za-z0-9_-]{30,}/],
  ["Groq API key", /gsk_[0-9A-Za-z]{20,}/],
  ["OpenRouter API key", /sk-or-v1-[0-9a-f]{32,}/],
  ["OpenAI-style key", /sk-(?:proj-)?[A-Za-z0-9]{32,}/],
  ["Meta/LLM-style key", /\bLLM_[A-Za-z0-9]{24,}\b/],
  ["GitHub token", /gh[pousr]_[A-Za-z0-9]{30,}/],
  ["AWS access key", /AKIA[0-9A-Z]{16}/],
  ["Slack token", /xox[baprs]-[0-9A-Za-z-]{10,}/],
  ["private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["Bearer token", /Bearer [A-Za-z0-9._-]{30,}/],
  // присваивание ключа в файле: META_API_KEY=настоящее-значение (пустое значение и заглушки разрешены)
  ["key assignment", /\b[A-Z_]*(?:API_KEY|SECRET|TOKEN)\s*[=:]\s*["']?(?!["'\s]|\$|<|\[|fake|test|example|xxx|k["'\s,]|secret["']|process\.env)[A-Za-z0-9_\-./+]{16,}/],
];
// Известные заглушки из тестов (не ключи). Каждое значение здесь объяснено: test/probe.test.js проверяет,
// что ключ не попадает в вывод зонда, поэтому ему нужна строка, похожая на ключ.
const KNOWN_FAKE = ["sk-test-SECRET-123"];
const SKIP = /(^|\/)(node_modules|\.git)(\/|$)|\.(png|jpe?g|webp|pdf|ttf|woff2?)$|package-lock\.json$/;
const hit = (line) => RULES.filter(([, re]) => re.test(line) && !KNOWN_FAKE.some((v) => line.includes(v))).map(([kind]) => kind);

function scan(name, text, found) {
  text.split("\n").forEach((line, i) => { for (const kind of hit(line)) found.push(`${name}:${i + 1}: ${kind}`); });
}
const isBinary = (buf) => buf.subarray(0, 4096).includes(0);

// обход папки: файлы и вложенные .tar (распаковка во временную папку)
function walk(dir, label, found, depth = 0) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name), shown = (label ? label + "/" : "") + e.name;
    if (SKIP.test(shown)) continue;
    if (e.isDirectory()) { walk(p, shown, found, depth); continue; }
    if (/\.tar$/i.test(e.name) && depth < 2) {
      const tmp = mkdtempSync(join(tmpdir(), "td-secrets-"));
      try {
        // архив идёт через stdin, папка назначения через cwd: пути Windows с «C:\…» ломают GNU tar
        execFileSync("tar", ["-xf", "-"], { input: readFileSync(p), stdio: ["pipe", "ignore", "ignore"], cwd: tmp, maxBuffer: 1 << 28 });
        walk(tmp, shown + "!", found, depth + 1);
      } catch { found.push(`${shown}: не удалось распаковать архив`); }
      finally { rmSync(tmp, { recursive: true, force: true }); }
      continue;
    }
    // локальный .env с ключами допустим, пока git его игнорирует (проверяется ниже); его содержимое не сканируется
    if (shown === ".env" && depth === 0) { localEnv = true; continue; }
    if (statSync(p).size > 5_000_000) continue;
    const buf = readFileSync(p);
    if (isBinary(buf)) continue;
    scan(shown, buf.toString("utf8"), found);
  }
}

const found = [];
let localEnv = false;
let mode = "файлы репозитория";
if (process.argv.includes("--history")) {
  mode = "вся история git";
  const log = execFileSync("git", ["log", "-p", "--all", "--no-color", "--format=commit %H"], { encoding: "utf8", maxBuffer: 1 << 28 });
  let commit = "?";
  for (const line of log.split("\n")) {
    if (line.startsWith("commit ")) { commit = line.slice(7, 14); continue; }
    if (line.startsWith("+") && !line.startsWith("+++")) for (const kind of hit(line)) found.push(`${commit}: ${kind}`);
  }
} else if (process.argv.includes("--deep")) {
  mode = "рабочая папка, архивы .tar и указанные папки";
  const extra = process.argv.slice(process.argv.indexOf("--deep") + 1).filter((a) => !a.startsWith("--"));
  const root = process.cwd();
  walk(root, "", found);
  for (const d of extra) if (existsSync(d)) walk(d, "[" + d.split(/[\\/]/).slice(-2).join("/") + "]", found);
  for (const f of execFileSync("git", ["ls-files"], { encoding: "utf8" }).split("\n")) if (/(^|\/)\.env(\.|$)/.test(f)) found.push(`${f}: файл .env в индексе git`);
  if (localEnv) {
    let ignored = true;
    try { execFileSync("git", ["check-ignore", "-q", ".env"]); } catch { ignored = false; }
    if (ignored) console.log("Примечание: локальный .env пропущен (игнорируется git, в индекс не попадает).");
    else found.push(".env: локальный файл не игнорируется git");
  }
} else {
  const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" }).split("\n").filter(Boolean);
  for (const f of files) if (!SKIP.test(f) && existsSync(f)) scan(f, readFileSync(f, "utf8"), found);
  for (const f of files) if (/(^|\/)\.env(\.|$)/.test(f)) found.push(`${f}: файл .env не должен попадать в репозиторий`);
}
if (found.length) { console.log("Найдены возможные секреты:"); for (const f of found) console.log("  " + f); process.exit(1); }
console.log(`Секретов не найдено (${mode}).`);
