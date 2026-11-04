// Каталог правил для «Инспектора». Рабочий каталог: data/rules.json (наполняет владелец проекта из официальных
// источников). Если его нет, используется демонстрационный data/rules.demo.json. Правила здесь не придумываются.
//
// Запись: { id, checks: [проверки], q: { ru, en, kk? }, source_url, checked_on: "ГГГГ-ММ-ДД", status }
// status: "verified" только при наличии source_url (https) и checked_on; иначе всегда "needs_review".
// Запись needs_review показывается с пометкой «не проверено» и не подаётся как факт.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { CHECKS } from "./audit.js";

const here = dirname(fileURLToPath(import.meta.url));
export const RULES_PATH = join(here, "..", "data", "rules.json");
export const DEMO_RULES_PATH = join(here, "..", "data", "rules.demo.json");
const STATUSES = new Set(["verified", "needs_review"]);

/** Проверка одной записи. Возвращает { rule, errors }; rule = null, если запись не годится. */
export function validateRule(raw, i = 0) {
  const errors = [];
  const at = `запись ${i + 1}${raw?.id ? ` (${raw.id})` : ""}`;
  if (!raw || typeof raw !== "object") return { rule: null, errors: [`${at}: не объект`] };
  if (typeof raw.id !== "string" || !/^[\w.-]{1,64}$/.test(raw.id)) errors.push(`${at}: id должен быть строкой из букв, цифр, «-», «_», «.»`);
  const checks = Array.isArray(raw.checks) ? raw.checks : [];
  if (!checks.length) errors.push(`${at}: checks должен быть непустым списком`);
  const unknown = checks.filter((c) => !CHECKS[c]);
  if (unknown.length) errors.push(`${at}: неизвестные проверки ${unknown.join(", ")}`);
  if (typeof raw.q?.ru !== "string" || !raw.q.ru.trim() || typeof raw.q?.en !== "string" || !raw.q.en.trim()) errors.push(`${at}: нужны q.ru и q.en`);
  let source = raw.source_url ?? null, checked = raw.checked_on ?? null;
  if (source !== null && !(typeof source === "string" && /^https:\/\/[^\s]+$/.test(source))) { errors.push(`${at}: source_url должен начинаться с https:// или быть null`); source = null; }
  if (checked !== null && !(typeof checked === "string" && /^\d{4}-\d{2}-\d{2}$/.test(checked) && !Number.isNaN(Date.parse(checked)))) { errors.push(`${at}: checked_on в формате ГГГГ-ММ-ДД или null`); checked = null; }
  if (raw.status !== undefined && !STATUSES.has(raw.status)) errors.push(`${at}: status только verified или needs_review`);
  if (errors.some((e) => !/source_url|checked_on|status/.test(e))) return { rule: null, errors };
  // без источника и даты проверки запись никогда не считается проверенной
  const status = source && checked && raw.status === "verified" ? "verified" : "needs_review";
  if (raw.status === "verified" && status !== "verified") errors.push(`${at}: verified без source_url и checked_on понижен до needs_review`);
  return {
    rule: { id: raw.id, checks, q: { ru: raw.q.ru, en: raw.q.en, ...(typeof raw.q.kk === "string" ? { kk: raw.q.kk } : {}) }, source_url: source, checked_on: checked, status, demo: !!raw.demo },
    errors,
  };
}

/** Загрузка каталога: рабочий, если есть, иначе демо. Повреждённый файл не роняет сервис. */
export function loadCatalog({ path = existsSync(RULES_PATH) ? RULES_PATH : DEMO_RULES_PATH } = {}) {
  let text, data;
  try { text = readFileSync(path, "utf8"); data = JSON.parse(text); }
  catch { return { rules: [], errors: ["каталог не читается: файл повреждён или не JSON"], source: path.endsWith("rules.json") ? "rules.json" : "rules.demo.json", version: null, demo: true }; }
  const list = Array.isArray(data) ? data : Array.isArray(data?.rules) ? data.rules : [];
  const rules = [], errors = [], ids = new Set();
  list.forEach((raw, i) => {
    const r = validateRule(raw, i);
    errors.push(...r.errors);
    if (r.rule && ids.has(r.rule.id)) { errors.push(`повтор id ${r.rule.id}`); return; }
    if (r.rule) { ids.add(r.rule.id); rules.push(r.rule); }
  });
  const demo = path.endsWith("rules.demo.json");
  const version = `${demo ? "demo" : "rules"}-${createHash("sha256").update(text).digest("hex").slice(0, 12)}`;
  return { rules, errors, source: demo ? "rules.demo.json" : "rules.json", version, demo, verified: rules.filter((r) => r.status === "verified").length };
}
