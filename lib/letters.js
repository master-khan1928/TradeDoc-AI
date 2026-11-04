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
  },
  en: {
    hello: "Hello,",
    intro: "While preparing the shipment documents we found these differences:",
    ask: "Please check these items against the actual cargo and the original documents, and confirm the correct values in writing. We do not propose any values: the party responsible for the document should confirm them.",
    bye: "Best regards,",
    none: "No differences found.",
  },
};

export const LETTER_LANGS = Object.keys(T);

// Подпись черновика: как он подготовлен (с помощью ИИ или без), и что это не консультация.
const FOOTER = {
  ru: (m) => `—\nЧерновик подготовлен автоматически сервисом TradeDoc AI ${m.ai ? `с помощью ИИ (${m.label} · ${m.model})` : "без ИИ (разбор по шаблону)"}. Проверьте перед отправкой. Сервис не является таможенным брокером и не даёт юридических советов.`,
  en: (m) => `—\nDraft prepared automatically by TradeDoc AI ${m.ai ? `with AI (${m.label} · ${m.model})` : "without AI (template parsing)"}. Check it before sending. The service is not a customs broker and gives no legal advice.`,
};
const clean = (s) => String(s ?? "").replace(/[^\p{L}\p{N} .:_\/-]/gu, "").slice(0, 60);

export function buildLetter(findings, lang = "en", mode = {}) {
  const l = T[lang] ? lang : "en";
  if (!findings?.length) return `${T[l].none}`;
  const footer = FOOTER[l]({ ai: !!mode.ai, label: clean(mode.label), model: clean(mode.model) });
  const lines = findings.map((f, i) => {
    const ev = (f.evidence ?? []).map((e) => `   - ${DOC[l][e.doc] ?? e.doc}: «${e.quote}»`).join("\n");
    return `${i + 1}. ${PROBLEMS[f.id]?.[l] ?? f.id}\n${ev}`;
  });
  return [T[l].hello, "", T[l].intro, "", ...lines, "", T[l].ask, "", T[l].bye, "", footer].join("\n");
}
