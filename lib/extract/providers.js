// Провайдеры чтения документов. Один интерфейс для всех: OpenAI-совместимый POST /chat/completions,
// ответ JSON по схеме (lib/extract/meta.js: callModel). Провайдер выбирается переменной LLM_PROVIDER.
//
//   mock        разбор по шаблону, НЕ ИИ (по умолчанию)
//   gemini      Google Gemini, бесплатный ключ из Google AI Studio      ┐ бесплатные тарифы:
//   groq        Groq, бесплатный ключ                                   │ провайдер может использовать данные
//   openrouter  OpenRouter                                              ┘ для улучшения продуктов -> только синтетика
//   meta        Meta Model API (слой подготовлен, ждём ключ)
//
// Адреса и идентификаторы моделей взяты из официальной документации 03.11.2026 (см. README, «Режимы ИИ»).
// Где документация модель не подтверждает, модель по умолчанию не задана: её нужно указать переменной.

export const PROVIDERS = {
  meta: {
    label: "Meta", keyVar: "META_API_KEY", modelVar: "META_MODEL", baseVar: "META_BASE_URL",
    base: "https://api.meta.ai/v1", defaultModel: null, responseFormat: "json_schema", demoOnly: false,
  },
  gemini: {
    // https://aistudio.google.com/docs/openai : base_url .../v1beta/openai/, image_url с data URI
    label: "Google Gemini", keyVar: "GEMINI_API_KEY", modelVar: "GEMINI_MODEL", baseVar: "GEMINI_BASE_URL",
    base: "https://generativelanguage.googleapis.com/v1beta/openai", defaultModel: null, responseFormat: "json_schema", demoOnly: true,
  },
  groq: {
    // https://console.groq.com/docs/openai и /docs/vision: модель с изображениями qwen/qwen3.8-27b, JSON mode (json_object)
    label: "Groq", keyVar: "GROQ_API_KEY", modelVar: "GROQ_MODEL", baseVar: "GROQ_BASE_URL",
    base: "https://api.groq.com/openai/v1", defaultModel: "qwen/qwen3.8-27b", responseFormat: "json_object", demoOnly: true,
  },
  openrouter: {
    // https://openrouter.ai/docs/quickstart: base https://openrouter.ai/api/v1, Bearer-ключ; модель задаётся вручную
    label: "OpenRouter", keyVar: "OPENROUTER_API_KEY", modelVar: "OPENROUTER_MODEL", baseVar: "OPENROUTER_BASE_URL",
    base: "https://openrouter.ai/api/v1", defaultModel: null, responseFormat: "json_schema", demoOnly: true,
  },
};
export const PROVIDER_NAMES = ["mock", ...Object.keys(PROVIDERS)];

/**
 * Какой провайдер выбран. LLM_PROVIDER задаёт его явно. Без LLM_PROVIDER, как и раньше:
 * META_API_KEY + META_MODEL включают meta, иначе mock. AI_MODE=mock всегда даёт mock.
 */
export function activeProviderName(env = process.env) {
  if (env.AI_MODE === "mock") return "mock";
  const want = String(env.LLM_PROVIDER ?? "").trim().toLowerCase();
  if (want) return PROVIDER_NAMES.includes(want) ? want : "mock";
  return env.META_API_KEY && env.META_MODEL ? "meta" : "mock";
}

/** Настройки провайдера или null, если это mock или не хватает ключа/модели. Ключ в логи не попадает. */
export function providerConfig(env = process.env, name = activeProviderName(env)) {
  const p = PROVIDERS[name];
  if (!p || env.AI_MODE === "mock") return null;
  const key = env[p.keyVar], model = env[p.modelVar] || p.defaultModel;
  if (!key || !model) return null;
  const t = Number(env.LLM_TIMEOUT_MS ?? env.META_TIMEOUT_MS);
  const rpm = Number(env.LLM_RPM);
  return {
    provider: name, label: p.label, key, model,
    // свой лимит частоты: бесплатные тарифы 10 в минуту (осторожно, числа провайдера в кабинете), Meta 60
    timeoutMs: t > 0 ? t : 25000, rpm: rpm > 0 ? rpm : p.demoOnly ? 10 : 60,
    base: (env[p.baseVar] || p.base).replace(/\/$/, ""),
    responseFormat: p.responseFormat, demoOnly: p.demoOnly,
  };
}

/** Резервный провайдер (LLM_FALLBACK), если он задан, настроен и отличается от основного. */
export function fallbackConfig(env = process.env, primary = providerConfig(env)) {
  const name = String(env.LLM_FALLBACK ?? "").trim().toLowerCase();
  if (!name || name === primary?.provider) return null;
  return providerConfig(env, name);
}

/** Чего не хватает выбранному провайдеру: имена переменных, без значений. */
export function missingSettings(env = process.env, name = activeProviderName(env)) {
  const p = PROVIDERS[name];
  if (!p) return [];
  return [p.keyVar, ...(p.defaultModel ? [] : [p.modelVar])].filter((v) => !env[v]);
}

/** Описание режима для сайта, отчёта и README: всегда честно, какой режим реально работает. */
export function describeMode(env = process.env) {
  const name = activeProviderName(env), cfg = providerConfig(env, name), fb = fallbackConfig(env, cfg);
  return {
    provider: cfg ? name : "mock",
    requested: name,
    label: cfg ? cfg.label : "MOCK",
    model: cfg?.model ?? null,
    demoOnly: !!cfg?.demoOnly,
    fallback: fb ? { provider: fb.provider, label: fb.label, model: fb.model } : null,
    missing: cfg || name === "mock" ? [] : missingSettings(env, name),
    meta: name === "meta" && cfg ? "active" : "waiting_key", // «слой Meta подготовлен, ждём ключ»
  };
}

// временные сбои, при которых имеет смысл резервный провайдер
const FALLBACK_KINDS = new Set(["rate", "rate_local", "server", "network", "timeout"]);

/**
 * Вызов с резервным провайдером: fn(cfg) у основного; при лимите или сбое сети тот же вызов у резервного.
 * guard(cfg) проверяет допустимость передачи именно этому провайдеру (например, «только синтетика» для
 * бесплатного тарифа). Если резерв по политике недопустим, документ ему не отправляется: остаётся ошибка основного.
 * Возвращает { value, cfg, fallbackFrom }.
 */
export async function withFallback(env, fn, primary = providerConfig(env), guard = null) {
  try {
    return { value: await fn(primary), cfg: primary, fallbackFrom: null };
  } catch (e) {
    const fb = fallbackConfig(env, primary);
    if (!fb || !FALLBACK_KINDS.has(e?.kind)) throw e;
    try { guard?.(fb); } catch { throw e; }
    return { value: await fn(fb), cfg: fb, fallbackFrom: primary.provider };
  }
}
