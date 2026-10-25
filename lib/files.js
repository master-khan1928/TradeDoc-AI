// Приём одного файла: определение формата по первым байтам и чтение текстового слоя PDF в памяти.
// На диск ничего не пишется, текст документа не логируется.
import { getDocumentProxy, extractText } from "unpdf";

export const MAX_FILE_BYTES = 1_536_000; // 1,5 МБ: хостинги режут тело запроса около 4,5 МБ, файл идёт отдельным запросом
export const PAGE_BREAK = "\n--- page ---\n";
const PDF_TIMEOUT_MS = 15000;

export class InputError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

/** Формат по сигнатуре, а не по имени файла и не по заголовку браузера. */
export function sniffFormat(buf) {
  const b = buf.subarray(0, 12);
  const ascii = (from, to) => b.subarray(from, to).toString("latin1");
  if (ascii(0, 5) === "%PDF-") return { kind: "pdf", mime: "application/pdf" };
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { kind: "image", mime: "image/jpeg" };
  if (b[0] === 0x89 && ascii(1, 4) === "PNG") return { kind: "image", mime: "image/png" };
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return { kind: "image", mime: "image/webp" };
  // обычный текст: валидный UTF-8 без управляющих символов (кроме табуляции, переводов строки и страницы)
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(buf);
    if (!/[\u0000-\u0008\u000b\u000e-\u001f\u007f]/.test(text)) return { kind: "text", mime: "text/plain", text };
  } catch {}
  return null;
}

/** Текстовый слой PDF по страницам. Скан без текста даёт пустые строки. */
export async function readPdfText(buf) {
  let pdf;
  const work = (async () => {
    pdf = await getDocumentProxy(new Uint8Array(buf), { verbosity: 0, isEvalSupported: false, disableFontFace: true, useSystemFonts: false });
    const { text } = await extractText(pdf, { mergePages: false });
    return text.map((p) => p.replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").trim());
  })();
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new InputError(422, "pdf_timeout", "PDF took too long to read")), PDF_TIMEOUT_MS); });
  try {
    return await Promise.race([work, timeout]);
  } catch (e) {
    if (e instanceof InputError) throw e;
    throw new InputError(422, "pdf_unreadable", "PDF could not be read (damaged or password-protected)");
  } finally {
    clearTimeout(timer);
    try { await pdf?.destroy(); } catch {}
  }
}
