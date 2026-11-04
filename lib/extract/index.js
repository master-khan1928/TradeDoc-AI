import { mockExtract } from "./mock.js";
import { metaExtract, newBudget } from "./meta.js";
import { verifyExtraction, sanitizeExtraction } from "./verify.js";
import { activeProviderName, providerConfig, withFallback } from "./providers.js";
import { extractionCache, cacheEnabled, cacheKey } from "./limits.js";
import { numberContext } from "../parse.js";
import { findRealDataMarkers, maskPersonalData } from "../pii.js";
import { InputError } from "../files.js";

/** Какой режим чтения реально включён: mock | meta | gemini | groq | openrouter. */
export function aiMode(env = process.env) {
  return providerConfig(env) ? activeProviderName(env) : "mock";
}

/**
 * Бесплатные тарифы провайдеров могут использовать данные для улучшения своих продуктов: туда уходят
 * только синтетические документы. Если в тексте похоже есть реальные персональные данные, ничего не отправляем.
 */
export function assertSyntheticOnly(cfg, texts) {
  if (!cfg?.demoOnly) return;
  const kinds = [...new Set(texts.flatMap((t) => findRealDataMarkers(t)))];
  if (kinds.length) {
    throw Object.assign(new InputError(422, "real_data_suspected", "documents look like real data; demo mode accepts synthetic documents only"), { markers: kinds });
  }
}

/**
 * Читает все документы. Если ИИ недоступен, честно падает назад на MOCK и сообщает почему (aiError).
 * Документы читаются моделью параллельно: время ответа сайту ограничено одним запросом с одним повтором.
 * Перед отправкой в модель персональные данные маскируются; цитаты сверяются с тем текстом, что ушёл в модель.
 */
export async function extractAll(docs, { env = process.env, fetchImpl, signal } = {}) {
  const cfg = providerConfig(env);
  // «только синтетика» проверяется перед каждым провайдером, которому уходят документы, включая резервный
  const guard = (c) => assertSyntheticOnly(c, docs.map((d) => d.text));
  guard(cfg);
  let aiUnavailable = false, aiError = null, jsonFallback = false, used = null, fallbackFrom = null, cachedDocs = 0;
  const masked = {};
  const out = await Promise.all(docs.map(async (doc) => {
    const origin = doc.origin ?? "text";
    let ex, checkText = doc.text;
    // происхождение этого документа: кто его на самом деле прочитал (общий mode комплекта это скрывает)
    let source = { mode: "mock", provider: "mock", model: null };
    if (origin === "photo" && doc.extraction) {
      // фото уже прочитано моделью при загрузке (/api/read); второй раз модель не зовём
      ex = { type: doc.type, ...sanitizeExtraction(doc.extraction), mode: "ai" };
      source = { mode: "photo_upload", provider: null, model: null }; // провайдер известен только браузеру (ответ /api/read)
    } else if (cfg) {
      const m = maskPersonalData(doc.text);
      for (const [k, n] of Object.entries(m.masked)) masked[k] = (masked[k] ?? 0) + n;
      checkText = m.text;
      const key = cacheEnabled(cfg, env) ? cacheKey(cfg, `text:${doc.type}`, checkText) : null;
      try {
        ex = key ? extractionCache.get(key) : undefined;
        if (ex) { cachedDocs++; used ??= cfg; source = { mode: cfg.provider, provider: cfg.provider, model: cfg.model, cached: true }; }
        else {
          const budget = newBudget(cfg); // общий для основного и резервного провайдера
          const r = await withFallback(env, (c) => metaExtract({ ...doc, text: checkText }, c, fetchImpl, { signal, budget }), cfg, guard);
          ex = r.value; used = r.cfg; fallbackFrom ??= r.fallbackFrom;
          source = { mode: r.cfg.provider, provider: r.cfg.provider, model: r.cfg.model, ...(r.fallbackFrom ? { fallbackFrom: r.fallbackFrom } : {}) };
          if (key && !r.fallbackFrom) extractionCache.set(key, ex);
        }
        if (ex.jsonFallback) jsonFallback = true;
      } catch (e) {
        if (e?.kind === "cancelled") throw e; // клиент закрыл запрос: MOCK-разбор тоже не нужен
        aiUnavailable = true;
        aiError ??= e?.kind ?? "network";
        ex = mockExtract(doc);
        checkText = doc.text;
        source = { mode: "mock", provider: "mock", model: null, aiError: e?.kind ?? "network" };
      }
    } else {
      ex = mockExtract(doc);
    }
    // десятичный знак документа по его однозначным числам: помогает прочитать «32.500», но только без противоречий
    return { ...verifyExtraction({ ...doc, text: checkText }, ex), origin, source, numberContext: numberContext(doc.text) };
  }));
  const ai = cfg && !aiUnavailable ? used ?? cfg : null;
  return {
    mode: ai ? ai.provider : "mock",
    label: ai ? ai.label : "MOCK",
    model: ai ? ai.model : null,
    demoOnly: !!ai?.demoOnly,
    fallbackFrom, cachedDocs, masked,
    aiUnavailable, aiError, jsonFallback, docs: out,
  };
}
