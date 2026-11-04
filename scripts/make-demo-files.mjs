// Демо-файлы для показа загрузки: три PDF комплекта (кириллица и латиница), исправленный CMR и «фото» PNG.
//   npm run demo-files            -> папка demo/
// Нужны devDependencies (pdf-lib, @pdf-lib/fontkit): npm install без --omit=dev. Документы синтетические.
import { mkdir, writeFile } from "node:fs/promises";
import { buildDemoPack } from "./lib/demo-pack.mjs";

const out = new URL("../demo/", import.meta.url);
await mkdir(out, { recursive: true });
const pack = await buildDemoPack();
for (const f of pack.files) {
  await writeFile(new URL(f.name, out), f.bytes);
  console.log(`${f.name.padEnd(28)} ${f.docType.padEnd(8)} ${(f.bytes.length / 1024).toFixed(1)} КБ`);
}
console.log(`\nЗаложенные ошибки: ${pack.errors.join(", ")}. 04-cmr-corrected.pdf исправляет вес брутто в CMR.`);
