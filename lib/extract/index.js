import { mockExtract } from "./mock.js";
import { metaConfig, metaExtract } from "./meta.js";
import { verifyExtraction, sanitizeExtraction } from "./verify.js";
import { numberContext } from "../parse.js";

export function aiMode(env = process.env) {
  return metaConfig(env) ? "meta" : "mock";
}

/**
 * Читает все документы. Если ИИ недоступен, честно падает назад на MOCK и сообщает почему (aiError).
 * Документы читаются моделью параллельно: время ответа сайту ограничено одним запросом с одним повтором.
 */
export async function extractAll(docs, { env = process.env, fetchImpl } = {}) {
  const cfg = metaConfig(env);
  let aiUnavailable = false, aiError = null, jsonFallback = false;
  const out = await Promise.all(docs.map(async (doc) => {
    const origin = doc.origin ?? "text";
    let ex;
    if (origin === "photo" && doc.extraction) {
      // фото уже прочитано моделью при загрузке (/api/read); второй раз модель не зовём
      ex = { type: doc.type, ...sanitizeExtraction(doc.extraction), mode: "meta" };
    } else if (cfg) {
      try {
        ex = await metaExtract(doc, cfg, fetchImpl);
        if (ex.jsonFallback) jsonFallback = true;
      } catch (e) {
        aiUnavailable = true;
        aiError ??= e?.kind ?? "network";
        ex = mockExtract(doc);
      }
    } else {
      ex = mockExtract(doc);
    }
    // десятичный знак документа по его однозначным числам: помогает прочитать «32.500», но только без противоречий
    return { ...verifyExtraction(doc, ex), origin, numberContext: numberContext(doc.text) };
  }));
  return { mode: cfg && !aiUnavailable ? "meta" : "mock", aiUnavailable, aiError, jsonFallback, docs: out };
}
