// The affiliate journey and the sales levers, in plain numbers. Pure (no database) so every screen and every test agrees.
import type { DirRow } from "@/lib/creators/workflow/directory";
import { daysBetweenISO } from "@/lib/time";

/** One creator is in exactly one stage: the furthest they have got. */
export const STAGES = [
  { key: "found", label: "Found", help: "Known to us, no sample sent and no sale yet." },
  { key: "requested", label: "Sample Requested", help: "Asked for a sample that is waiting for a decision." },
  { key: "way", label: "Sample On The Way", help: "A sample was sent and is still inside the posting window." },
  { key: "notposted", label: "Delivered, Not Posted", help: "The sample arrived and the posting window passed with nothing posted and no sales." },
  { key: "nosale", label: "Posted, No Sale", help: "Posted for the sample, but no sales yet." },
  { key: "selling", label: "Selling", help: "Sold in the last 28 days." },
  { key: "star", label: "Star", help: "Among the top sellers of the last 28 days." },
  { key: "quiet", label: "Went Quiet", help: "Sold before, nothing in the last 28 days." },
] as const;
export type StageKey = (typeof STAGES)[number]["key"];

/** Stages where a sample was sent and has not turned into sales: money is already spent here. */
export const UNPRODUCTIVE: StageKey[] = ["notposted", "nosale"];

export function stageOf(r: DirRow): StageKey {
  const s = new Set(r.lines.map((l) => l.status));
  if (s.has("Winner")) return "star";
  if (s.has("Rising") || s.has("Steady") || s.has("Slipping") || r.lines.some((l) => l.gmv28 > 0)) return "selling";
  if (s.has("Quiet") || (r.gmvAll > 0)) return "quiet";
  if (s.has("Posted")) return "nosale";
  if (s.has("Silent")) return "notposted";
  if (s.has("Waiting")) return "way";
  if ((r.extra?.requestsOpen ?? 0) > 0) return "requested";
  return "found";
}

/** Days this creator has been in the stage, where a date tells us (else null). `ref` = the latest day of data. */
export function daysInStage(r: DirRow, stage: StageKey, ref: string): number | null {
  const gap = (d: string | null | undefined) => (d ? Math.max(0, daysBetweenISO(d, ref)) : null);
  if (stage === "quiet") return gap(r.extra?.lastSaleOn);
  if (stage === "way" || stage === "notposted" || stage === "nosale") {
    const dates = r.lines.flatMap((l) => (l.sampleSkus ?? []).flatMap((s) => s.times.map((t) => t.on))).sort();
    return gap(dates[dates.length - 1] ?? null);
  }
  return null;
}

/** Sales = Creators Who Sell × Posts Per Seller × Sales Per Post. */
export type Levers = { sellers: number; posts: number; sales: number };
export type Effect = { key: "sellers" | "posts" | "perPost"; label: string; from: number; to: number; unit: string; effect: number };

/**
 * How much of the change in sales each lever explains. Uses logarithmic shares, so the three effects add up to the exact change.
 * Returns null when there is nothing to compare (no sales or no posts in one of the periods).
 */
export function explainChange(now: Levers, before: Levers): { total: number; effects: Effect[] } | null {
  if (now.sellers <= 0 || before.sellers <= 0 || now.posts <= 0 || before.posts <= 0 || now.sales <= 0 || before.sales <= 0) return null;
  const f = (l: Levers) => ({ sellers: l.sellers, posts: l.posts / l.sellers, perPost: l.sales / l.posts });
  const a = f(now), b = f(before);
  const d = now.sales - before.sales;
  const lm = d === 0 ? before.sales : d / Math.log(now.sales / before.sales);
  const eff = (k: keyof typeof a) => lm * Math.log(a[k] / b[k]);
  return {
    total: d,
    effects: [
      { key: "sellers", label: "Creators Who Sell", from: b.sellers, to: a.sellers, unit: "creators", effect: eff("sellers") },
      { key: "posts", label: "Posts Per Seller", from: b.posts, to: a.posts, unit: "per creator", effect: eff("posts") },
      { key: "perPost", label: "Sales Per Post", from: b.perPost, to: a.perPost, unit: "RM per post", effect: eff("perPost") },
    ],
  };
}
