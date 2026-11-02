import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { actions, products } from "@/db/schema";
import { resolvePeriod } from "@/lib/period";
import type { Period } from "@/lib/period-core";
import { SEGMENTS, type SegmentKey } from "@/lib/segments";
import { classifyCreators, classifyNonSellers, type Classified, type ClassifiedNonSeller, type SegmentContext } from "./classify";
import { getCreatorMetrics, getNonSellers } from "./creators";
import { getThresholds, type Thresholds } from "./settings";

export type Recommendation = {
  username: string;
  type: SegmentKey;
  priority: number;
  title: string;
  reason: string;
  instruction: string;
  expectedUplift: number;
  baselineGmv: number;
};

const BASE_PRIORITY: Record<SegmentKey, number> = {
  underposting: 80,
  slipping: 75,
  inactive: 70,
  low_conversion: 55,
  rising: 50,
  sample_no_post: 45,
  star: 40,
  new: 35,
  untapped: 30,
  steady: 10,
};

const rm = (n: number) => `RM ${Math.round(n).toLocaleString("en-MY")}`;
const num = (n: number) => Math.round(n).toLocaleString("en-MY");

function priorityScore(segment: SegmentKey, gmv: number, uplift: number): number {
  const value = Math.min(1, Math.log10(1 + gmv + uplift) / 4.5) * 20;
  return Math.max(1, Math.min(100, Math.round(BASE_PRIORITY[segment] * 0.8 + value)));
}

type Names = Map<string, string>;

