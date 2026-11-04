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

export const MAX_PDF_PAGES = 20;
// Активное содержимое PDF: скрипты, запуск программ, вложенные файлы, мультимедиа, формы XFA.
// Мы только извлекаем текст и ничего не исполняем, но такие файлы для проверки документов не нужны: отклоняем.
// Ссылки (/URI) не отклоняем: они бывают в обычных инвойсах, а по ссылкам сервис никогда не переходит.
const ACTIVE_PDF = /\/(JavaScript|JS|Launch|EmbeddedFiles?|RichMedia|XFA|SubmitForm|ImportData)\b/;

/** Текстовый слой PDF по страницам. Скан без текста даёт пустые строки. */
export async function readPdfText(buf) {
  if (ACTIVE_PDF.test(buf.toString("latin1"))) throw new InputError(422, "pdf_active_content", "PDF contains active content (scripts, attachments or forms)");
  let pdf;
  const work = (async () => {
    pdf = await getDocumentProxy(new Uint8Array(buf), { verbosity: 0, isEvalSupported: false, disableFontFace: true, useSystemFonts: false });
    if (pdf.numPages > MAX_PDF_PAGES) throw new InputError(422, "pdf_too_many_pages", `PDF has more than ${MAX_PDF_PAGES} pages`);
    // то же через pdf.js: ключи могут быть спрятаны в сжатых потоках объектов, которые байтовый поиск не видит
    const [js, files] = await Promise.all([pdf.getJSActions?.().catch(() => null), pdf.getAttachments?.().catch(() => null)]);
    if ((js && Object.keys(js).length) || (files && Object.keys(files).length)) throw new InputError(422, "pdf_active_content", "PDF contains active content (scripts or attachments)");
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
