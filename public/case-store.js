// «Дело груза»: рейс как карточка с версиями документов и историей проверок.
// Хранится ТОЛЬКО в браузере пользователя (localStorage). На сервер ничего не отправляется и там не хранится.
// Модуль без DOM: страница передаёт сюда хранилище, тесты передают поддельное.

export const STORAGE_KEY = "td:cases:v1";
export const LIMITS = { cases: 20, versionsPerDoc: 10, checksPerCase: 50 };
export const DOC_TYPES = ["invoice", "packing", "cmr"];

export const emptyState = () => ({ v: 1, cases: [], current: null });

/** Чтение без падений: приватный режим, запрет хранилища и испорченные данные дают пустое состояние и причину. */
export function loadState(storage) {
  let raw;
  try { raw = storage?.getItem(STORAGE_KEY); } catch { return { state: emptyState(), error: "unavailable" }; }
  if (!raw) return { state: emptyState(), error: null };
  try {
    const s = JSON.parse(raw);
    if (s?.v !== 1 || !Array.isArray(s.cases)) throw new Error("shape");
    return { state: s, error: null };
  } catch {
    return { state: emptyState(), error: "corrupt" };
  }
}

export function saveState(storage, state) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
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
  };
  c.checks.push(entry);
  if (c.checks.length > LIMITS.checksPerCase) c.checks.splice(0, c.checks.length - LIMITS.checksPerCase);
  c.updatedAt = now;
  return entry;
}

/** Что изменилось между двумя проверками: исправлено, новое, осталось (по видам проверок). */
export function diffChecks(prev, cur) {
  const a = new Set((prev?.findings ?? []).map((f) => f.id)), b = new Set((cur?.findings ?? []).map((f) => f.id));
  return { fixed: [...a].filter((x) => !b.has(x)), added: [...b].filter((x) => !a.has(x)), still: [...b].filter((x) => a.has(x)) };
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
