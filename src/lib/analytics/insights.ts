import { SEGMENTS } from "@/lib/segments";
import { fmtPct, fmtRM } from "@/lib/utils";
import type { Classified, SegmentContext } from "./classify";
import type { Kpis, SourceMix, VideoAgeMix } from "./overview";
import type { Thresholds } from "./settings";

export type Insight = {
  id: string;
  tone: "brand" | "good" | "warn" | "serious";
  title: string;
  body: string;
  href?: string;
  cta?: string;
};

/** Plain-English findings surfaced on the overview. Each is derived from data, never hard-coded. */
export function buildInsights(args: {
  kpis: Kpis;
  mix: SourceMix;
  age: VideoAgeMix;
  classified: Classified[];
  ctx: SegmentContext;
  thresholds: Thresholds;
  qs: string;
}): Insight[] {
  const { kpis, mix, age, classified, ctx, thresholds, qs } = args;
  const out: Insight[] = [];
  const q = qs ? `?${qs}` : "";

  const under = classified.filter((c) => c.segment === "underposting");
  if (under.length) {
    const gmv = under.reduce((a, c) => a + c.gmv, 0);
    const uplift = under.reduce((a, c) => a + c.uplift, 0);
    out.push({
      id: "underposting",
      tone: "brand",
      title: `${under.length} strong sellers post less than ${thresholds.targetVideosPerWeek} new video a week`,
      body: `They generate ${fmtRM(gmv)} (${fmtPct(gmv / Math.max(kpis.gmv, 1), 0)} of affiliate GMV)${
        uplift > 0 ? ` – asking for more fresh content could add an estimated ${fmtRM(uplift)}` : ""
      }.`,
      href: `/opportunities${q}${q ? "&" : "?"}segment=underposting`,
      cta: "See who",
    });
  }

  if (age.total > 0 && age.olderThan90 >= 0.4) {
    out.push({
      id: "evergreen",
      tone: "warn",
      title: `${fmtPct(age.olderThan90, 0)} of video sales come from videos older than 90 days`,
      body: "Your sales lean on a few evergreen videos. Fresh content and sequels to those winners protect revenue as they fade.",
      href: `/content${q}`,
      cta: "Content lifecycle",
    });
  }

  const slipping = classified.filter((c) => c.segment === "slipping" || c.segment === "inactive");
  if (slipping.length) {
    const lost = slipping.reduce((a, c) => a + Math.max(0, c.prevGmv - c.gmv), 0);
    out.push({
      id: "slipping",
      tone: "serious",
      title: `${slipping.length} creators are slipping or have gone quiet`,
      body: `Together they sold ${fmtRM(lost)} less than the previous period. Early outreach is cheaper than winning them back later.`,
      href: `/opportunities${q}${q ? "&" : "?"}segment=slipping`,
      cta: "Review",
    });
  }

  if (mix.hasShopData && mix.totals.brandLive > 0) {
    const all = Object.values(mix.totals).reduce((a, b) => a + b, 0);
    const creatorLive = mix.totals.live;
    out.push({
      id: "live",
      tone: "good",
      title: `Your own LIVE made ${fmtRM(mix.totals.brandLive)} – creators' LIVE made ${fmtRM(creatorLive)}`,
      body: `Brand LIVE is ${fmtPct(mix.totals.brandLive / Math.max(all, 1), 0)} of shop sales. LIVE clearly converts: inviting top creators to host sessions is an untapped channel.`,
    });
  }

  if (kpis.cancelRate >= 0.06) {
    out.push({
      id: "cancel",
      tone: "warn",
      title: `${fmtPct(kpis.cancelRate, 1)} of affiliate sales get cancelled`,
      body: `${fmtRM(kpis.gross * kpis.cancelRate)} lost, with ${fmtPct(kpis.codShare, 0)} of GMV paid by cash on delivery. Promote online payment in creator scripts.`,
      href: `/orders${q}`,
      cta: "Order health",
    });
  }

  const top10 = [...classified].sort((a, b) => b.gmv - a.gmv).slice(0, 10).reduce((a, c) => a + c.gmv, 0);
  if (ctx.totalGmv > 0 && top10 / ctx.totalGmv >= 0.4) {
    out.push({
      id: "concentration",
      tone: "warn",
      title: `Top 10 creators make ${fmtPct(top10 / ctx.totalGmv, 0)} of affiliate GMV`,
      body: "High concentration is a risk: if one or two slow down, sales drop. Grow the next tier of mid-sized sellers.",
    });
  }

  return out.slice(0, 4);
}

export const segmentCounts = (classified: Classified[]) => {
  const m = new Map<string, { n: number; gmv: number; uplift: number }>();
  for (const c of classified) {
    if (!c.segment) continue;
    const e = m.get(c.segment) ?? { n: 0, gmv: 0, uplift: 0 };
    e.n++;
    e.gmv += c.gmv;
    e.uplift += c.uplift;
    m.set(c.segment, e);
  }
  return m;
};
export { SEGMENTS };
