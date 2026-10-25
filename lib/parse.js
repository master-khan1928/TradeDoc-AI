// Разбор чисел и дат. Чистый код.

export function parseNumber(raw) {
  if (raw == null) return null;
  let s = String(raw).replace(/[^\d.,\-]/g, "");
  if (!s) return null;
  // 1,234.50 -> 1234.50 ; 1.234,50 -> 1234.50 ; 12,5 -> 12.5
  const lastDot = s.lastIndexOf("."), lastComma = s.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    s = lastDot > lastComma ? s.replace(/,/g, "") : s.replace(/\./g, "").replace(",", ".");
  } else if (lastComma >= 0) {
    const frac = s.length - lastComma - 1;
    s = frac === 3 && s.indexOf(",") === lastComma && s.length > 4 ? s.replace(",", "") : s.replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function parseDate(raw) {
  if (!raw) return null;
  const m = String(raw).match(/(\d{4})-(\d{2})-(\d{2})/) || null;
  if (m) {
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const r = String(raw).match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (r) {
    const d = new Date(Date.UTC(+r[3], +r[2] - 1, +r[1]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export const near = (a, b, eps = 0.005) => Math.abs(a - b) <= eps;
