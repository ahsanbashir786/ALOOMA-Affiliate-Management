import type { Cell } from "./read-xlsx";

export type RowObj = Record<string, Cell>;

export function toObjects(header: string[], rows: Cell[][]): RowObj[] {
  return rows.map((r) => {
    const o: RowObj = {};
    header.forEach((h, i) => {
      if (h && !(h in o)) o[h] = r[i] ?? null;
    });
    return o;
  });
}

/** "RM1,234.50" | 1234.5 | "--" → number (0 when absent). */
export function num(v: Cell | undefined): number {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = v.replace(/RM|MYR|,|\s/gi, "");
  if (s === "" || s === "--" || s === "-") return 0;
  const n = Number(s.endsWith("%") ? s.slice(0, -1) : s);
  return Number.isFinite(n) ? n : 0;
}

/** Like num() but null when the cell is empty / "--". */
export function numOrNull(v: Cell | undefined): number | null {
  if (v == null) return null;
  if (typeof v === "string" && /^(--?|n\/a)$/i.test(v.trim())) return null;
  return num(v);
}

/** "5.66%" → 0.0566. Plain numbers are treated as already-ratios when ≤ 1. */
export function pct(v: Cell | undefined): number | null {
  if (v == null) return null;
  if (typeof v === "number") return v > 1 ? v / 100 : v;
  const s = v.trim();
  if (s === "" || s === "--") return null;
  if (s.endsWith("%")) {
    const n = Number(s.slice(0, -1).replace(/,/g, ""));
    return Number.isFinite(n) ? n / 100 : null;
  }
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? (n > 1 ? n / 100 : n) : null;
}

export const int = (v: Cell | undefined) => Math.round(num(v));

export function str(v: Cell | undefined): string | null {
  if (v == null) return null;
  const s = typeof v === "number" ? String(v) : v.trim();
  return s === "" || s === "--" ? null : s;
}

/** Strings only; numbers (e.g. IDs stored numerically) are rendered without exponent. */
export function idStr(v: Cell | undefined): string | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? BigInt(Math.round(v)).toString() : null;
  const s = v.trim();
  return s === "" || s === "--" ? null : s;
}

/** First header variant that exists in the row. */
export function pick(row: RowObj, ...names: string[]): Cell {
  for (const n of names) if (n in row) return row[n];
  return null;
}

/** dd/mm/yyyy HH:MM:SS → Date (UTC wall-clock, no timezone shifts). */
export function parseDMY(v: Cell | undefined): Date | null {
  if (typeof v !== "string") return null;
  const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  const [, d, mo, y, h = "0", mi = "0", s = "0"] = m;
  return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s));
}

/** mm/dd/yyyy HH:mm → Date (UTC wall-clock). */
export function parseMDY(v: Cell | undefined): Date | null {
  if (typeof v !== "string") return null;
  const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  const [, mo, d, y, h = "0", mi = "0", s = "0"] = m;
  return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s));
}

/**
 * TikTok exports put a plain-English definition under each header. A real data
 * row never has several long, multi-word text cells.
 */
export function isDescriptionRow(row: Cell[]): boolean {
  let help = 0;
  for (const c of row) {
    if (typeof c !== "string") continue;
    const spaces = c.match(/ /g)?.length ?? 0;
    if ((c.length > 45 && spaces >= 6) || (c.endsWith(".") && spaces >= 2 && !/^\d/.test(c))) help++;
  }
  return help >= 3;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** Guess the reporting window from a filename such as "..._1st_sep_to_30_sep.xlsx". */
export function guessPeriodFromFilename(name: string, refYear: number): { start: string; end: string } | null {
  const iso = name.match(/(\d{4})-(\d{2})-(\d{2})[-_ ]+(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return { start: `${iso[1]}-${iso[2]}-${iso[3]}`, end: `${iso[4]}-${iso[5]}-${iso[6]}` };
  const m = name.match(
    /(\d{1,2})(?:st|nd|rd|th)?[\s_-]*([a-z]{3,9})[\s_-]*to[\s_-]*(\d{1,2})(?:st|nd|rd|th)?[\s_-]*([a-z]{3,9})/i,
  );
  if (!m) return null;
  const m1 = MONTHS[m[2].slice(0, 3).toLowerCase()];
  const m2 = MONTHS[m[4].slice(0, 3).toLowerCase()];
  if (!m1 || !m2) return null;
  const endYear = refYear;
  const startYear = m1 > m2 ? refYear - 1 : refYear;
  const p = (n: number) => String(n).padStart(2, "0");
  return { start: `${startYear}-${p(m1)}-${p(+m[1])}`, end: `${endYear}-${p(m2)}-${p(+m[3])}` };
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Derive a compact display name from a long marketplace product title. */
export function shortProductName(name: string, brand?: string | null): string {
  let n = name.trim();
  const exclusive = /^\{exclusive\}\s*/i.test(n);
  n = n.replace(/^\{exclusive\}\s*/i, "");
  if (brand) n = n.replace(new RegExp(`^${brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+`, "i"), "");
  let base = n.split(/\s+[|]\s+|\s+[-–]\s+|,\s+|\s+\/\s+/)[0].trim();
  if (base.length > 48) base = base.slice(0, 46).trimEnd() + "…";
  const tags: string[] = [];
  if (/waterproof\s*&\s*non-?\s?waterproof|non-?\s?waterproof\s*&\s*waterproof/i.test(name)) {
    // sold in both variants – no tag
  } else if (/non-?\s?waterproof/i.test(name)) tags.push("Non-waterproof");
  else if (/waterproof/i.test(name) && !/waterproof/i.test(base)) tags.push("Waterproof");
  if (exclusive) tags.push("Exclusive");
  return tags.length ? `${base} · ${tags.join(" · ")}` : base;
}
