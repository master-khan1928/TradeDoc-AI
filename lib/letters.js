// Письмо партнёру. Только факты: что где написано. Значений не предлагаем никогда.
import { PROBLEMS } from "./audit.js";

const DOC = {
  ru: { invoice: "Инвойс", packing: "Упаковочный лист", cmr: "CMR" },
  en: { invoice: "Invoice", packing: "Packing list", cmr: "CMR" },
};

const T = {
  ru: {
    hello: "Здравствуйте!",
    intro: "При подготовке документов на груз мы нашли расхождения:",
    ask: "Просим сверить эти пункты с фактическим грузом и оригиналами документов и письменно подтвердить верные значения. Мы не предлагаем значений: подтвердить должна сторона, которая отвечает за документ.",
    bye: "С уважением,",
    none: "Расхождений не найдено.",
    notRun: "Проверка не выполнена: ни одно сравнение провести не удалось (в документах не нашлось данных для сверки). Отсутствие замечаний здесь не означает, что расхождений нет.",
    partial: (ok, review, nodata) => `Среди выполненных проверок (${ok}) расхождений не найдено. Требуют ручной проверки: ${review}. Не выполнено из-за отсутствия данных: ${nodata}.`,
    noSummary: "Расхождений среди выполненных проверок не найдено. Сведения о полноте проверки не переданы.",
  },
  en: {
    hello: "Hello,",
    intro: "While preparing the shipment documents we found these differences:",
    ask: "Please check these items against the actual cargo and the original documents, and confirm the correct values in writing. We do not propose any values: the party responsible for the document should confirm them.",
    bye: "Best regards,",
    none: "No differences found.",
    notRun: "The check was not performed: no comparison could be made (the documents had no data to compare). The absence of findings here does not mean there are no differences.",
    partial: (ok, review, nodata) => `No differences among the checks performed (${ok}). Needing a manual check: ${review}. Not performed for lack of data: ${nodata}.`,
    noSummary: "No differences among the checks performed. No information on how complete the check was was provided.",
  },
};

export const LETTER_LANGS = Object.keys(T);

// Подпись черновика: как он подготовлен (с помощью ИИ или без), и что это не консультация.
const FOOTER = {
  ru: (m) => `—\nЧерновик подготовлен автоматически сервисом TradeDoc AI ${m.ai ? `с помощью ИИ (${m.label} · ${m.model})` : "без ИИ (разбор по шаблону)"}. Проверьте перед отправкой. Сервис не является таможенным брокером и не даёт юридических советов.`,
  en: (m) => `—\nDraft prepared automatically by TradeDoc AI ${m.ai ? `with AI (${m.label} · ${m.model})` : "without AI (template parsing)"}. Check it before sending. The service is not a customs broker and gives no legal advice.`,
};
const clean = (s) => String(s ?? "").replace(/[^\p{L}\p{N} .:_\/-]/gu, "").slice(0, 60);

const count = (x) => (Number.isInteger(x) && x >= 0 ? x : null);

/**
 * Письмо по замечаниям. summary ({ found, notFound, needsReview, noData }) нужен, чтобы пустой список
 * замечаний не выдавался за успешную проверку: без выполненных сравнений письмо так и говорит.
 */
export function buildLetter(findings, lang = "en", mode = {}, summary = null) {
  const l = T[lang] ? lang : "en";
  const footer = FOOTER[l]({ ai: !!mode.ai, label: clean(mode.label), model: clean(mode.model) });
  if (!findings?.length) {
    const ok = count(summary?.notFound), review = count(summary?.needsReview) ?? 0, nodata = count(summary?.noData) ?? 0;
    const body = ok === null ? T[l].noSummary : ok === 0 ? T[l].notRun : review || nodata ? T[l].partial(ok, review, nodata) : T[l].none;
    return [body, "", footer].join("\n");
  }
  const lines = findings.map((f, i) => {
    const ev = (f.evidence ?? []).map((e) => `   - ${DOC[l][e.doc] ?? e.doc}: «${e.quote}»`).join("\n");
    return `${i + 1}. ${PROBLEMS[f.id]?.[l] ?? f.id}\n${ev}`;
  });
  return [T[l].hello, "", T[l].intro, "", ...lines, "", T[l].ask, "", T[l].bye, "", footer].join("\n");
}
