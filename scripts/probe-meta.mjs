// Первый запуск с ключом: один маленький запрос к модели на синтетическом документе.
//   npm run probe              текст
//   npm run probe -- --image   то же с синтетическим изображением документа (чтение фото)
// Провайдер: LLM_PROVIDER (gemini | groq | openrouter | meta); без него, как раньше, Meta по META_API_KEY.
// Ключи берутся только из окружения и никуда не выводятся.
import { activeProviderName, providerConfig, missingSettings, PROVIDERS } from "../lib/extract/providers.js";
import { runProbe } from "../lib/probe.js";

const env = { ...process.env, AI_MODE: undefined }; // AI_MODE=mock здесь не мешает: зонд проверяет именно ключ
const name = activeProviderName(env) === "mock" ? "meta" : activeProviderName(env);
const missing = missingSettings(env, name);
if (missing.length) {
  const p = PROVIDERS[name];
  for (const v of missing) {
    console.log(v === p.keyVar
      ? `Нужен ${v}. Задайте ключ в окружении этого сеанса (см. README, «Первый запуск с ключом»).`
      : `Нужен ${v}: идентификатор модели из официальной документации провайдера. В коде он не зашит.`);
  }
  if (name === "meta" && !env.LLM_PROVIDER) console.log("Для бесплатной модели задайте LLM_PROVIDER=gemini или groq и её ключ (README, «Режимы ИИ»).");
  process.exit(2);
}
const code = await runProbe({ cfg: providerConfig(env, name), image: process.argv.includes("--image") });
process.exit(code);
