// Проверка каталога правил: npm run rules:check [путь]. По умолчанию data/rules.json (если нет, демо-каталог).
import { loadCatalog, RULES_PATH, DEMO_RULES_PATH } from "../lib/rules.js";
import { existsSync } from "node:fs";

const path = process.argv[2] ?? (existsSync(RULES_PATH) ? RULES_PATH : DEMO_RULES_PATH);
const c = loadCatalog({ path });
console.log(`Каталог: ${c.source} · версия ${c.version} · записей ${c.rules.length} · проверенных (verified) ${c.verified ?? 0}`);
for (const e of c.errors) console.log(`  - ${e}`);
if (!c.rules.length || c.errors.some((e) => !/понижен до needs_review/.test(e))) process.exit(1);
