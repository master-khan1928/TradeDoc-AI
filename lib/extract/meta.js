// Режим META: чтение документа моделью Muse Spark через OpenAI-совместимый API.
// В этой сессии НЕ запускался: нет ключа и закрыта сеть. Проверяется у владельца ключа.
// Идентификатор модели берётся только из META_MODEL, потому что у Meta он меняется.

const FIELD_KEYS = [
  "number", "reference", "date", "shipment_date", "seller", "buyer", "currency",
  "hs_code", "incoterms", "total", "gross_weight", "net_weight", "packages",
];

const fieldSchema = {
  type: ["object", "null"],
  additionalProperties: false,
  required: ["value", "page", "quote", "confidence"],
  properties: {
    value: { type: "string" },
    page: { type: "integer", minimum: 1 },
    quote: { type: "string", description: "exact text copied from the page" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
};

export const EXTRACTION_SCHEMA = {
  name: "cargo_document",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["fields", "items"],
    properties: {
      fields: {
        type: "object",
        additionalProperties: false,
        required: FIELD_KEYS,
        properties: Object.fromEntries(FIELD_KEYS.map((k) => [k, fieldSchema])),
      },
      items: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["n", "desc", "qty", "unit", "price", "total", "page", "quote"],
          properties: {
            n: { type: "integer" },
            desc: { type: "string" },
            qty: { type: ["string", "null"] },
            unit: { type: ["string", "null"] },
            price: { type: ["string", "null"] },
            total: { type: ["string", "null"] },
            page: { type: "integer", minimum: 1 },
            quote: { type: "string" },
          },
        },
      },
    },
  },
};

const SYSTEM =
  "You extract fields from one trade document (invoice, packing list or CMR). " +
  "Rules: copy values exactly as written. Never guess or compute. If a field is not in the text, return null for it. " +
  "For every field give the page number and the exact quote (one line copied from the page). " +
  "Return only JSON that matches the schema.";

export function metaConfig(env = process.env) {
  const key = env.META_API_KEY, model = env.META_MODEL;
  if (!key || !model || env.AI_MODE === "mock") return null;
  return { key, model, base: (env.META_BASE_URL || "https://api.meta.ai/v1").replace(/\/$/, "") };
}

export async function metaExtract(doc, cfg, fetchImpl = fetch) {
  const res = await fetchImpl(`${cfg.base}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${cfg.key}` },
    body: JSON.stringify({
      model: cfg.model,
      temperature: 0,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `Document type: ${doc.type}\n\n${doc.text}` },
      ],
      response_format: { type: "json_schema", json_schema: EXTRACTION_SCHEMA },
    }),
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) throw new Error(`META API ${res.status}`);
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  const parsed = typeof content === "string" ? JSON.parse(content) : null;
  if (!parsed || typeof parsed !== "object") throw new Error("META API returned no JSON");
  const fields = {};
  for (const [k, v] of Object.entries(parsed.fields ?? {})) if (v) fields[k] = v;
  return { type: doc.type, fields, items: parsed.items ?? [], mode: "meta" };
}
