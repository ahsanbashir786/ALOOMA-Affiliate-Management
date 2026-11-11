// The groups every video in GMV Max falls into, judged on ALL of its history (not only recent days). Pure (safe in client components).
// No video is thrown away: a video with few sales is "not yet proven", never "bad". Only real proof (a lot of spend and bad ROI) puts a video in Wasting Money.

export type GroupKey = "stopped" | "gem" | "underfed" | "explore" | "rescue" | "winning" | "fading" | "wasting" | "blocked" | "never" | "other";
export type Tone = "good" | "brand" | "warn" | "critical" | "muted";

export const GROUPS: { key: GroupKey; label: string; about: string; tone: Tone; boost: boolean }[] = [
  { key: "stopped", label: "Proven, Left Alone", about: "Many orders and good ROI, but GMV Max stopped spending on it.", tone: "good", boost: true },
  { key: "gem", label: "Hidden Gem", about: "It sold with very little spend, and GMV Max never gave it a real chance. Worth a fair test.", tone: "brand", boost: true },
  { key: "underfed", label: "Selling, Low Spend", about: "Good ROI and still running, but it gets very little budget compared with other videos.", tone: "brand", boost: true },
  { key: "explore", label: "Worth Exploring", about: "GMV Max never used it, but it sells or gets views on its own.", tone: "brand", boost: true },
  { key: "rescue", label: "Authorization Rescue", about: "It sold in ads, but TikTok cannot use it until the creator authorizes it again. Ask the creator.", tone: "critical", boost: false },
  { key: "winning", label: "Winning Now", about: "Good ROI and GMV Max already spends well on it. Leave it running.", tone: "muted", boost: false },
  { key: "fading", label: "Fading", about: "A good video whose ROI in the last 7 days is far below its own average. Do not boost now.", tone: "warn", boost: false },
  { key: "wasting", label: "Wasting Money", about: "A lot was spent and the ROI is poor. This is the only group that is cut on proof.", tone: "critical", boost: false },
  { key: "blocked", label: "Blocked", about: "TikTok will not boost it (excluded, rejected or unavailable), or it needs authorization and has no sales yet.", tone: "critical", boost: false },
  { key: "never", label: "No Signal Yet", about: "Never used and nothing visible about it yet. It stays in the pool and gets its turn later.", tone: "muted", boost: false },
  { key: "other", label: "Not Enough Proof", about: "Some spend or sales, but not clear yet. Not bad, just unfinished.", tone: "muted", boost: false },
];
export const GROUP = Object.fromEntries(GROUPS.map((g) => [g.key, g])) as Record<GroupKey, (typeof GROUPS)[number]>;
export const BOOST_GROUPS = GROUPS.filter((g) => g.boost).map((g) => g.key);
export const isGroupKey = (k: string | undefined | null): k is GroupKey => !!k && k in GROUP;

export type Rules = { minRoi: number; minOrders: number; idleDays: number };

/** A gem is a video that sold with at most this much spend (RM). */
export const GEM_MAX_COST = 30;
/** A gem needs at least this share of the "good ROI" line, or a cost per order no worse than its product's usual. */
export const GEM_ROI_SHARE = 0.7;

export type Facts = {
  cost: number; orders: number; revenue: number; cost7: number; revenue7: number; daysSinceSpend: number | null;
  /** Blocked by TikTok for good (excluded, rejected, unavailable). */ blocked: boolean;
  /** TikTok says it needs the creator's authorization. */ locked: boolean;
  /** Typical spend in the last 7 days of a video that is running (the median). */ typical7: number;
  /** Sales the video made on its own (Shop sync) and its views, for videos never used in ads. */ organic: number; views: number;
  /** Cost per order of the video, and the usual one for its product. */ cpo: number | null; peerCpo: number | null;
};

