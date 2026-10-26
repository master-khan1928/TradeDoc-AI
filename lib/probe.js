// Проверка подключения к модели Meta одним маленьким запросом на СИНТЕТИЧЕСКОМ документе.
// В вывод не попадают ни ключ, ни текст документа, ни ответ модели: только статус, диагноз и счётчики.
import { callModel, MetaError, EXTRACTION_SCHEMA, IMAGE_EXTRACTION_SCHEMA, SYSTEM_PROMPTS } from "./extract/meta.js";
import { verifyExtraction } from "./extract/verify.js";
import { renderTextPng } from "./text-image.js";

// вымышленный инвойс; для режима --image рисуется заглавными буквами
export const PROBE_DOC = [
  "INVOICE",
  "Invoice No: INV-2026-0042",
  "Date: 2026-10-07",
  "Seller: Altyn Bidai LLP, Almaty, Kazakhstan",
  'Buyer: OOO "Tashkent Agro", Uzbekistan',
  "Currency: USD",
  "HS Code: 1101001500",
  "1 | Wheat flour first grade | 220 | bags | 11.00 | 2420.00",
  "Total: 2420.00",
  "Gross weight: 11220 kg",
  "Net weight: 10780 kg",
  "Packages: 220",
];

export const DIAGNOSIS = {
  ok: "модель ответила, ответ разобран",
  auth: "ключ не принят или нет доступа к модели: проверьте META_API_KEY и права ключа",
  model: "неверный идентификатор модели: проверьте META_MODEL (и META_BASE_URL)",
  rate: "превышен лимит запросов: подождите и повторите",
  network: "сеть недоступна или сервер не найден: проверьте интернет и META_BASE_URL",
  timeout: "модель не ответила вовремя (META_TIMEOUT_MS)",
  server: "ошибка на стороне сервиса модели (5xx): повторите позже",
  bad_response: "ответ не по схеме: модель вернула не JSON или JSON без нужных полей",
  bad_request: "запрос отклонён (400): формат запроса не принят",
  schema_unsupported: "response_format json_schema не поддерживается",
};

/**
 * Один запрос (и при явном отказе json_schema один запрос в запасном режиме). Без повторов: нужен честный статус.
 * Возвращает код выхода: 0 — работает, 1 — не работает.
 */
export async function runProbe({ cfg, image = false, fetchImpl = fetch, log = console.log }) {
  const host = (() => { try { return new URL(cfg.base).host; } catch { return "(неверный META_BASE_URL)"; } })();
  log("TradeDoc AI: проверка подключения к модели Meta (синтетический документ)");
  log(`Модель: ${cfg.model} · сервер: ${host} · режим: ${image ? "изображение (--image)" : "текст"}`);

  let messages, schema, pageText;
  if (image) {
    const img = renderTextPng(PROBE_DOC, { scale: 3, noise: 0.08 }); // лёгкий шум, чтобы файл остался маленьким
    pageText = null; // для фото текст страницы даёт сама модель (transcription)
    schema = IMAGE_EXTRACTION_SCHEMA;
    messages = [
      { role: "system", content: SYSTEM_PROMPTS.image },
      { role: "user", content: [{ type: "text", text: "Document type: invoice" }, { type: "image_url", image_url: { url: `data:image/png;base64,${img.png.toString("base64")}` } }] },
    ];
    log(`Изображение: PNG ${img.width}×${img.height}, ${Math.round(img.png.length / 1024)} КБ`);
  } else {
    pageText = PROBE_DOC.join("\n");
    schema = EXTRACTION_SCHEMA;
    messages = [{ role: "system", content: SYSTEM_PROMPTS.text }, { role: "user", content: `Document type: invoice\n\n${pageText}` }];
  }

  let schemaStatus = null;
  const t0 = Date.now();
  let r;
  try {
    r = await callModel(cfg, messages, schema, fetchImpl, { retries: 0, quiet: true, onFallback: (s) => { schemaStatus = s; } });
  } catch (e) {
    const kind = e instanceof MetaError ? e.kind : "network";
    log(`HTTP-статус: ${e?.status ?? "нет ответа"}`);
    log(`Диагноз: ${DIAGNOSIS[kind] ?? kind}${image && kind === "bad_request" ? " (возможно, модель не принимает изображения)" : ""}`);
    log(`response_format json_schema: ${schemaStatus ? `НЕ поддерживается (HTTP ${schemaStatus}); запасной режим JSON тоже не сработал` : "не удалось проверить"}`);
    log("Ключ, тексты документов и ответ модели не выводятся.");
    return 1;
  }
  const ms = Date.now() - t0;
  const text = image ? String(r.parsed.transcription ?? "") : pageText;
  if (image && !text.trim()) {
    log(`HTTP-статус: ${r.status}`);
    log(`Диагноз: ${DIAGNOSIS.bad_response} (нет transcription)`);
    return 1;
  }
  const v = verifyExtraction({ text }, { fields: r.fields, items: r.items });
  log(`HTTP-статус: ${r.status}${r.jsonFallback ? " (запасной режим JSON)" : " (json_schema)"}`);
  log(`Диагноз: ${DIAGNOSIS.ok}`);
  log(`response_format json_schema: ${r.jsonFallback ? `НЕ поддерживается (HTTP ${schemaStatus}); работает запасной режим «верни JSON»` : "поддерживается"}`);
  log(`Проверку цитат прошло: полей ${Object.keys(v.fields).length} из ${Object.keys(r.fields).length}, строк товаров ${v.items.length} из ${r.items.length}${image ? " (сверка с расшифровкой модели)" : ""}`);
  log(`Время ответа: ${(ms / 1000).toFixed(1)} с`);
  log("Ключ, тексты документов и ответ модели не выводятся.");
  return 0;
}
