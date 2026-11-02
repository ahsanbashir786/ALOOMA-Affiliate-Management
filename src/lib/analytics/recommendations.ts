import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { actions, creators, products } from "@/db/schema";
import { resolvePeriod } from "@/lib/period";
import type { Period } from "@/lib/period-core";
import { SEGMENTS, type SegmentKey } from "@/lib/segments";
import { classifyCreators, classifyNonSellers, type Classified, type ClassifiedNonSeller, type SegmentContext } from "./classify";
import { getCreatorMetrics, getNonSellers } from "./creators";
import { getThresholds, type Thresholds } from "./settings";
import { getSampleScorecard } from "@/lib/samples/analysis";
import { waMessage, type SampleVerdict } from "@/lib/samples/states";

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
  sample_chase: 72,
  more_samples: 60,
  more_content: 66,
  refresh_content: 58,
  stop_samples: 38,
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

/** Follow-up actions from the sample tracker, one per creator: chase, coach, ask for more content, reward, fresh video, stop. */
export async function sampleRecommendations(): Promise<Recommendation[]> {
  const { rows: score } = await getSampleScorecard();
  const TYPE: Partial<Record<SampleVerdict, SegmentKey>> = {
    chase: "sample_chase",
    stop: "stop_samples",
    more: "more_samples",
    more_content: "more_content",
    refresh: "refresh_content",
  };
  const out: Recommendation[] = [];
  for (const r of score) {
    const type = TYPE[r.verdict];
    if (!type || r.doNotContact) continue;
    const products = r.products || "our product";
    const text = waMessage({
      username: r.username,
      products,
      verdict: r.verdict,
      deliveredLabel: r.oldestUnposted ? new Date(r.oldestUnposted + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) : "recently",
      contentGmv: r.contentGmv,
      videosSince: r.videosSince,
      posted: r.posted,
      lastVideoLabel: r.newestVideo ? new Date(r.newestVideo + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) : null,
    });
    const title: Record<string, string> = {
      sample_chase: `Chase ${r.username} to post sample content`,
      stop_samples: `Pause samples for ${r.username}`,
      more_samples: `Offer ${r.username} another sample`,
      more_content: `Ask ${r.username} for more content`,
      refresh_content: `Ask ${r.username} for a fresh video`,
    };
    out.push({
      username: r.username,
      type,
      priority: priorityScore(type, r.contentGmv, r.value),
      title: title[type],
      reason: r.advice,
      instruction: text + (r.phone ? `\n\nWhatsApp: ${r.phone} · https://wa.me/${r.phone.replace(/\D/g, "")}` : ""),
      expectedUplift: Math.round(r.value),
      baselineGmv: Math.round(r.contentGmv),
    });
  }
  return out;
}

/**
 * Persist recommendations for the latest 28 days. Safe to run repeatedly:
 * rows the team has touched (status ≠ open) are never overwritten, and stale
 * open rows from earlier windows are removed.
 */
export async function generateActions(): Promise<{ created: number; total: number }> {
  const period = await resolvePeriod({ range: "28d" });
  const analysis = await analyse(period);
  const dnc = new Set(
    (await db.select({ u: creators.username }).from(creators).where(eq(creators.doNotContact, true))).map((r) => r.u),
  );
  // Creators in the sample tracker get precise per-sample follow-ups instead of the
  // coarser "sample, no content" signal from TikTok's sample analysis summary.
  const tracked = new Set(
    (await db.execute<{ creator: string }>(sql`select distinct creator from samples where source in ('orders','manual') and creator is not null`)).map(
      (r) => r.creator,
    ),
  );
  const recs = [...allRecommendations(analysis), ...(await sampleRecommendations())].filter(
    (r) => !dnc.has(r.username) && !(r.type === "sample_no_post" && tracked.has(r.username)),
  );
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
  // Open, untouched recommendations that no longer apply (e.g. the creator has since posted) are removed.
  const keep = recs.map((r) => `${r.username}|${r.type}`);
  await db.execute(sql`
    delete from actions
    where status = 'open' and period_end = ${period.end}::date and note is null and assignee_id is null
      and not (username || '|' || type = any(${keep.length ? sql`array[${sql.join(keep.map((k) => sql`${k}`), sql`, `)}]::text[]` : sql`'{}'::text[]`}))`);
  return { created, total: recs.length };
}

export const SEGMENT_LABEL = (k: SegmentKey) => SEGMENTS[k].label;
