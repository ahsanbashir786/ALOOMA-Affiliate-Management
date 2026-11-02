// Pure date logic shared by server (data queries) and client (period picker).
export type RangeKey = "7d" | "14d" | "28d" | "mtd" | "lastmonth" | "all" | "custom";

export const RANGE_OPTIONS: { key: Exclude<RangeKey, "custom">; label: string }[] = [
  { key: "7d", label: "Last 7 days" },
  { key: "14d", label: "Last 14 days" },
  { key: "28d", label: "Last 28 days" },
  { key: "mtd", label: "This month" },
  { key: "lastmonth", label: "Last month" },
  { key: "all", label: "All data" },
];

export type Period = {
  key: RangeKey;
  label: string;
  /** inclusive, YYYY-MM-DD */
  start: string;
  end: string;
  days: number;
  prevStart: string;
  prevEnd: string;
  dataMin: string;
  dataMax: string;
  hasData: boolean;
};

export type Bounds = { min: string; max: string; hasData: boolean };

const DAY = 86_400_000;
const toDate = (s: string) => new Date(s + "T00:00:00Z");
const iso = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (s: string, n: number) => iso(new Date(toDate(s).getTime() + n * DAY));
export const diffDays = (a: string, b: string) => Math.round((toDate(b).getTime() - toDate(a).getTime()) / DAY) + 1;
const isIso = (s: string | null | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

export type PeriodParams = { range?: string | null; from?: string | null; to?: string | null };

export function computePeriod(bounds: Bounds, params: PeriodParams): Period {
  const max = bounds.max;
  const raw = params.range as RangeKey | null | undefined;
  let key: RangeKey = RANGE_OPTIONS.some((o) => o.key === raw) || raw === "custom" ? raw! : "28d";

  let start = addDays(max, -27);
  let end = max;
  let label = "Last 28 days";
  switch (key) {
    case "7d":
      start = addDays(max, -6);
      label = "Last 7 days";
      break;
    case "14d":
      start = addDays(max, -13);
      label = "Last 14 days";
      break;
    case "28d":
      break;
    case "mtd":
      start = max.slice(0, 8) + "01";
      label = "This month";
      break;
    case "lastmonth": {
      const lastPrev = new Date(toDate(max.slice(0, 8) + "01").getTime() - DAY);
      start = iso(lastPrev).slice(0, 8) + "01";
      end = iso(lastPrev);
      label = "Last month";
      break;
    }
    case "all":
      start = bounds.min;
      label = "All data";
      break;
    case "custom":
      if (isIso(params.from) && isIso(params.to) && params.from <= params.to) {
        start = params.from;
        end = params.to;
        label = "Custom range";
      } else {
        key = "28d";
      }
      break;
  }

  if (start < bounds.min && key !== "custom") start = bounds.min;
  const days = diffDays(start, end);
  const prevEnd = addDays(start, -1);
  const prevStart = addDays(prevEnd, -(days - 1));
  return {
    key,
    label,
    start,
    end,
    days,
    prevStart,
    prevEnd,
    dataMin: bounds.min,
    dataMax: bounds.max,
    hasData: bounds.hasData,
  };
}
