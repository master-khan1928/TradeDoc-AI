// Первый запуск с ключом: один маленький запрос к модели на синтетическом документе.
//   npm run probe              текст
//   npm run probe -- --image   то же с синтетическим изображением документа (чтение фото)
// Ключ берётся только из окружения (META_API_KEY, META_MODEL, META_BASE_URL, META_TIMEOUT_MS) и никуда не выводится.
import { metaConfig } from "../lib/extract/meta.js";
import { runProbe } from "../lib/probe.js";

const env = { ...process.env, AI_MODE: undefined }; // AI_MODE=mock здесь не мешает: зонд проверяет именно ключ
if (!env.META_API_KEY) {
  console.log("Нужен META_API_KEY. Задайте ключ в окружении этого сеанса (см. README, «Первый запуск с ключом»).");
  process.exit(2);
}
if (!env.META_MODEL) {
  console.log("Нужен META_MODEL: идентификатор модели из документации или кабинета Meta. В коде он не зашит.");
  process.exit(2);
}
const code = await runProbe({ cfg: metaConfig(env), image: process.argv.includes("--image") });
process.exit(code);
