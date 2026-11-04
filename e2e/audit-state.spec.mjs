// Регрессии по аудиту 05.11.2026, группа 2: состояние интерфейса. Сценарии повторяют шаги из аудита.
// Режим MOCK, документы синтетические; ответы сервера при необходимости задерживаются через page.route.
import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";

const demo = (f) => fileURLToPath(new URL(`../demo/${f}`, import.meta.url));
const openRaw = async (page, id) => { if (await page.locator(`#t-${id}`).isHidden()) await page.locator(`[data-toggle="${id}"]`).click(); };
const setDoc = async (page, id, text) => { await openRaw(page, id); await page.locator(`#t-${id}`).fill(text); };
const PACK = {
  invoice: "INVOICE\nInvoice No: INV-1\nSeller: Altyn Bidai LLP\nBuyer: Tashkent Agro\nGross weight: 100 kg",
  packing: "PACKING LIST\nReference: INV-1\nShipper: Altyn Bidai LLP\nConsignee: Tashkent Agro\nGross weight: 100 kg",
  cmr: "CMR\nInvoice reference: INV-1\nGross weight: 120 kg",
};
const fillPack = async (page, pack = PACK) => { for (const [id, text] of Object.entries(pack)) await setDoc(page, id, text); };

/** Задержать ответы на путь: held() — сколько ждут, release() — отпустить все, count() — сколько было запросов. */
async function hold(page, path) {
  const waiting = [];
  let count = 0;
  await page.route(`**${path}`, async (route) => { count++; await new Promise((r) => waiting.push(r)); await route.continue(); });
  return { release: () => { while (waiting.length) waiting.shift()(); }, held: () => waiting.length, count: () => count };
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.goto("/");
  await page.locator("#consent").check();
});

test("№31: смена языка во время проверки не разблокирует кнопку; №4: ответ не попадает в другое дело", async ({ page }) => {
  await fillPack(page);
  const h = await hold(page, "/api/check");
  await page.locator("#run").click();
  await expect.poll(h.held).toBe(1);
  await page.locator('[data-lang="en"]').click();
  await expect(page.locator("#run")).toBeDisabled();
  // во время запроса создано новое дело B
  await page.locator("#tabbtn-case").click();
  await page.locator("#caseNew").click();
  h.release();
  await expect(page.locator(".stale-note").first()).toBeAttached();
  await expect(page.locator("#caseHist")).toContainText("No checks yet");
  await expect(page.locator("#run")).toBeEnabled();
});

test("№31: старый ответ не перезаписывает документы, исправленные во время запроса", async ({ page }) => {
  await fillPack(page);
  const h = await hold(page, "/api/check");
  await page.locator("#run").click();
  await expect.poll(h.held).toBe(1);
  await page.locator("#tabbtn-documents").click();
  await setDoc(page, "cmr", PACK.cmr.replace("120", "100"));
  h.release();
  await expect(page.locator(".stale-note").first()).toBeAttached();
  await page.locator("#tabbtn-case").click();
  await expect(page.locator("#caseHist")).toContainText("Проверок ещё не было");
});

test("№32: отзыв согласия останавливает очередь загрузки", async ({ page }) => {
  const h = await hold(page, "/api/read");
  await page.locator("#fileAll").setInputFiles([demo("01-invoice.pdf"), demo("02-packing-list.pdf")]);
  await expect.poll(h.held).toBe(1);
  await page.locator("#consent").uncheck();
  h.release();
  await expect(page.locator("#dropStatus")).toContainText("Согласие отозвано");
  await page.waitForTimeout(300);
  expect(h.count()).toBe(1);
});

test("№6: после правки документа печать и письмо заблокированы, результат помечен устаревшим", async ({ page }) => {
  await fillPack(page);
  await page.locator("#run").click();
  await expect(page.locator("#findings")).toContainText("Вес брутто не совпадает");
  await page.locator("#tabbtn-documents").click();
  await setDoc(page, "cmr", PACK.cmr.replace("120", "100"));
  await page.locator("#tabbtn-report").click();
  await expect(page.locator("#printBtn")).toBeDisabled();
  await expect(page.locator("#mkLetter")).toBeDisabled();
  await expect(page.locator("#reportBody .stale-note")).toBeVisible();
});

