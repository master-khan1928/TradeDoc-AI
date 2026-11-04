// Один загруженный файл -> документ для проверки. Всё в памяти: файл не сохраняется и не логируется.
//   PDF с текстовым слоем: текст читает код (unpdf), ИИ не нужен, работает и в MOCK.
//   Фото / скан: читает только модель (LLM_PROVIDER: gemini | groq | openrouter | meta); цитаты проверяются
//   по её дословной расшифровке.
import { sniffFormat, readPdfText, InputError, PAGE_BREAK } from "./files.js";
import { detectType } from "./doctype.js";
import { metaExtractImage } from "./extract/meta.js";
import { providerConfig, withFallback } from "./extract/providers.js";
import { extractionCache, cacheEnabled, cacheKey, sha256 } from "./extract/limits.js";
import { assertSyntheticOnly } from "./extract/index.js";
import { verifyExtraction } from "./extract/verify.js";
import { MAX_DOC_CHARS, DOC_TYPES } from "./pipeline.js";

function resolveType(userType, text) {
  if (DOC_TYPES.has(userType)) return { type: userType, typeSource: "user" };
  const d = detectType(text);
  return { type: d.type, typeSource: d.type ? "detected" : "unknown" };
}

function checkLength(text) {
  if (text.length > MAX_DOC_CHARS) throw new InputError(422, "doc_too_long", `document is longer than ${MAX_DOC_CHARS} characters`);
}

export async function readUpload({ buf, type }, { env = process.env, fetchImpl } = {}) {
  if (!buf?.length) throw new InputError(400, "empty_file", "file is empty");
  const fmt = sniffFormat(buf);
  if (!fmt) throw new InputError(415, "unsupported_format", "supported formats: PDF, JPG, PNG, WEBP, TXT");

  if (fmt.kind === "text") {
    const text = fmt.text.replace(/\r/g, "").trim();
    if (!text) throw new InputError(400, "empty_file", "file is empty");
    checkLength(text);
    return { kind: "text", origin: "text", text, pages: 1, ...resolveType(type, text), sha256: sha256(buf) };
  }

  if (fmt.kind === "pdf") {
    const pages = await readPdfText(buf);
    if (pages.join("").replace(/\s+/g, "").length < 20) {
      throw new InputError(422, "pdf_no_text", "PDF has no text layer (looks like a scan); upload the pages as images");
    }
    const text = pages.join(PAGE_BREAK);
    checkLength(text);
    return { kind: "pdf", origin: "pdf", text, pages: pages.length, ...resolveType(type, text), sha256: sha256(buf) };
  }

  // изображение: читает только модель выбранного провайдера (LLM_PROVIDER)
  const cfg = providerConfig(env);
  if (!cfg) throw new InputError(422, "photo_needs_ai", "reading photos needs an AI provider (LLM_PROVIDER with its key)");
  const t = DOC_TYPES.has(type) ? type : null;
  const key = cacheEnabled(cfg, env) ? cacheKey(cfg, `image:${t}`, buf) : null;
  let ex = key ? extractionCache.get(key) : undefined, used = cfg, fallbackFrom = null;
  const cached = !!ex;
  if (!ex) {
    try {
      const r = await withFallback(env, (c) => metaExtractImage({ mime: fmt.mime, base64: buf.toString("base64") }, t, c, fetchImpl), cfg);
      ex = r.value; used = r.cfg; fallbackFrom = r.fallbackFrom;
      if (key && !fallbackFrom) extractionCache.set(key, ex);
    } catch (e) {
      // reason: вид сбоя (auth, model, rate, timeout, network…), чтобы сайт объяснил причину, а не «что-то пошло не так»
      throw Object.assign(new InputError(502, "ai_unavailable", "the model could not read the image; try again or upload a PDF"), { reason: e?.kind ?? "network" });
    }
  }
  const text = ex.transcription.replace(/\r/g, "").trim();
  checkLength(text);
  // картинку до отправки не проверить (распознавания у нас нет); проверяем расшифровку и при реальных данных её отбрасываем
  try { assertSyntheticOnly(used, [text]); } catch (e) { e.afterSend = true; throw e; }
  const resolved = resolveType(type, text);
  const verified = verifyExtraction({ text }, { type: resolved.type, fields: ex.fields, items: ex.items, itemsOverLimit: ex.itemsOverLimit });
  return {
    kind: "photo", origin: "photo", text, pages: 1, ...resolved,
    // отброшенное и неполнота едут вместе с разбором: при проверке /api/check они снова учитываются (№37)
    extraction: { fields: verified.fields, items: verified.items, ...(verified.dropped.length ? { dropped: verified.dropped } : {}) },
    dropped: verified.dropped,
    provider: { name: used.provider, label: used.label, model: used.model, demoOnly: used.demoOnly, fallbackFrom }, cached,
    sha256: sha256(buf), // для журнала проверки: какой файл читали (сам файл не хранится)
  };
}
