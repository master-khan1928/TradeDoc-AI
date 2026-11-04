// Бережём лимиты бесплатных моделей: ограничение частоты на нашей стороне и кэш результатов чтения.
import { createHash } from "node:crypto";

export const sha256 = (data) => createHash("sha256").update(data).digest("hex");

/**
 * Скользящее окно: не больше rpm запросов в минуту к одному провайдеру. Если слот освободится
 * быстрее maxWaitMs, ждём; иначе ошибка, чтобы не держать запрос пользователя бесконечно.
 */
export function createLimiter({ rpm, windowMs = 60000, now = () => Date.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  const stamps = [];
  return async function acquire(maxWaitMs = 15000) {
    for (;;) {
      const t = now();
      while (stamps.length && t - stamps[0] >= windowMs) stamps.shift();
      if (stamps.length < rpm) { stamps.push(t); return; }
      const wait = windowMs - (t - stamps[0]);
      if (wait > maxWaitMs) throw Object.assign(new Error("local rate limit"), { kind: "rate_local" });
      await sleep(wait);
    }
  };
}

const limiters = new Map();
/** Один ограничитель на провайдера и модель в процессе сервера. */
export function limiterFor(cfg) {
  const k = `${cfg.provider ?? "meta"}|${cfg.model}|${cfg.rpm ?? 10}`;
  if (!limiters.has(k)) limiters.set(k, createLimiter({ rpm: cfg.rpm ?? 10 }));
  return limiters.get(k);
}
export const resetLimiters = () => limiters.clear();

/**
 * Кэш результатов чтения по хэшу содержимого, только в памяти процесса. Включается только для бесплатных
 * провайдеров (там допустимы лишь синтетические документы), чтобы демо не расходовало лимит.
 * Для Meta и реальных документов не используется. Срок жизни ttlMs, размер не больше max записей.
 */
export function createCache({ max = 200, ttlMs = 30 * 60000, now = () => Date.now() } = {}) {
  const map = new Map();
  return {
    get(key) {
      const e = map.get(key);
      if (!e) return undefined;
      if (now() - e.at > ttlMs) { map.delete(key); return undefined; }
      map.delete(key); map.set(key, e); // свежесть для вытеснения
      return e.value;
    },
    set(key, value) {
      map.set(key, { at: now(), value });
      while (map.size > max) map.delete(map.keys().next().value);
    },
    clear: () => map.clear(),
    get size() { return map.size; },
  };
}
export const extractionCache = createCache();

export function cacheEnabled(cfg, env = process.env) {
  return !!cfg?.demoOnly && env.LLM_CACHE !== "off";
}
export const cacheKey = (cfg, kind, content) => sha256(`${cfg.provider}|${cfg.model}|${kind}|${sha256(content)}`);
