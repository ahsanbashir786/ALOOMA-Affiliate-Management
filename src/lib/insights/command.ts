import "server-only";
import { sql } from "drizzle-orm";
import { rows } from "@/lib/analytics/sql";
import { daysBetweenISO, todayKL } from "@/lib/time";
import { getProgress } from "@/lib/workflow/progress";
import { getOwnerDecisions, type OwnerDecision } from "@/lib/workflow/records";
import { getToday } from "@/lib/workflow/today";
import { getDemand, type Demand } from "./demand";
import { getOrderHealth, type OrderHealth } from "./orders";

export type Freshness = { kind: string; label: string; lastDataOn: string | null; ageDays: number | null; status: "ok" | "stale" | "missing" };

export type CommandData = {
  today: string;
  freshness: Freshness[];
  work: { due: number; verify: number; samples: number; opportunities: number };
  gauges: { onTimePct: number | null; reliabilityPct: number | null; returnPct: number | null };
  progress: Awaited<ReturnType<typeof getProgress>>;
  decisions: OwnerDecision[];
  orders: OrderHealth;
  demand: Demand;
  sampleFunnel: { sent: number; delivered: number; posted: number; selling: number };
  timeToPost: { label: string; value: number }[];
};

const REQUIRED: { kind: string; label: string; table: string; col: string }[] = [
  { kind: "affiliate_orders", label: "Affiliate orders", table: "order_lines", col: "created_at" },
  { kind: "all_orders", label: "All shop orders", table: "shop_order_lines", col: "created_at" },
  { kind: "video_list", label: "Video analysis", table: "videos", col: "posted_at" },
];

/** Everything the owner's Command Centre shows, composed from the same records as the rest of the app. Nothing is stored or typed in. */
export async function getCommand(): Promise<CommandData> {
  const today = todayKL();
  const [progress90, progress, decisions, orders, demand, todayData] = await Promise.all([getProgress(90), getProgress(28), getOwnerDecisions(28), getOrderHealth(90), getDemand(6), getToday("focus")]);

  const freshness: Freshness[] = [];
  for (const f of REQUIRED) {
    const [x] = await rows<{ d: string | null }>(sql.raw(`select to_char(max(${f.col}), 'YYYY-MM-DD') as d from ${f.table}`));
    const age = x?.d ? daysBetweenISO(x.d, today) : null;
    freshness.push({ kind: f.kind, label: f.label, lastDataOn: x?.d ?? null, ageDays: age, status: age == null ? "missing" : age > 10 ? "stale" : "ok" });
  }

  const p = progress90.promises;
  const judged = p.fulfilledOnTime + p.fulfilledLate + p.fulfilledTimingUnknown + p.overdueOpen;
  const [sf] = await rows<{ sent: number; delivered: number; posted: number; selling: number }>(sql`
    select count(*)::int as sent, (count(*) filter (where delivered_at is not null))::int as delivered,
      (count(*) filter (where coalesce(result_override, result) in ('posted_video', 'did_live')))::int as posted,
      (count(*) filter (where coalesce(result_override, result) in ('posted_video', 'did_live') and content_orders > 0))::int as selling
    from samples where source = 'orders' and creator is not null and coalesce(order_status, '') <> 'Canceled'`);
  const ttp = await rows<{ b: string; n: number }>(sql`
    select case when d <= 2 then '0–2d' when d <= 5 then '3–5d' when d <= 8 then '6–8d' when d <= 11 then '9–11d' when d <= 14 then '12–14d' else '15d+' end as b, count(*)::int as n
    from (select extract(epoch from (posted_at - delivered_at)) / 86400 as d from samples
          where source = 'orders' and coalesce(result_override, result) in ('posted_video', 'did_live') and posted_at is not null and delivered_at is not null) x where d >= 0 group by 1`);
  const bins = ["0–2d", "3–5d", "6–8d", "9–11d", "12–14d", "15d+"];

  return {
    today,
    freshness,
    work: { due: todayData.counts.due, verify: todayData.counts.verify, samples: todayData.counts.samples, opportunities: todayData.counts.development },
    gauges: {
      onTimePct: progress.followUps.onTimeRate == null ? null : progress.followUps.onTimeRate * 100,
      reliabilityPct: judged ? ((p.fulfilledOnTime) / judged) * 100 : null,
      returnPct: orders.totals.returnPct,
    },
    progress,
    decisions,
    orders,
    demand,
    sampleFunnel: sf ?? { sent: 0, delivered: 0, posted: 0, selling: 0 },
    timeToPost: bins.map((b) => ({ label: b, value: ttp.find((x) => x.b === b)?.n ?? 0 })),
  };
}
