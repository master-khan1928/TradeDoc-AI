// «Дело груза»: рейс как карточка с версиями документов и историей проверок.
// Хранится ТОЛЬКО в браузере пользователя (localStorage). На сервер ничего не отправляется и там не хранится.
// Модуль без DOM: страница передаёт сюда хранилище, тесты передают поддельное.

export const STORAGE_KEY = "td:cases:v1";
export const LIMITS = { cases: 20, versionsPerDoc: 10, checksPerCase: 50 };
export const DOC_TYPES = ["invoice", "packing", "cmr"];

export const emptyState = () => ({ v: 1, cases: [], current: null });

// Не больше ~2 МБ на все дела: у localStorage обычно около 5 МБ на сайт, место нужно и другим ключам.
export const MAX_BYTES = 2_000_000;

const isStr = (x) => typeof x === "string";
const isInt = (x) => Number.isInteger(x) && x >= 0;
const isObj = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const isText = (x) => isObj(x) && Object.values(x).every(isStr); // { ru, en, … }
const validEvidence = (e) => isObj(e) && isStr(e.doc) && isStr(e.quote ?? "");
const validFinding = (f) => isObj(f) && isStr(f.id) && isText(f.title) && Array.isArray(f.evidence) && f.evidence.every(validEvidence);
const validUnsure = (u) => isObj(u) && isStr(u.id) && isText(u.title) && (u.reasonText === undefined || isText(u.reasonText)) && Array.isArray(u.evidence ?? []) && (u.evidence ?? []).every(validEvidence);
const strList = (x) => x === undefined || (Array.isArray(x) && x.every(isStr));
/** Запись истории проверяется целиком, включая вложенные замечания: одна битая часть отбрасывает запись. */
function validCheck(e) {
  return isObj(e) && isInt(e.at) && isObj(e.versions) && Object.values(e.versions).every(isInt)
    && Array.isArray(e.findings) && e.findings.every(validFinding)
    && (e.unsure === undefined || (Array.isArray(e.unsure) && e.unsure.every(validUnsure)))
    && strList(e.passedIds);
}
/** Проверка одного дела при чтении: повреждённые части отбрасываются (damaged), остальное остаётся. */
function cleanCase(c) {
  if (!c || !isStr(c.id) || !c.id) return null;
  let damaged = false;
  const docs = {};
  for (const t of DOC_TYPES) {
    const list = Array.isArray(c.docs?.[t]) ? c.docs[t] : [];
    const ok = list.filter((v) => v && isInt(v.v) && isStr(v.text) && v.text.length <= 40000);
    if (ok.length < list.length) damaged = true;
    docs[t] = ok.map((v) => ({ v: v.v, at: isInt(v.at) ? v.at : 0, text: v.text, origin: isStr(v.origin) ? v.origin : "text", name: isStr(v.name) ? v.name.slice(0, 200) : "", kind: isStr(v.kind) ? v.kind : "", ...(isObj(v.extraction) ? { extraction: v.extraction } : {}) }))
      .slice(-LIMITS.versionsPerDoc);
  }
  const all = Array.isArray(c.checks) ? c.checks : [];
  const checks = all.filter(validCheck);
  if (checks.length < all.length) damaged = true;
  return {
    case: {
      id: c.id, title: isStr(c.title) ? c.title.slice(0, 120) : "", departure: isStr(c.departure) && validDate(c.departure) ? c.departure : "",
      createdAt: isInt(c.createdAt) ? c.createdAt : 0, updatedAt: isInt(c.updatedAt) ? c.updatedAt : 0, docs, checks: checks.slice(-LIMITS.checksPerCase),
    },
    damaged,
  };
}

/**
 * Чтение без падений: приватный режим, запрет хранилища и испорченные данные дают пустое состояние и причину.
 * Версия схемы v: 1; неизвестная версия не читается. Повреждённые дела отбрасываются по одному (error: "partial").
 */
export function loadState(storage) {
  let raw;
  try { raw = storage?.getItem(STORAGE_KEY); } catch { return { state: emptyState(), error: "unavailable" }; }
  if (!raw) return { state: emptyState(), error: null };
  try {
    const s = JSON.parse(raw);
    if (s?.v !== 1 || !Array.isArray(s.cases)) throw new Error("shape");
    const cleaned = s.cases.map(cleanCase).filter(Boolean);
    const cases = cleaned.map((x) => x.case).slice(-LIMITS.cases);
    const current = cases.some((c) => c.id === s.current) ? s.current : cases.at(-1)?.id ?? null;
    const partial = cleaned.length < s.cases.length || cleaned.some((x) => x.damaged);
    return { state: { v: 1, cases, current }, error: partial ? "partial" : null };
  } catch {
    return { state: emptyState(), error: "corrupt" };
  }
}

export function saveState(storage, state) {
  try {
    const json = JSON.stringify(state);
    if (json.length > MAX_BYTES) return { ok: false, error: "too_large" };
    storage.setItem(STORAGE_KEY, json);
    return { ok: true, error: null };
  } catch (e) {
    const quota = e?.name === "QuotaExceededError" || e?.code === 22 || e?.code === 1014;
    return { ok: false, error: quota ? "quota" : "unavailable" };
  }
}

/** «Удалить всё»: стирает все дела этого сайта в браузере. */
export function clearAll(storage) {
  try { storage.removeItem(STORAGE_KEY); return true; } catch { return false; }
}

const validDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s)) && !Number.isNaN(Date.parse(s));

