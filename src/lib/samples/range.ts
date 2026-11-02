import "server-only";
import { resolvePeriod } from "@/lib/period";
import { one, type SP } from "@/lib/url";
import type { DateRange } from "./analysis";

/** The sample pages default to "All data" – every sample, whenever it was approved. */
export async function sampleRange(sp: SP) {
  const period = await resolvePeriod({ range: one(sp.range) ?? "all", from: one(sp.from), to: one(sp.to) });
  const range: DateRange = period.key === "all" ? undefined : { start: period.start, end: period.end };
  return { period, range };
}
