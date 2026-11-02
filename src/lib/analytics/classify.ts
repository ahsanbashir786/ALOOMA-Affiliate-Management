import type { Period } from "@/lib/period-core";
import type { FlagKey, SegmentKey } from "@/lib/segments";
import type { CreatorMetrics, NonSeller } from "./creators";
import type { Thresholds } from "./settings";

export type Classified = CreatorMetrics & {
  segment: SegmentKey | null;
  flags: FlagKey[];
  /** Why the creator landed in this segment, written for the affiliate manager. */
  reason: string;
  /** Estimated extra GMV over the uplift horizon if the recommended action is taken (conservative). */
  uplift: number;
  change: number | null;
  rank: number;
};

export type SegmentContext = {
  scale: number;
  minSeller: number;
  starGmv: number;
  strongGmv: number;
  lowGpm: number | null;
  medianGmv: number;
  sellers: number;
  totalGmv: number;
  prevHasData: boolean;
  hasCadence: boolean;
};

export function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

const rm = (n: number) => `RM ${Math.round(n).toLocaleString("en-MY")}`;
const pctText = (r: number) => `${Math.round(Math.abs(r) * 100)}%`;

export function classifyCreators(
  input: CreatorMetrics[],
  t: Thresholds,
  period: Period,
): { classified: Classified[]; ctx: SegmentContext } {
  const scale = period.days / 28;
  const minSeller = t.minSellerGmv * scale;
  const prevHasData = period.prevEnd >= period.dataMin;
  const hasCadence = input.some((r) => r.vpw != null);

  const sellers = input.filter((r) => r.gmv >= minSeller);
  const gmvs = sellers.map((r) => r.gmv).sort((a, b) => a - b);
  const starGmv = quantile(gmvs, 1 - t.starTopShare);
  const strongGmv = quantile(gmvs, t.strongPercentile);
  const medianGmv = quantile(gmvs, 0.5);
  const gpms = sellers
    .filter((r) => r.views != null && r.views >= t.lowConversionMinViews * scale && r.gpmViews != null)
    .map((r) => r.gpmViews!)
    .sort((a, b) => a - b);
  const lowGpm = gpms.length >= 8 ? quantile(gpms, 0.25) : null;
  const medianGpm = gpms.length >= 8 ? quantile(gpms, 0.5) : null;
  const totalGmv = input.reduce((a, r) => a + r.gmv, 0);

  const ranked = [...input].sort((a, b) => b.gmv - a.gmv);
  const rankOf = new Map(ranked.map((r, i) => [r.username, i + 1]));

  const classified: Classified[] = input.map((c) => {
    const curSel = c.gmv >= minSeller;
    const prevSel = prevHasData && c.prevGmv >= minSeller;
    const change = prevHasData && c.prevGmv > 0 ? (c.gmv - c.prevGmv) / c.prevGmv : null;
    const flags: FlagKey[] = [];
    let segment: SegmentKey | null = null;
    let reason = "";
    let uplift = 0;

    const yieldPerVideo = c.sellingVideos > 0 ? c.videoGmv / c.sellingVideos : 0;

    if (prevSel && c.gmv < c.prevGmv * 0.1) {
      segment = "inactive";
      reason = `Sold ${rm(c.prevGmv)} in the previous period but only ${rm(c.gmv)} now.`;
      uplift = c.prevGmv * 0.35;
    } else if (curSel && prevSel && change != null && change <= -t.declineThreshold) {
      segment = "slipping";
      reason = `GMV fell ${pctText(change)} to ${rm(c.gmv)} (was ${rm(c.prevGmv)}).`;
      uplift = (c.prevGmv - c.gmv) * 0.5;
    } else if (!curSel && prevSel && change != null && change <= -t.declineThreshold) {
      segment = "slipping";
      reason = `GMV fell ${pctText(change)} to ${rm(c.gmv)} (was ${rm(c.prevGmv)}).`;
      uplift = (c.prevGmv - c.gmv) * 0.5;
    } else if (curSel && c.vpw != null && c.vpw < t.targetVideosPerWeek && c.gmv >= strongGmv) {
      segment = "underposting";
      const extra = Math.max(1, Math.round(t.targetVideosPerWeek - c.vpw));
      const perVideo = yieldPerVideo * t.upliftHaircut;
      uplift = Math.min(c.videoGmv * 0.6, extra * t.upliftWeeks * perVideo);
      const rankPct = Math.max(1, Math.round((1 - gmvs.filter((g) => g < c.gmv).length / Math.max(gmvs.length, 1)) * 100));
      const posted = c.videosPosted ?? 0;
      const evergreen =
        c.oldVideoShare != null && c.oldVideoShare >= 0.5
          ? ` ${Math.round(c.oldVideoShare * 100)}% of their video sales come from videos older than 90 days, so fresh content is needed before those fade.`
          : "";
      const postedText = posted === 0 ? "no new shoppable videos" : `only ${posted} new shoppable video${posted === 1 ? "" : "s"}`;
      reason = `${rm(c.gmv)} GMV (top ${rankPct}% of sellers) but ${postedText} (${c.vpw.toFixed(1)}/week vs ${t.targetVideosPerWeek}/week target).${evergreen}`;
    } else if (curSel && c.gmv >= starGmv) {
      segment = "star";
      reason = `Top ${Math.round(t.starTopShare * 100)}% of sellers with ${rm(c.gmv)} GMV${c.vpw != null ? ` and ${c.vpw.toFixed(1)} videos/week` : ""}.`;
    } else if (curSel && lowGpm != null && c.views != null && c.views >= t.lowConversionMinViews * scale && c.gpmViews != null && c.gpmViews < lowGpm) {
      segment = "low_conversion";
      reason = `${c.views.toLocaleString("en-MY")} video views but only ${rm(c.gpmViews)} GMV per 1,000 views (typical seller: ${rm(medianGpm ?? lowGpm)}).`;
      uplift = Math.min(c.gmv, Math.max(0, ((medianGpm ?? lowGpm) - c.gpmViews) * (c.views / 1000)) * t.upliftHaircut);
    } else if (curSel && prevSel && change != null && change >= t.growthThreshold) {
      segment = "rising";
      reason = `GMV up ${pctText(change)} to ${rm(c.gmv)} (was ${rm(c.prevGmv)}).`;
    } else if (curSel && prevHasData && c.prevGmv < minSeller * 0.3) {
      segment = "new";
      reason = `First meaningful sales: ${rm(c.gmv)} this period vs ${rm(c.prevGmv)} before.`;
    } else if (curSel) {
      segment = "steady";
      reason = `Consistent contributor with ${rm(c.gmv)} GMV.`;
    }

    if (curSel && c.cancelRate >= t.highCancelRate && c.gross >= minSeller) flags.push("high_cancel");
    if (curSel && c.gmv >= strongGmv && c.topProductShare >= 0.9) flags.push("single_product");
    if (curSel && c.videoGmv >= strongGmv && c.liveGmv === 0 && (c.livesPosted ?? 0) === 0) flags.push("no_live");
    if (curSel && c.codShare >= 0.6 && c.cancelRate >= 0.12) flags.push("cod_heavy");

    return { ...c, segment, flags, reason, uplift: Math.max(0, uplift), change, rank: rankOf.get(c.username) ?? 0 };
  });

  return {
    classified,
    ctx: { scale, minSeller, starGmv, strongGmv, lowGpm, medianGmv, sellers: sellers.length, totalGmv, prevHasData, hasCadence },
  };
}

export type ClassifiedNonSeller = NonSeller & {
  segment: "sample_no_post" | "untapped";
  reason: string;
};

export function classifyNonSellers(
  sampled: NonSeller[],
  pool: NonSeller[],
  t: Thresholds,
): ClassifiedNonSeller[] {
  const out: ClassifiedNonSeller[] = [];
  const seen = new Set<string>();
  for (const s of sampled) {
    if (s.videosWithSamples + s.liveWithSamples > 0) continue; // they did post
    seen.add(s.username);
    out.push({
      ...s,
      segment: "sample_no_post",
      reason: `${s.samplesShipped} sample${s.samplesShipped === 1 ? "" : "s"} shipped, no content posted with them yet.`,
    });
  }
  for (const p of pool) {
    if (seen.has(p.username) || p.followers < t.untappedMinFollowers) continue;
    out.push({
      ...p,
      segment: "untapped",
      reason: `${p.followers.toLocaleString("en-MY")} followers in your creator pool, no sales yet.`,
    });
  }
  return out;
}
