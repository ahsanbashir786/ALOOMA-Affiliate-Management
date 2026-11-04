// Creator score (0–100) and tier. Pure: plain numbers in, a number and a reason out, so the score can be explained on screen.
//   Sales 40 · Reliability 25 · Consistency 20 · Reach 15

export type Tier = "Gold" | "Silver" | "Bronze" | "Starter";
export const TIERS: Tier[] = ["Gold", "Silver", "Bronze", "Starter"];
export const TIER_MIN: Record<Tier, number> = { Gold: 70, Silver: 45, Bronze: 20, Starter: 0 };

export type ScoreInput = {
  /** 0–1: where this creator's last-28-day sales sit among everyone who sold (1 = best). null = no ranking available. */
  salesRank: number | null;
  /** Sales in the last 28 days and ever (RM). */
  gmv28: number;
  gmvAll: number;
  /** Samples that ended in a post / ended without one. */
  posted: number;
  notPosted: number;
  /** TikTok's own "fulfilment %" for this creator (0–100), when known. */
  fulfilmentPct: number | null;
  /** Weekly sales for the last 8 weeks. */
  weeks: number[];
  followers: number | null;
};

export type Score = { score: number; tier: Tier; parts: { sales: number; reliability: number; consistency: number; reach: number }; why: string };

const clamp = (n: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));

export function tierOf(score: number): Tier {
  return score >= TIER_MIN.Gold ? "Gold" : score >= TIER_MIN.Silver ? "Silver" : score >= TIER_MIN.Bronze ? "Bronze" : "Starter";
}

export function creatorScore(i: ScoreInput): Score {
  // Sales: recent sales weigh most; a creator who sold before but not lately keeps a little.
  const sales = i.gmv28 > 0 ? 40 * (0.25 + 0.75 * clamp(i.salesRank ?? 0.5)) : i.gmvAll > 0 ? 6 : 0;
  // Reliability: do they post what they were sent? Falls back to TikTok's fulfilment %, then to a neutral half.
  const judged = i.posted + i.notPosted;
  const rel = judged > 0 ? i.posted / judged : i.fulfilmentPct != null ? clamp(i.fulfilmentPct / 100) : 0.5;
  const reliability = 25 * rel;
  // Consistency: how many of the last 8 weeks had a sale.
  const active = i.weeks.filter((w) => w > 0).length;
  const consistency = 20 * (active / Math.max(8, i.weeks.length));
  // Reach: followers on a log scale, 1k = 0, 1M = full.
  const reach = i.followers && i.followers > 1000 ? 15 * clamp((Math.log10(i.followers) - 3) / 3) : 0;
  const score = Math.round(sales + reliability + consistency + reach);
  const parts = { sales: Math.round(sales), reliability: Math.round(reliability), consistency: Math.round(consistency), reach: Math.round(reach) };
  return { score, tier: tierOf(score), parts, why: `Sales ${parts.sales}/40 · Reliability ${parts.reliability}/25 · Consistency ${parts.consistency}/20 · Reach ${parts.reach}/15` };
}