/** Which group a video belongs to, and why, in plain words. */
export function classify(f: Facts, r: Rules): { group: GroupKey; why: string } {
  const roi = f.cost > 0 ? f.revenue / f.cost : 0;
  const roi7 = f.cost7 > 0 ? f.revenue7 / f.cost7 : null;
  const x = (n: number) => `${n.toFixed(1)}×`;
  const rm = (n: number) => `RM ${n < 10 && n % 1 ? n.toFixed(2) : Math.round(n).toLocaleString("en-MY")}`;
  const ago = f.daysSinceSpend == null ? "no spend" : f.daysSinceSpend === 0 ? "spent today" : `last spend ${f.daysSinceSpend} day${f.daysSinceSpend === 1 ? "" : "s"} ago`;
  if (f.locked) return f.orders >= 1 ? { group: "rescue", why: `${f.orders} order${f.orders === 1 ? "" : "s"}, ${rm(f.revenue)} sales at ROI ${x(roi)}, but TikTok needs the creator's authorization` } : { group: "blocked", why: "TikTok needs the creator's authorization, and it has no sales yet" };
  if (f.blocked) return { group: "blocked", why: "TikTok will not boost this video" };
  if (f.cost < 1 && f.orders === 0) {
    if (f.organic > 0 || f.views >= 500) return { group: "explore", why: f.organic > 0 ? `Never used in ads, yet it sold ${rm(f.organic)} on its own` : `Never used in ads, yet it has ${Math.round(f.views).toLocaleString("en-MY")} views` };
    return { group: "never", why: "Never used, nothing visible about it yet" };
  }
  const stopped = f.daysSinceSpend == null || f.daysSinceSpend > r.idleDays;
  const good = roi >= r.minRoi && f.orders >= r.minOrders;
  if (good && stopped) return { group: "stopped", why: `ROI ${x(roi)} on ${f.orders} orders, ${ago}` };
  if (good && roi7 != null && f.cost7 >= 5 && roi7 < roi * 0.6) return { group: "fading", why: `ROI ${x(roi7)} in the last 7 days against ${x(roi)} all time` };
  if (good && f.cost7 < Math.max(1, f.typical7 * 0.5)) return { group: "underfed", why: `ROI ${x(roi)} but only ${rm(f.cost7)} spent in the last 7 days` };
  if (good) return { group: "winning", why: `ROI ${x(roi)}, ${rm(f.cost7)} spent in the last 7 days` };
  // A hidden gem: it sold with little money and is not being funded. Few sales is unfinished news, not bad news.
  const efficient = roi >= Math.max(2, r.minRoi * GEM_ROI_SHARE) || (f.cpo != null && f.peerCpo != null && f.cpo <= f.peerCpo * 1.25);
  const unfunded = stopped || f.cost7 < Math.max(1, f.typical7 * 0.5);
  if (f.orders >= 1 && f.cost <= GEM_MAX_COST && efficient && unfunded) return { group: "gem", why: `${f.orders} order${f.orders === 1 ? "" : "s"} from only ${rm(f.cost)} (ROI ${x(roi)}), and GMV Max did not follow it up. ${ago}` };
  if (f.cost >= 20 && f.cost > 0 && roi < r.minRoi * 0.5 && f.orders < r.minOrders * 3) return { group: "wasting", why: `${rm(f.cost)} spent at ROI ${x(roi)}` };
  return { group: "other", why: f.orders ? `${f.orders} order${f.orders === 1 ? "" : "s"} at ROI ${x(roi)} from ${rm(f.cost)}` : `${rm(f.cost)} spent, no orders yet` };
}

// ───────── potential, evidence and the fair test amount ─────────
export type Evidence = "none" | "low" | "medium" | "high";
export const EVIDENCE_LABEL: Record<Evidence, string> = { none: "No Proof Yet", low: "Few Orders", medium: "Some Orders", high: "Many Orders" };
export const evidenceOf = (orders: number): Evidence => (orders >= 20 ? "high" : orders >= 5 ? "medium" : orders >= 1 ? "low" : "none");

/** Spend of average ROI that a video's ROI is pulled towards, so RM 2 of luck does not look like a star, while still counting for something (RM). */
export const PRIOR_SPEND = 10;

/**
 * Potential, 0 to 100: how good it looks, whatever it has been given so far.
 * efficiency (ROI pulled towards your average, 2× your average = full marks) × proof (orders, full at 20) × room (not already funded) × alive (not fading).
 */
export function potentialOf(v: { cost: number; revenue: number; orders: number; roiNow: boolean; fading: boolean; hasRoom: boolean }, accountRoi: number | null): number {
  const acc = accountRoi && accountRoi > 0 ? accountRoi : 5;
  const shrunk = (v.revenue + PRIOR_SPEND * acc) / (v.cost + PRIOR_SPEND);
  const eff = Math.min(1, shrunk / acc / 2);
  const proof = 0.5 + 0.5 * Math.min(1, v.orders / 20);
  return Math.round(100 * eff * proof * (v.hasRoom ? 1 : 0.6) * (v.fading ? 0.4 : 1));
}

/** For videos never used: from what is visible (sales without ads, views), scaled against the best of them. Never above 60: it is the least proven kind. */
export function explorePotential(organic: number, views: number, p95Organic: number, p95Views: number): number {
  const a = p95Organic > 0 ? Math.log1p(organic) / Math.log1p(p95Organic) : 0, b = p95Views > 0 ? Math.log1p(views) / Math.log1p(p95Views) : 0;
  return Math.round(60 * Math.min(1, Math.max(a, b * 0.6)));
}

/** A fair first test: enough for about 5 orders at the cost per order it showed, never below RM 5, in steps of RM 0.5. */
export function fairTestAmount(cpo: number | null): number {
  const raw = cpo && cpo > 0 ? 5 * cpo : 5;
  return Math.max(5, Math.ceil(raw * 2) / 2);
}
