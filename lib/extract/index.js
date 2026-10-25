import { mockExtract } from "./mock.js";
import { metaConfig, metaExtract } from "./meta.js";
import { verifyExtraction } from "./verify.js";

export function aiMode(env = process.env) {
  return metaConfig(env) ? "meta" : "mock";
}

/** Читает все документы. Если ИИ недоступен, честно падает назад на MOCK и сообщает об этом. */
export async function extractAll(docs, { env = process.env, fetchImpl } = {}) {
  const cfg = metaConfig(env);
  let aiUnavailable = false;
  const out = [];
  for (const doc of docs) {
    let ex;
    if (cfg) {
      try {
        ex = await metaExtract(doc, cfg, fetchImpl);
      } catch {
        aiUnavailable = true;
        ex = mockExtract(doc);
      }
    } else {
      ex = mockExtract(doc);
    }
    out.push(verifyExtraction(doc, ex));
  }
  return { mode: cfg && !aiUnavailable ? "meta" : "mock", aiUnavailable, docs: out };
}
