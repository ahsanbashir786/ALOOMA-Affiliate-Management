// Paging shared by every list: page sizes, "All", and which page numbers to show. Pure, safe in the browser.
import { one, type SP } from "@/lib/url";

export const PAGE_SIZES = [10, 20, 50] as const;
export type SizeChoice = number | "all";

/** ?size= from the address: 10, 20, 50 or "all" (anything else falls back to the screen's own default). */
export function sizeFrom(sp: SP, fallback: number, param = "size"): SizeChoice {
  const v = one(sp[param]);
  if (v === "all") return "all";
  const n = Number(v);
  return (PAGE_SIZES as readonly number[]).includes(n) ? n : fallback;
}

/** Slices one page out of a list. "All" is one page with everything. */
export function pageOf<T>(list: T[], page: number, size: SizeChoice): { rows: T[]; page: number; pages: number; pageSize: number } {
  const pageSize = size === "all" ? Math.max(1, list.length) : size;
  const pages = Math.max(1, Math.ceil(list.length / pageSize));
  const p = Math.min(Math.max(1, page), pages);
  return { rows: list.slice((p - 1) * pageSize, p * pageSize), page: p, pages, pageSize };
}

/** The page numbers to show: 1 … 4 5 6 … 17 (null = the dots). */
export function pageWindow(page: number, pages: number): (number | null)[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const out: (number | null)[] = [1];
  const lo = Math.max(2, Math.min(page - 1, pages - 4)), hi = Math.min(pages - 1, Math.max(page + 1, 5));
  if (lo > 2) out.push(null);
  for (let i = lo; i <= hi; i++) out.push(i);
  if (hi < pages - 1) out.push(null);
  out.push(pages);
  return out;
}
