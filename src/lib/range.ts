// The date range of the GMV Max screens: quick choices (like TikTok Ads Manager) or any From and To day. Pure (safe in client components).
// All days are YYYY-MM-DD in Malaysia time. The comparison is always the period of the same length just before.
import { addDaysISO, daysBetweenISO, weekStartISO } from "@/lib/time";

export type RangeKey = "lifetime" | "today" | "yesterday" | "7d" | "14d" | "30d" | "90d" | "this_week" | "last_week" | "this_month" | "last_month" | "custom";
export const PRESETS: { key: Exclude<RangeKey, "custom">; label: string }[] = [
  { key: "lifetime", label: "Lifetime" }, { key: "today", label: "Today" }, { key: "yesterday", label: "Yesterday" },
  { key: "7d", label: "Last 7 days" }, { key: "14d", label: "Last 14 days" }, { key: "30d", label: "Last 30 days" }, { key: "90d", label: "Last 90 days" },
  { key: "this_week", label: "This week" }, { key: "last_week", label: "Last week" }, { key: "this_month", label: "This month" }, { key: "last_month", label: "Last month" },
];
export const LIFETIME_FROM = "2000-01-01";
const isKey = (k: string | undefined): k is Exclude<RangeKey, "custom"> => !!k && PRESETS.some((p) => p.key === k);
const isDay = (d: string | undefined): d is string => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d + "T00:00:00Z"));

export type Range = {
  key: RangeKey; /** null = lifetime (no start). */ from: string | null; to: string; label: string;
  /** Days in the range (null for lifetime). */ days: number | null; /** The period of the same length just before (null for lifetime). */ prevFrom: string | null; prevTo: string | null;
};

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const fmtDay = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return `${d} ${MON[m - 1]} ${y}`; };

/** Dates of a quick choice, for today. */
export function presetDates(key: Exclude<RangeKey, "custom">, today: string): { from: string | null; to: string } {
  const first = today.slice(0, 8) + "01";
  switch (key) {
    case "lifetime": return { from: null, to: today };
    case "today": return { from: today, to: today };
    case "yesterday": { const y = addDaysISO(today, -1); return { from: y, to: y }; }
    case "7d": return { from: addDaysISO(today, -6), to: today };
    case "14d": return { from: addDaysISO(today, -13), to: today };
    case "30d": return { from: addDaysISO(today, -29), to: today };
    case "90d": return { from: addDaysISO(today, -89), to: today };
    case "this_week": return { from: weekStartISO(today), to: today };
    case "last_week": { const w = weekStartISO(today); return { from: addDaysISO(w, -7), to: addDaysISO(w, -1) }; }
    case "this_month": return { from: first, to: today };
    case "last_month": { const end = addDaysISO(first, -1); return { from: end.slice(0, 8) + "01", to: end }; }
  }
}

export function makeRange(key: RangeKey, from: string | null, to: string): Range {
  const days = from ? daysBetweenISO(from, to) + 1 : null;
  const preset = PRESETS.find((p) => p.key === key);
  return {
    key, from, to, days,
    label: preset ? preset.label : !from ? "Lifetime" : from === to ? fmtDay(from) : `${fmtDay(from)} – ${fmtDay(to)}`,
    prevTo: from ? addDaysISO(from, -1) : null, prevFrom: from && days ? addDaysISO(from, -days) : null,
  };
}

/** Reads ?range=…&from=…&to=… (nothing = `fallback`). A day in the future is cut back to today. */
export function resolveRange(sp: { range?: string; from?: string; to?: string }, today: string, fallback: Exclude<RangeKey, "custom"> = "7d"): Range {
  if (sp.range === "custom" && isDay(sp.from)) {
    const to = isDay(sp.to) && sp.to <= today ? sp.to : today;
    const from = sp.from > to ? to : sp.from;
    return makeRange("custom", from, to);
  }
  const key = isKey(sp.range) ? sp.range : fallback;
  const { from, to } = presetDates(key, today);
  return makeRange(key, from, to);
}

export const lastNDays = (today: string, n: number): Range => makeRange(n === 7 ? "7d" : n === 30 ? "30d" : "custom", addDaysISO(today, -(n - 1)), today);

/** The bits of the address that carry the range from one tab to the next ("" when none was chosen). */
export function rangeSuffix(sp: { range?: string; from?: string; to?: string }): string {
  if (sp.range === "custom" && isDay(sp.from)) return `&range=custom&from=${sp.from}${isDay(sp.to) ? `&to=${sp.to}` : ""}`;
  return isKey(sp.range) ? `&range=${sp.range}` : "";
}

/** For SQL: a start that always exists. */
export const sqlFrom = (r: { from: string | null }) => r.from ?? LIFETIME_FROM;
/** For SQL: the comparison period (an empty, far-past period when there is none). */
export const sqlPrev = (r: Range): [string, string] => (r.prevFrom && r.prevTo ? [r.prevFrom, r.prevTo] : ["1900-01-01", "1900-01-02"]);

/** Days compared before and after a boost in the Boost Log. */
export const LOG_WINDOW = 7;