test("№33: «Удалить все мои данные» очищает замечания, письмо и печатный отчёт", async ({ page }) => {
  await fillPack(page, { ...PACK, invoice: PACK.invoice.replace("Tashkent Agro", "PRIVATE-CANARY-CLIENT") });
  await page.locator("#run").click();
  await expect(page.locator("#findings article").first()).toBeVisible();
  await page.locator("#tabbtn-report").click();
  await page.locator("#mkLetter").click();
  await expect(page.locator("#letter")).toBeVisible();
  await page.evaluate(() => { window.print = () => {}; });
  await page.locator("#printBtn").click();
  await expect(page.locator("#printReport")).toContainText("PRIVATE-CANARY-CLIENT");
  page.on("dialog", (d) => d.accept());
  await page.locator("#tabbtn-case").click();
  await page.locator("#caseWipe").click();
  for (const sel of ["#findings", "#reviewList", "#letter", "#printReport", "#checks"]) {
    expect(await page.locator(sel).textContent(), sel).not.toContain("PRIVATE-CANARY-CLIENT");
  }
});

test("№17: печать перечисляет документы этой проверки; удалённый документ не возвращается", async ({ page }) => {
  await fillPack(page);
  await page.locator("#run").click();
  await expect(page.locator("#findings article").first()).toBeVisible();
  await page.locator("#tabbtn-documents").click();
  await page.locator('[data-clear="cmr"]').click();
  await page.locator("#run").click();
  await expect(page.locator("#tab-check")).toBeVisible();
  await expect(page.locator("#runMeta")).toContainText("SHA-256");
  await page.locator("#tabbtn-report").click();
  await page.evaluate(() => { window.print = () => {}; });
  await page.locator("#printBtn").click();
  await expect(page.locator("#printReport")).toContainText("Инвойс v1");
  await expect(page.locator("#printReport")).not.toContainText("CMR v1");
  await page.goto("/#documents");
  await openRaw(page, "cmr");
  await expect(page.locator("#t-cmr")).toHaveValue("");
});

test("№35: черновик не теряется при перезагрузке, демо не подставляется в рабочее дело", async ({ page }) => {
  await page.locator("#tabbtn-case").click();
  await page.locator("#caseNew").click();
  await page.locator("#caseName").fill("Draft A");
  await page.locator("#caseName").blur();
  await page.locator("#tabbtn-documents").click();
  for (const id of ["invoice", "packing", "cmr"]) await setDoc(page, id, "");
  await setDoc(page, "invoice", "INVOICE\nBuyer: PRIVATE-DRAFT");
  await page.waitForTimeout(700);
  await page.reload();
  await openRaw(page, "invoice");
  await expect(page.locator("#t-invoice")).toHaveValue(/PRIVATE-DRAFT/);
  await expect(page.locator("#t-invoice")).not.toHaveValue(/INV-2026-0771/);
});

test("№36: ошибка сохранения видна рядом с результатом", async ({ page }) => {
  await page.addInitScript(() => {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) { if (k === "td:cases:v1") throw new DOMException("full", "QuotaExceededError"); return orig.call(this, k, v); };
  });
  await page.reload();
  await page.locator("#consent").check();
  await fillPack(page);
  await page.locator("#run").click();
  await expect(page.locator("#findings article").first()).toBeVisible();
  await expect(page.locator("#tab-check .save-warn")).toBeVisible();
  await expect(page.locator("#tab-check .save-warn")).toContainText("не сохранён");
});

test("№18: в казахском интерфейсе у результатов есть тексты (русский как запасной)", async ({ page }) => {
  await page.locator('[data-lang="kk"]').click();
  await fillPack(page);
  await page.locator("#run").click();
  await expect(page.locator("#findings article h3").first()).not.toHaveText("");
  expect(await page.locator("#checks").textContent()).not.toContain("undefined");
});

test("№5: удалённые строки веса не показываются как «Исправлено»", async ({ page }) => {
  await fillPack(page);
  await page.locator("#run").click();
  await expect(page.locator("#findings")).toContainText("Вес брутто не совпадает");
  await page.locator("#tabbtn-documents").click();
  for (const [id, text] of Object.entries(PACK)) await setDoc(page, id, text.replace(/\nGross weight:.*$/m, ""));
  await page.locator("#run").click();
  await expect(page.locator("#runMeta")).toContainText("SHA-256");
  await expect(page.locator("#diff")).not.toContainText("Исправлено: Вес брутто");
  await expect(page.locator("#diff")).toContainText("Больше не удалось проверить");
});

test("№10: вторая страница того же типа не заменяет первую молча", async ({ page }) => {
  await page.locator("#fileAll").setInputFiles([demo("01-invoice.pdf"), demo("01-invoice.pdf")]);
  await expect(page.locator("#dropStatus")).toContainText("заменил");
});
