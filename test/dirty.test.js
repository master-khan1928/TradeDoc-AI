// Этап 2: «грязный» генератор и подсчёт в сравнении с одним запросом. Модель везде подделана.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { makeDirtySet, formatNumber, formatDate, addNoise, TEMPLATES, NUMBER_STYLES } from "../lib/generate-dirty.js";
import { makeSet, baseData, rng } from "../lib/generate.js";
import { parseNumber } from "../lib/parse.js";
import { detectType } from "../lib/doctype.js";
import { mockExtract } from "../lib/extract/mock.js";
import { runCompare, scoreSet } from "../lib/compare.js";

test("форматы чисел и дат", () => {
  assert.equal(formatNumber(1234.5, "en"), "1,234.50");
  assert.equal(formatNumber(1234.5, "eu"), "1.234,50");
  assert.equal(formatNumber(1234.5, "ru"), "1 234,50");
  assert.equal(formatNumber(1234.5, "plain"), "1234.50");
  assert.equal(formatNumber(54000, "ru", 0), "54 000");
  assert.equal(formatDate("2026-10-07", "dot"), "07.10.2026");
  assert.equal(formatDate("2026-10-07", "slash"), "07/10/2026");
  // с дробной частью все форматы однозначны и читаются кодом обратно
  for (const s of NUMBER_STYLES) for (const x of [7.5, 1234.5, 54000, 1234567.25]) assert.equal(parseNumber(formatNumber(x, s, 2)), x, `${s} ${x}`);
});

test("грязный генератор: детерминирован, все шаблоны и форматы встречаются, есть оба языка", () => {
  assert.deepEqual(makeDirtySet(7, ["qty_mismatch"]), makeDirtySet(7, ["qty_mismatch"]));
  const tpl = new Set(), num = new Set();
  let bilingual = 0;
  for (let s = 0; s < 40; s++) {
    const set = makeDirtySet(s, []);
    for (const st of Object.values(set.styles)) { tpl.add(st.tpl); num.add(st.num); }
    for (const d of set.docs) if (/[A-Za-z]{3,}.*\/.*[А-Яа-яЁё]{3,}/.test(d.text)) bilingual++;
  }
  assert.deepEqual([...tpl].sort(), [...TEMPLATES].sort());
  assert.deepEqual([...num].sort(), [...NUMBER_STYLES].sort());
  assert.ok(bilingual > 0);
});

test("грязный комплект описывает те же данные, что и шаблонный", () => {
  for (let s = 0; s < 20; s++) {
    const d = baseData(s), set = makeDirtySet(s, []);
    for (const doc of set.docs) assert.ok(doc.text.includes(d.number), `${s} ${doc.type}: номер инвойса`);
    assert.equal(makeSet(s, []).docs.length, set.docs.length);
  }
});

test("шум меняет метки и пробелы, но не значения", () => {
  const lines = ["Gross weight: 54 000 kg", "Seller / Продавец: Altyn Bidai LLP", "1 | Wheat | 10 | bags", "INVOICE"];
  for (let s = 0; s < 50; s++) {
    const out = addNoise(lines, rng(s)).filter((l) => l.trim());
    const value = (l) => l.slice(l.indexOf(":") + 1).trim();
    assert.equal(value(out.find((l) => /gross/i.test(l))), "54 000 kg");
    assert.equal(value(out.find((l) => /seller/i.test(l))), "Altyn Bidai LLP");
    assert.ok(out.some((l) => l.trimEnd() === "1 | Wheat | 10 | bags"));
  }
});

test("тип документа определяется и на грязных документах", () => {
  for (let s = 0; s < 40; s++) for (const d of makeDirtySet(s, []).docs) assert.equal(detectType(d.text).type, d.type, `seed ${s}: ${d.text.split("\n").slice(0, 3).join(" | ")}`);
});

test("подсчёт: найдено, ложные срабатывания и цитаты считаются по известным ошибкам", () => {
  const s = scoreSet(["line_total_wrong"], new Set(["line_totals", "invoice_sum", "packages"]), [{ quoted: true }, { quoted: true }, { quoted: false }]);
  assert.equal(s.found, 1);
  assert.deepEqual(s.falseIds, ["packages"], "invoice_sum законно следует из line_total_wrong");
  assert.equal(s.quoted, 2);
});

test("сравнение на подделанной модели: обе стороны считаются одинаково, выдуманная цитата не засчитывается", async () => {
  const sets = [makeSet(11, ["gross_weight_mismatch"]), makeSet(12, [])];
  const calls = { cargo_document: 0, pack_issues: 0 };
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    const name = body.response_format.json_schema.name;
    calls[name]++;
    let content;
    if (name === "cargo_document") {
      // «идеальный читатель»: разбор по шаблону вместо модели
      const text = body.messages[1].content.split("\n\n").slice(1).join("\n\n");
      const ex = mockExtract({ type: "x", text });
      content = JSON.stringify({ fields: ex.fields, items: ex.items });
    } else {
      const user = body.messages[1].content;
      const cmrGross = user.split("=== cmr ===")[1]?.split("\n").find((l) => l.startsWith("Gross weight"));
      content = JSON.stringify({ issues: [
        ...(cmrGross ? [{ check: "gross_weight", doc: "cmr", quote: cmrGross, description: "differs" }] : []),
        { check: "other", doc: "invoice", quote: "Stamp missing on page 3", description: "invented" },
      ] });
    }
    return { ok: true, json: async () => ({ choices: [{ message: { content } }] }) };
  };
  const res = await runCompare(sets, { key: "k", model: "m", base: "https://example.test/v1" }, { fetchImpl });
  assert.equal(calls.cargo_document, 6);
  assert.equal(calls.pack_issues, 2);
  assert.deepEqual([res.ours.found, res.ours.of, res.ours.falseFindings, res.ours.cleanFlagged], [1, 1, 0, 0]);
  assert.equal(res.ours.quoted, res.ours.findings);
  assert.equal(res.baseline.found, 1);
  assert.equal(res.baseline.cleanFlagged, 1, "на чистом комплекте базовый вариант нашёл лишнее");
  assert.ok(res.baseline.falseFindings >= 2);
  assert.ok(res.baseline.quoted < res.baseline.findings, "выдуманная цитата не засчитана");
});

test("скрипт сравнения без ключа честно пишет, что нужен META_API_KEY", () => {
  const env = { ...process.env }; delete env.META_API_KEY; delete env.META_MODEL;
  const r = spawnSync(process.execPath, [fileURLToPath(new URL("../scripts/compare.mjs", import.meta.url))], { env, encoding: "utf8" });
  assert.equal(r.status, 2);
  assert.match(r.stdout, /Нужен META_API_KEY/);
  assert.match(r.stdout, /META_API_KEY is required/);
});
