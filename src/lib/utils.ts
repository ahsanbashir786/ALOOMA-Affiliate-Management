import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

const nf0 = new Intl.NumberFormat("en-MY", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("en-MY", { maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtInt = (n: number | null | undefined) => (n == null || Number.isNaN(n) ? "–" : nf0.format(n));
export const fmtNum1 = (n: number | null | undefined) => (n == null || Number.isNaN(n) ? "–" : nf1.format(n));

/** RM 12,345 (no decimals) – default for headline money. */
export const fmtRM = (n: number | null | undefined, decimals = 0) =>
  n == null || Number.isNaN(n) ? "–" : `RM ${decimals ? nf2.format(n) : nf0.format(Math.round(n))}`;

/** RM 12.3k / RM 1.2M for tight spaces such as chart axes and KPI deltas. */
export function fmtRMCompact(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "–";
  const a = Math.abs(n);
  if (a >= 1_000_000) return `RM ${nf1.format(n / 1_000_000)}M`;
  if (a >= 10_000) return `RM ${nf1.format(n / 1000)}k`;
  return `RM ${nf0.format(Math.round(n))}`;
}

export function fmtCompact(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "–";
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${nf1.format(n / 1_000_000)}M`;
  if (a >= 10_000) return `${nf1.format(n / 1000)}k`;
  return nf0.format(Math.round(n));
}

/** value is a ratio (0.123 → 12.3%) */
export const fmtPct = (r: number | null | undefined, d = 1) =>
  r == null || Number.isNaN(r) ? "–" : `${(r * 100).toFixed(d)}%`;

export function pctChange(cur: number, prev: number): number | null {
  if (!prev) return cur ? null : 0;
  return (cur - prev) / prev;
}

export const fmtDate = (d: string | Date | null | undefined) => {
  if (!d) return "–";
  const dt = typeof d === "string" ? new Date(d.length <= 10 ? d + "T00:00:00" : d) : d;
  return dt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};
export const fmtDateShort = (d: string | Date) => {
  const dt = typeof d === "string" ? new Date(d.length <= 10 ? d + "T00:00:00" : d) : d;
  return dt.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

export const initials = (s: string) =>
  s
    .replace(/[^a-zA-Z0-9 ._]/g, "")
    .split(/[ ._]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("") || "?";
