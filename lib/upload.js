// Один загруженный файл -> документ для проверки. Всё в памяти: файл не сохраняется и не логируется.
//   PDF с текстовым слоем: текст читает код (unpdf), ИИ не нужен, работает и в MOCK.
//   Фото / скан: читает только модель (режим META); цитаты проверяются по её дословной расшифровке.
import { sniffFormat, readPdfText, InputError, PAGE_BREAK } from "./files.js";
import { detectType } from "./doctype.js";
import { metaConfig, metaExtractImage } from "./extract/meta.js";
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
    return { kind: "text", origin: "text", text, pages: 1, ...resolveType(type, text) };
  }

  if (fmt.kind === "pdf") {
    const pages = await readPdfText(buf);
    if (pages.join("").replace(/\s+/g, "").length < 20) {
      throw new InputError(422, "pdf_no_text", "PDF has no text layer (looks like a scan); upload the pages as images");
    }
    const text = pages.join(PAGE_BREAK);
    checkLength(text);
    return { kind: "pdf", origin: "pdf", text, pages: pages.length, ...resolveType(type, text) };
  }

  // изображение
  const cfg = metaConfig(env);
  if (!cfg) throw new InputError(422, "photo_needs_meta", "reading photos needs META mode (META_API_KEY and META_MODEL)");
  let ex;
  try {
    ex = await metaExtractImage({ mime: fmt.mime, base64: buf.toString("base64") }, DOC_TYPES.has(type) ? type : null, cfg, fetchImpl);
  } catch {
    throw new InputError(502, "ai_unavailable", "the model could not read the image; try again or upload a PDF");
  }
  const text = ex.transcription.replace(/\r/g, "").trim();
  checkLength(text);
  const resolved = resolveType(type, text);
  const verified = verifyExtraction({ text }, { type: resolved.type, fields: ex.fields, items: ex.items });
  return {
    kind: "photo", origin: "photo", text, pages: 1, ...resolved,
    extraction: { fields: verified.fields, items: verified.items },
    dropped: verified.dropped,
  };
}