export function newCase(state, { title = "", departure = "", now = Date.now() } = {}) {
  const c = {
    id: `c${now.toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    title: String(title).slice(0, 120), departure: validDate(departure) ? departure : "",
    createdAt: now, updatedAt: now,
    docs: Object.fromEntries(DOC_TYPES.map((t) => [t, []])),
    checks: [],
  };
  state.cases.push(c);
  state.current = c.id;
  // старые дела сверх лимита удаляются: место в браузере ограничено
  if (state.cases.length > LIMITS.cases) {
    state.cases.sort((a, b) => a.updatedAt - b.updatedAt);
    state.cases.splice(0, state.cases.length - LIMITS.cases);
  }
  return c;
}

export const currentCase = (state) => state.cases.find((c) => c.id === state.current) ?? null;

export function deleteCase(state, id) {
  state.cases = state.cases.filter((c) => c.id !== id);
  if (state.current === id) state.current = state.cases.at(-1)?.id ?? null;
}

export function updateCase(c, { title, departure, now = Date.now() }) {
  if (title !== undefined) c.title = String(title).slice(0, 120);
  if (departure !== undefined) c.departure = validDate(departure) ? departure : "";
  c.updatedAt = now;
}

export const latest = (c, type) => c.docs[type]?.at(-1) ?? null;

/**
 * Новая версия документа появляется, только если текст изменился. docs: [{ type, text, origin, name, kind, extraction }].
 * Возвращает { versions: {type: номер}, changed: [{type, from, to}] }.
 */
export function addVersions(c, docs, now = Date.now()) {
  const versions = {}, changed = [];
  for (const d of docs) {
    if (!DOC_TYPES.includes(d.type)) continue;
    const list = c.docs[d.type];
    const last = list.at(-1);
    if (last && last.text === d.text) { versions[d.type] = last.v; continue; }
    const v = (last?.v ?? 0) + 1;
    const rec = { v, at: now, text: d.text, origin: d.origin ?? "text", name: d.name ?? "", kind: d.kind ?? "" };
    if (d.origin === "photo" && d.extraction) rec.extraction = d.extraction;
    list.push(rec);
    if (list.length > LIMITS.versionsPerDoc) list.splice(0, list.length - LIMITS.versionsPerDoc);
    versions[d.type] = v;
    changed.push({ type: d.type, from: last?.v ?? null, to: v });
  }
  c.updatedAt = now;
  return { versions, changed };
}

const slimEvidence = (e) => ({ doc: e.doc, page: e.page, quote: e.quote, origin: e.origin });

/** Запись проверки в историю дела. Хранятся замечания с цитатами, без «правильных» значений. */
export function recordCheck(c, { versions, changed = [], result, now = Date.now() }) {
  const entry = {
    at: now, versions, changed, mode: result.mode, aiUnavailable: !!result.aiUnavailable,
    passed: result.passed, total: result.total,
    findings: result.findings.map((f) => ({ id: f.id, title: f.title, severity: f.severity, evidence: f.evidence.map(slimEvidence) })),
    unsure: result.checks.filter((x) => x.status === "skip" && x.reasonText)
      .map((x) => ({ id: x.id, title: x.title, reasonText: x.reasonText, evidence: x.evidence.map(slimEvidence) })),
    // какие проверки явно пройдены: «исправлено» засчитывается только по ним (diffChecks)
    passedIds: result.checks.filter((x) => x.status === "pass").map((x) => x.id),
  };
  c.checks.push(entry);
  if (c.checks.length > LIMITS.checksPerCase) c.checks.splice(0, c.checks.length - LIMITS.checksPerCase);
  c.updatedAt = now;
  return entry;
}

/**
 * Что изменилось между двумя проверками (по видам проверок): исправлено, больше не удалось проверить, новое, осталось.
 * «Исправлено» только если та же проверка в новой записи явно пройдена; если она пропущена (данные исчезли,
 * нужна ручная проверка) или в старой записи нет списка пройденных, это lost, а не исправление.
 */
export function diffChecks(prev, cur) {
  const a = new Set((prev?.findings ?? []).map((f) => f?.id)), b = new Set((cur?.findings ?? []).map((f) => f?.id));
  const passed = new Set(cur?.passedIds ?? []);
  const gone = [...a].filter((x) => !b.has(x));
  return { fixed: gone.filter((x) => passed.has(x)), lost: gone.filter((x) => !passed.has(x)), added: [...b].filter((x) => !a.has(x)), still: [...b].filter((x) => a.has(x)) };
}

/** Построчная разница двух версий документа (наибольшая общая подпоследовательность). */
export function lineDiff(a, b, maxLines = 600) {
  const A = String(a ?? "").split("\n"), B = String(b ?? "").split("\n");
  if (A.length > maxLines || B.length > maxLines) {
    // слишком длинно для подробного сравнения: показываем, какие строки ушли и какие появились
    const sa = new Set(A), sb = new Set(B);
    return [...A.filter((l) => !sb.has(l)).map((line) => ({ op: "del", line })), ...B.filter((l) => !sa.has(l)).map((line) => ({ op: "add", line }))];
  }
  const n = A.length, m = B.length;
  const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { out.push({ op: "same", line: A[i] }); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) out.push({ op: "del", line: A[i++] });
    else out.push({ op: "add", line: B[j++] });
  }
  while (i < n) out.push({ op: "del", line: A[i++] });
  while (j < m) out.push({ op: "add", line: B[j++] });
  return out;
}

/** Дней до даты выезда (по календарю, без часовых поясов). null, если дата не задана. */
export function daysUntil(departure, now = Date.now()) {
  if (!validDate(departure)) return null;
  const d = new Date(now);
  const today = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const [y, m, day] = departure.split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, day) - today) / 86400000);
}