export function buildRecommendation(
  c: Classified,
  period: Period,
  t: Thresholds,
  names: Names,
): Recommendation | null {
  const seg = c.segment;
  if (!seg || seg === "steady") return null;
  const name = c.username;
  const top = (c.topProductId && names.get(c.topProductId)) || "your best-selling product";
  const share = Math.round(c.topProductShare * 100);
  const days = period.days;
  const tips: string[] = [];
  if (c.flags.includes("no_live")) {
    tips.push(`Try one short LIVE this week demonstrating ${top} – viewers can buy straight away.`);
  }
  if (c.flags.includes("single_product")) {
    tips.push(`Add a second product to your videos (e.g. a matching bedsheet or pillow) to lift basket size.`);
  }
  if (c.flags.includes("high_cancel") || c.flags.includes("cod_heavy")) {
    tips.push(
      `Encourage buyers to pay online (not COD) – ${Math.round(c.cancelRate * 100)}% of your orders were cancelled or returned, mostly avoidable.`,
    );
  }
  const extra = tips.length ? tips.map((x) => `• ${x}`).join("\n") : null;
  const ask = Math.max(1, Math.ceil(t.targetVideosPerWeek - (c.vpw ?? 0)));
  const closing = "Need a sample, a brief or a voucher code? Just reply and we'll sort it out.";

  let title = "";
  let body = "";
  switch (seg) {
    case "underposting":
      title = `Ask ${name} for more fresh videos`;
      body = [
        `Hi ${name}, thank you for the brilliant results – you've driven ${rm(c.gmv)} in sales for us over the last ${days} days.`,
        ``,
        `To keep that momentum going, here's what would help most:`,
        `• Post at least ${t.targetVideosPerWeek} new shoppable video${t.targetVideosPerWeek === 1 ? "" : "s"} a week (you posted ${c.videosPosted ?? 0} recently) – fresh videos replace the older ones as they slow down.`,
        `• Lead with ${top}${share >= 40 ? ` – ${share}% of your sales come from it` : ""}. Show it in use: feel, fit and a clear before/after.`,
        `• Make a "part 2" of your best-selling video: same hook, new angle.`,
        extra,
        closing,
      ]
        .filter((l): l is string => l !== null)
        .join("\n");
      void ask;
      break;
    case "slipping":
      title = `Re-engage ${name} – sales down ${Math.round(Math.abs(c.change ?? 0) * 100)}%`;
      body = [
        `Hi ${name}, we noticed your sales dipped recently (${rm(c.gmv)} vs ${rm(c.prevGmv)} before). Is anything getting in the way – product questions, stock, or ideas you'd like support on?`,
        ``,
        `Some quick ways to bounce back:`,
        `• Re-post or pin your best video featuring ${top}.`,
        `• Refresh the first 3 seconds of your next video with a stronger hook.`,
        `• Share a new angle: comparison, unboxing or "what I wish I knew".`,
        extra,
        closing,
      ]
        .filter((l): l is string => l !== null)
        .join("\n");
      break;
    case "inactive":
      title = `Win back ${name}`;
      body = [
        `Hi ${name}, we've missed your content! You sold ${rm(c.prevGmv)} for us last period and we'd love to work together again.`,
        ``,
        `• A fresh sample of ${top} is yours if you'd like to post this week.`,
        `• We can share a short brief with what's working for other creators right now.`,
        `• One video this week would make a real difference.`,
        closing,
      ].join("\n");
      break;
    case "low_conversion":
      title = `Coach ${name} on conversion`;
      body = [
        `Hi ${name}, your videos get great attention (${num(c.views ?? 0)} views) – let's turn more of those viewers into buyers:`,
        ``,
        `• Show the product in use within the first 5 seconds.`,
        `• Say the key benefit and the offer out loud, and tell viewers to tap the yellow basket.`,
        `• Feature ${top}${c.topProductShare >= 0.3 ? ` – it converts best for you (${share}% of your sales)` : ""}.`,
        `• Pin a comment with the product name and any voucher.`,
        extra,
        closing,
      ]
        .filter((l): l is string => l !== null)
        .join("\n");
      break;
    case "rising":
      title = `Back ${name}'s momentum`;
      body = [
        `Hi ${name}, your sales are up ${Math.round((c.change ?? 0) * 100)}% – fantastic work!`,
        ``,
        `• Keep your current posting pace over the next few weeks.`,
        `• Double down on ${top}.`,
        `• We can send samples of other products so you can keep content fresh.`,
        extra,
        closing,
      ]
        .filter((l): l is string => l !== null)
        .join("\n");
      break;
    case "star":
      title = `Nurture star creator ${name}`;
      body = [
        `Hi ${name}, you're one of our top creators – thank you! We'd love to look after you better:`,
        ``,
        `• Priority samples for every new launch.`,
        `• A direct contact for anything you need.`,
        `• Let's discuss exclusive products or improved commission on selected items.`,
        ``,
        `Tell us what would help you most.`,
      ].join("\n");
      break;
    case "new":
      title = `Welcome ${name} – new seller`;
      body = [
        `Hi ${name}, congratulations on your first strong sales (${rm(c.gmv)})!`,
        ``,
        `• Post consistently – even one video a week compounds over time.`,
        `• Your best result so far is ${top}; build on it.`,
        closing,
      ].join("\n");
      break;
    default:
      return null;
  }

  return {
    username: name,
    type: seg,
    priority: priorityScore(seg, c.gmv, c.uplift),
    title,
    reason: c.reason,
    instruction: body,
    expectedUplift: Math.round(c.uplift),
    baselineGmv: Math.round(c.gmv),
  };
}

export function buildNonSellerRecommendation(n: ClassifiedNonSeller, topProduct: string): Recommendation {
  if (n.segment === "sample_no_post") {
    return {
      username: n.username,
      type: "sample_no_post",
      priority: priorityScore("sample_no_post", 0, 0),
      title: `Chase ${n.username} for sample content`,
      reason: n.reason,
      instruction: [
        `Hi ${n.username}, hope you're well! We shipped you ${n.samplesShipped} sample${n.samplesShipped === 1 ? "" : "s"} and we'd love to see your take on it.`,
        ``,
        `• Could you let us know roughly when you plan to post?`,
        `• A short demo showing the product in use works best.`,
        `Happy to share a brief if that helps.`,
      ].join("\n"),
      expectedUplift: 0,
      baselineGmv: 0,
    };
  }
  return {
    username: n.username,
    type: "untapped",
    priority: priorityScore("untapped", n.followers / 100, 0),
    title: `Invite ${n.username} (${Math.round(n.followers / 1000)}k followers)`,
    reason: n.reason,
    instruction: [
      `Hi ${n.username}, we love your content and think our bedding range would suit your audience.`,
      ``,
      `• We'd like to send you a free sample of ${topProduct}.`,
      `• We can share a simple brief and a commission offer for a target collaboration.`,
      `Interested? Reply here and we'll set it up.`,
    ].join("\n"),
    expectedUplift: 0,
    baselineGmv: 0,
  };
}

