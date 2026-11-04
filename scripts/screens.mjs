// Снимки экранов для сравнения «до / после» дизайна (Playwright, Chromium, режим MOCK, синтетические документы).
//   node scripts/screens.mjs before     старая одностраничная разметка -> docs/screens/before/
//   node scripts/screens.mjs after      вкладки, ширины 1440, 1024, 390 -> docs/screens/after/
// Сервер поднимается сам на свободном порту. Папка docs/screens/ в git не попадает (.gitignore).
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

process.env.AI_MODE = "mock";
process.env.RATE_LIMIT_PER_MIN = "1000";
const { createApp } = await import("./server.mjs");

const phase = process.argv[2] === "after" ? "after" : "before";
const out = fileURLToPath(new URL(`../docs/screens/${phase}/`, import.meta.url));
mkdirSync(out, { recursive: true });

const app = createApp();
await new Promise((r) => app.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${app.address().port}`;
const browser = await chromium.launch();
const shots = [];
// страница снимается целиком, элемент по размеру элемента
const shot = async (target, name, page) => {
  await target.screenshot({ path: out + name, ...(target === page ? { fullPage: true } : {}) });
  shots.push(name);
};

async function fresh(page, hash = "") {
  await page.goto(base + "/");
  await page.evaluate(() => localStorage.clear());
  await page.goto(base + "/" + hash);
  await page.waitForTimeout(500);
}

if (phase === "before") {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await fresh(page);
  await shot(page, "01-home.png", page);
  await shot(page.locator('section[aria-labelledby="packTitle"]'), "02-documents.png", page);
  await page.locator("#consent").check();
  await page.locator("#run").click();
  await page.locator("#findings article").first().waitFor();
  await page.waitForTimeout(800);
  await shot(page.locator("#out"), "03-result.png", page);
  await shot(page.locator("#casePanel"), "04-case.png", page);
  await page.evaluate(() => { window.print = () => {}; });
  await page.locator("#printBtn").click();
  await page.emulateMedia({ media: "print" });
  await shot(page, "05-print.png", page);
} else {
  for (const width of [1440, 1024, 390]) {
    const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 900 } });
    await fresh(page, "#documents");
    await shot(page, `${width}-01-documents.png`, page);
    await page.locator("#consent").check();
    await page.locator("#run").click();
    await page.locator("#findings article").first().waitFor();
    await page.waitForTimeout(1400);
    await shot(page, `${width}-02-check.png`, page);
    await page.locator("#tabbtn-case").click();
    await page.waitForTimeout(300);
    await shot(page, `${width}-03-case.png`, page);
    await page.locator("#tabbtn-report").click();
    await page.locator("#mkLetter").click();
    await page.waitForTimeout(300);
    await shot(page, `${width}-04-report.png`, page);
    if (width === 1440) {
      await page.evaluate(() => { window.print = () => {}; });
      await page.locator("#printBtn").click();
      await page.emulateMedia({ media: "print" });
      await shot(page, `${width}-05-print.png`, page);
    }
    await page.close();
  }
}
await browser.close();
await new Promise((r) => app.close(r));
console.log(`${phase}: ${shots.length} снимков в docs/screens/${phase}/`);
for (const s of shots) console.log("  " + s);
