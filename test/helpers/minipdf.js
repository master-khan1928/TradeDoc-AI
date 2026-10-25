// Минимальный PDF с текстовым слоем для тестов: шрифт Helvetica, только ASCII, без сжатия.
// Каждая страница — массив строк. pages = [] даёт PDF без текста (как скан без OCR).
export function minipdf(pages) {
  const esc = (s) => String(s).replace(/[\()]/g, (c) => "\\" + c);
  const objs = [];
  const add = (body) => { objs.push(body); return objs.length; };
  const catalog = add(null), pagesObj = add(null), font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const kids = [];
  for (const lines of pages.length ? pages : [[]]) {
    const ops = lines.length ? ["BT", "/F1 10 Tf", "14 TL", "40 800 Td", ...lines.map((l, i) => (i ? "T* " : "") + `(${esc(l)}) Tj`), "ET"].join("\n") : "";
    const content = add(`<< /Length ${Buffer.byteLength(ops, "latin1")} >>\nstream\n${ops}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${content} 0 R >>`));
  }
  objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objs[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;
  let out = "%PDF-1.4\n";
  const offsets = [];
  objs.forEach((body, i) => { offsets.push(Buffer.byteLength(out, "latin1")); out += `${i + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}