export async function productNameMap(): Promise<Names> {
  const list = await db.select({ id: products.productId, name: products.shortName }).from(products);
  return new Map(list.map((p) => [p.id, p.name]));
}

export type Analysis = {
  period: Period;
  classified: Classified[];
  nonSellers: ClassifiedNonSeller[];
  ctx: SegmentContext;
  thresholds: Thresholds;
  names: Names;
  snapshots: Awaited<ReturnType<typeof getCreatorMetrics>>["snapshots"];
};

/** Full creator analysis for a period: metrics → segments → non-seller lists. */
export async function analyse(period: Period): Promise<Analysis> {
  const [thresholds, names] = await Promise.all([getThresholds(), productNameMap()]);
  const { rows: metrics, snapshots } = await getCreatorMetrics(period);
  const { classified, ctx } = classifyCreators(metrics, thresholds, period);
  const sellers = new Set(metrics.filter((m) => m.gmv > 0).map((m) => m.username));
  const ns = await getNonSellers(period, sellers);
  const nonSellers = classifyNonSellers(ns.sampled, ns.pool, thresholds);
  return { period, classified, nonSellers, ctx, thresholds, names, snapshots };
}

export function allRecommendations(a: Analysis): Recommendation[] {
  const recs: Recommendation[] = [];
  for (const c of a.classified) {
    const r = buildRecommendation(c, a.period, a.thresholds, a.names);
    if (r) recs.push(r);
  }
  const topProduct = [...a.names.values()][0] ?? "our best-selling product";
  const sampled = a.nonSellers.filter((n) => n.segment === "sample_no_post");
  const untapped = a.nonSellers.filter((n) => n.segment === "untapped").sort((x, y) => y.followers - x.followers).slice(0, 30);
  for (const n of [...sampled, ...untapped]) recs.push(buildNonSellerRecommendation(n, topProduct));
  return recs.sort((x, y) => y.priority - x.priority || y.expectedUplift - x.expectedUplift);
}

/**
 * Persist recommendations for the latest 28 days. Safe to run repeatedly:
 * rows the team has touched (status ≠ open) are never overwritten, and stale
 * open rows from earlier windows are removed.
 */
export async function generateActions(): Promise<{ created: number; total: number }> {
  const period = await resolvePeriod({ range: "28d" });
  const analysis = await analyse(period);
  const recs = allRecommendations(analysis);
  await db.execute(sql`delete from actions where status = 'open' and period_end <> ${period.end}::date`);
  let created = 0;
  for (let i = 0; i < recs.length; i += 200) {
    const part = recs.slice(i, i + 200);
    const res = await db
      .insert(actions)
      .values(
        part.map((r) => ({
          username: r.username,
          type: r.type,
          priority: r.priority,
          title: r.title,
          reason: r.reason,
          instruction: r.instruction,
          expectedUplift: r.expectedUplift,
          baselineGmv: r.baselineGmv,
          periodStart: period.start,
          periodEnd: period.end,
        })),
      )
      .onConflictDoUpdate({
        target: [actions.username, actions.type, actions.periodEnd],
        set: {
          priority: sql`excluded.priority`,
          title: sql`excluded.title`,
          reason: sql`excluded.reason`,
          instruction: sql`excluded.instruction`,
          expectedUplift: sql`excluded.expected_uplift`,
          baselineGmv: sql`excluded.baseline_gmv`,
          updatedAt: sql`now()`,
        },
        setWhere: sql`${actions.status} = 'open'`,
      })
      .returning({ id: actions.id, created: sql<boolean>`(xmax = 0)` });
    created += res.filter((r) => r.created).length;
  }
  return { created, total: recs.length };
}

export const SEGMENT_LABEL = (k: SegmentKey) => SEGMENTS[k].label;
