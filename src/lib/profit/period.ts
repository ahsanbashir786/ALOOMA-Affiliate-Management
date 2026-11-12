import { addDaysISO, todayKL } from "@/lib/time";
import { resolveRange, type Range, type RangeKey } from "@/lib/range";

export type Period = Range;

export const monthStart = (day: string) => day.slice(0, 7) + "-01";
export const monthEnd = (day: string) => addDaysISO(addDaysISO(monthStart(day), 32).slice(0, 7) + "-01", -1);

const LEGACY: Record<string, Exclude<RangeKey, "custom">> = { this: "this_month", last: "last_month", "30": "30d", all: "lifetime" };

/**
 * Orders are counted in the month they were sold. The period comes from the same calendar as every other screen (?range=this_month, or custom dates);
 * the default is the current month, or `fallback`.
 */
export function resolvePeriod(range: string | undefined, from: string | undefined, to: string | undefined, fallback: Exclude<RangeKey, "custom"> = "this_month"): Period {
  const mapped = range && LEGACY[range] ? LEGACY[range] : range;
  const custom = (from || to) && !mapped ? "custom" : mapped; // old links carried only from and to
  return resolveRange({ range: custom, from, to }, todayKL(), fallback);
}

export const inPeriod = (day: string, p: { from: string | null; to: string | null }) => (!p.from || day >= p.from) && (!p.to || day <= p.to);
