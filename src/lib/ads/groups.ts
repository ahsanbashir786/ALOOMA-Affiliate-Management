// The groups every video in GMV Max falls into, judged on ALL of its history (not only recent days). Pure (safe in client components).

export type GroupKey = "stopped" | "promise" | "underfed" | "never" | "winning" | "fading" | "wasting" | "blocked" | "other";

export const GROUPS: { key: GroupKey; label: string; about: string; tone: "good" | "brand" | "warn" | "critical" | "muted"; boost: boolean }[] = [
  { key: "stopped", label: "Stopped While Selling", about: "Proven seller with good ROI, but GMV Max has stopped spending on it. A golden video left unused.", tone: "good", boost: true },
  { key: "promise", label: "Sold, Then Dropped", about: "It made a few sales at good ROI, then GMV Max stopped before it was really tested.", tone: "good", boost: true },
  { key: "underfed", label: "Selling, Low Spend", about: "Good ROI and still running, but it gets very little budget compared with other videos.", tone: "brand", boost: true },
  { key: "never", label: "Never Started", about: "GMV Max has never spent on it. Videos that already sell without ads come first.", tone: "brand", boost: true },
  { key: "winning", label: "Winning Now", about: "Good ROI and GMV Max is already spending well on it. Leave it running.", tone: "muted", boost: false },
  { key: "fading", label: "Fading", about: "A good video whose ROI in the last 7 days is far below its own average. Do not boost now.", tone: "warn", boost: false },
  { key: "wasting", label: "Wasting Money", about: "It has spent real money and the ROI is poor. Do not boost.", tone: "critical", boost: false },
  { key: "blocked", label: "Blocked", about: "TikTok will not boost it (needs authorization, rejected, excluded or unavailable).", tone: "critical", boost: false },
  { key: "other", label: "Not Enough Proof", about: "Too little spend or sales to judge yet.", tone: "muted", boost: false },
];
export const GROUP = Object.fromEntries(GROUPS.map((g) => [g.key, g])) as Record<GroupKey, (typeof GROUPS)[number]>;
export const BOOST_GROUPS = GROUPS.filter((g) => g.boost).map((g) => g.key);
export const isGroupKey = (k: string | undefined | null): k is GroupKey => !!k && k in GROUP;

export type Rules = { minRoi: number; minOrders: number; idleDays: number };

export type Facts = {
  cost: number; orders: number; revenue: number; cost7: number; revenue7: number; daysSinceSpend: number | null;
  blocked: boolean; /** Typical spend in the last 7 days of a video that is running (the median). */ typical7: number;
};

/** Which group a video belongs to, and why, in plain words. */
export function classify(f: Facts, r: Rules): { group: GroupKey; why: string } {
  const roi = f.cost > 0 ? f.revenue / f.cost : 0;
  const roi7 = f.cost7 > 0 ? f.revenue7 / f.cost7 : null;
  const x = (n: number) => `${n.toFixed(1)}×`;
  const rm = (n: number) => `RM ${Math.round(n).toLocaleString("en-MY")}`;
  if (f.blocked) return { group: "blocked", why: "TikTok will not boost this video" };
  if (f.cost < 1) return { group: "never", why: "GMV Max has never spent on it" };
  // Stopped is judged on real spend only. TikTok's delivery status can say "not delivering" for a video that is spending today.
  const stopped = f.daysSinceSpend == null || f.daysSinceSpend > r.idleDays;
  const ago = f.daysSinceSpend == null ? "no spend" : f.daysSinceSpend === 0 ? "spent today" : `last spend ${f.daysSinceSpend} day${f.daysSinceSpend === 1 ? "" : "s"} ago`;
  const good = roi >= r.minRoi && f.orders >= r.minOrders;
  if (good && stopped) return { group: "stopped", why: `ROI ${x(roi)} on ${f.orders} orders, ${ago}` };
  if (!good && roi >= r.minRoi && f.orders >= 1 && stopped) return { group: "promise", why: `${f.orders} order${f.orders === 1 ? "" : "s"} at ROI ${x(roi)} from only ${rm(f.cost)}, ${ago}` };
  if (good && roi7 != null && f.cost7 >= 5 && roi7 < roi * 0.6) return { group: "fading", why: `ROI ${x(roi7)} in the last 7 days against ${x(roi)} all time` };
  if (good && f.cost7 < Math.max(1, f.typical7 * 0.5)) return { group: "underfed", why: `ROI ${x(roi)} but only ${rm(f.cost7)} spent in the last 7 days` };
  if (good) return { group: "winning", why: `ROI ${x(roi)}, ${rm(f.cost7)} spent in the last 7 days` };
  if (f.cost >= 20 && roi < r.minRoi * 0.5) return { group: "wasting", why: `${rm(f.cost)} spent at ROI ${x(roi)}` };
  return { group: "other", why: f.orders ? `${f.orders} order${f.orders === 1 ? "" : "s"} at ROI ${x(roi)}` : `${rm(f.cost)} spent, no orders yet` };
}
