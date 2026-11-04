// Блок B: юридические черновики, пометка ИИ в письме, маршрут /legal только по белому списку.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createApp } from "../scripts/server.mjs";
import { buildLetter } from "../lib/letters.js";

const finding = { id: "gross_weight", evidence: [{ doc: "cmr", quote: "Gross weight: 54200 kg" }] };

test("письмо подписано: с помощью ИИ (какая модель) или без ИИ; не консультация", () => {
  const ai = buildLetter([finding], "ru", { ai: true, label: "Google Gemini", model: "gem-test" });
  assert.match(ai, /с помощью ИИ \(Google Gemini · gem-test\)/);
  assert.match(ai, /не является таможенным брокером/);
  assert.match(buildLetter([finding], "en", {}), /without AI \(template parsing\)/);
  assert.doesNotMatch(buildLetter([finding], "ru", { ai: true, label: "<script>x</script>", model: "m" }), /<script>/, "метка очищается");
});

test("юридические черновики: ru/kk/en, помечены как черновик, без утверждений о соответствии закону", () => {
  for (const lang of ["ru", "kk", "en"]) {
    const files = readdirSync(new URL(`../docs/legal/${lang}/`, import.meta.url)).sort();
    assert.deepEqual(files, ["CONSENT.md", "DISCLAIMER.md", "PRIVACY.md", "TERMS.md"], lang);
    for (const f of files) {
      const text = readFileSync(new URL(`../docs/legal/${lang}/${f}`, import.meta.url), "utf8");
      assert.match(text, /Черновик|Draft|Жоба/, `${lang}/${f}`);
      assert.match(text, /проверить юристом|check with a lawyer|заңгермен тексеру/, `${lang}/${f}`);
      if (lang === "kk") assert.match(text, /тексеруін қажет етеді/, "казахский помечен как требующий вычитки");
    }
  }
  for (const f of ["docs/legal/RISKS.md", "docs/legal/DATA_FLOW.md", "THIRD_PARTY.md"]) {
    assert.doesNotMatch(readFileSync(new URL(`../${f}`, import.meta.url), "utf8"), /соответствует (закону|требованиям)|complies with (the )?law/i, f);
  }
});

test("/legal: отдаёт черновики как текст, остальное 404", async () => {
  const app = createApp();
  await new Promise((r) => app.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${app.address().port}`;
  try {
    for (const lang of ["ru", "kk", "en"]) for (const d of ["TERMS", "PRIVACY", "CONSENT", "DISCLAIMER"]) {
      const r = await fetch(`${base}/legal/${lang}/${d}.md`);
      assert.equal(r.status, 200);
      assert.match(r.headers.get("content-type"), /text\/plain/);
    }
    for (const p of ["/legal/ru/RISKS.md", "/legal/de/TERMS.md", "/legal/ru/..%2f..%2fREADME.md"]) assert.notEqual((await fetch(base + p)).status, 200, p);
  } finally { await new Promise((r) => app.close(r)); }
});
