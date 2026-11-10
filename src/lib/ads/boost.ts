import "server-only";
import { sql } from "drizzle-orm";
import { rows } from "@/lib/sql";
import { addDaysISO, todayKL } from "@/lib/time";
import { productName } from "@/lib/products/catalog";
import { IDLE_STATUSES, ON_STATUSES, STATUS_LABEL, isBlocked, type DeliveryFilter } from "./status";

// GMV Max: which videos are worth boosting. Read only. Everything here comes from the Ads sync (ads_* tables) and, for who made a video and when,
// from the TikTok Shop sync (tt_videos, matched on the video id).

export type BoostFilters = { days: 7 | 30 | 90; minRoi: number | null; minOrders: number; maxAgeDays: number; product: string | null; delivery: DeliveryFilter };
export const DEFAULT_FILTERS: BoostFilters = { days: 30, minRoi: null, minOrders: 10, maxAgeDays: 180, product: null, delivery: "any" };

export type Kpi = { cost: number; revenue: number; orders: number; roi: number | null };
export type Suggestion = {
  creativeId: string; productId: string; title: string | null; creator: string | null; postedOn: string | null; ageDays: number | null;
  productKey: string | null; productLabel: string; account: string | null;
  cost: number; orders: number; revenue: number; roi: number; costPerOrder: number | null; impressions: number; clicks: number; ctr: number | null;
  lastSpend: string | null; spendingNow: boolean; spendDays: number; score: number; reasons: string[];
  /** TikTok's latest delivery status for this video (null when TikTok gave none). */
  status: string | null; statusLabel: string | null;
};
export type BoostData = {
  today: string; from: string; days: number; freshest: string | null; hasData: boolean;
  now: Kpi; before: Kpi; accountRoi: number | null; minRoiUsed: number;
  suggestions: Suggestion[]; considered: number; /** Videos left out because TikTok will not boost them. */ blocked: number; blockedByStatus: Record<string, number>; products: { key: string; label: string }[];
};

const num = (v: unknown) => (v == null ? 0 : Number(v));
const roiOf = (rev: number, cost: number) => (cost > 0 ? rev / cost : null);

async function kpi(from: string, to: string): Promise<Kpi> {
  const [r] = await rows<{ cost: number; revenue: number; orders: number }>(sql`
    select coalesce(sum(cost), 0)::float8 as cost, coalesce(sum(gross_revenue), 0)::float8 as revenue, coalesce(sum(orders), 0)::int as orders
    from ads_campaign_daily where day between ${from}::date and ${to}::date`);
  return { cost: num(r?.cost), revenue: num(r?.revenue), orders: num(r?.orders), roi: roiOf(num(r?.revenue), num(r?.cost)) };
}

const median = (xs: number[]) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export async function boostData(f: BoostFilters = DEFAULT_FILTERS): Promise<BoostData> {
  const today = todayKL();
  const from = addDaysISO(today, -(f.days - 1));
  const prevTo = addDaysISO(from, -1), prevFrom = addDaysISO(prevTo, -(f.days - 1));
  const [now, before, fresh] = await Promise.all([
    kpi(from, today), kpi(prevFrom, prevTo),
    rows<{ d: string | null; n: number }>(sql`select to_char(max(day), 'YYYY-MM-DD') as d, count(*)::int as n from ads_creative_daily`),
  ]);
  const raw = await rows<{ advertiser_id: string; creative_id: string; product_id: string; cost: number; orders: number; revenue: number; imp: number; clk: number; last_spend: string | null; spend_days: number; last_status: string | null; creator: string | null; title: string | null; posted_at: Date | null; product_key: string | null; account: string | null }>(sql`
    with agg as (
      select d.advertiser_id, d.creative_id, d.product_id,
        sum(d.cost)::float8 as cost, coalesce(sum(d.orders), 0)::int as orders, coalesce(sum(d.gross_revenue), 0)::float8 as revenue,
        coalesce(sum(d.impressions), 0)::float8 as imp, coalesce(sum(d.clicks), 0)::float8 as clk,
        to_char(max(d.day) filter (where coalesce(d.cost, 0) > 0), 'YYYY-MM-DD') as last_spend,
        (count(distinct d.day) filter (where coalesce(d.cost, 0) > 0))::int as spend_days,
        (array_agg(d.delivery_status order by d.day desc) filter (where d.delivery_status is not null))[1] as last_status
      from ads_creative_daily d where d.day between ${from}::date and ${today}::date group by 1, 2, 3
    )
    select a.*, v.creator, coalesce(v.title, av.title) as title, coalesce(v.posted_at, av.posted_at) as posted_at, pm.product_key, adv.name as account
    from agg a
    left join lateral (select creator, title, posted_at from tt_videos where video_id = a.creative_id limit 1) v on true
    left join lateral (select title, posted_at from ads_videos where item_id = a.creative_id limit 1) av on true
    left join product_map pm on pm.product_id = a.product_id
    left join ads_advertisers adv on adv.advertiser_id = a.advertiser_id
    where a.cost > 0 and coalesce(pm.product_key, '') <> 'excluded'`);
  const totalCost = raw.reduce((a, r) => a + num(r.cost), 0), totalRev = raw.reduce((a, r) => a + num(r.revenue), 0);
  const accountRoi = roiOf(totalRev, totalCost);
  const minRoiUsed = f.minRoi ?? Math.max(5, Math.ceil((accountRoi ?? 8) * 1.2));
  const nowMs = Date.parse(today + "T00:00:00Z");
  const blockedRows = raw.filter((r) => isBlocked(r.last_status));
  const blockedByStatus: Record<string, number> = {};
  for (const r of blockedRows) blockedByStatus[r.last_status!] = (blockedByStatus[r.last_status!] ?? 0) + 1;
  const items = raw.filter((r) => !isBlocked(r.last_status)).map((r) => {
    const cost = num(r.cost), orders = num(r.orders), revenue = num(r.revenue), roi = revenue / cost;
    const posted = r.posted_at ? new Date(r.posted_at).toISOString().slice(0, 10) : null;
    const age = posted ? Math.max(0, Math.round((nowMs - Date.parse(posted + "T00:00:00Z")) / 86400_000)) : null;
    return { r, cost, orders, revenue, roi, posted, age };
  }).filter((x) => x.orders >= f.minOrders && x.roi >= minRoiUsed && (x.age == null || x.age <= f.maxAgeDays) && (!f.product || x.r.product_key === f.product)
    && (f.delivery === 'any' || (f.delivery === 'idle' ? !x.r.last_status || IDLE_STATUSES.includes(x.r.last_status) : !!x.r.last_status && ON_STATUSES.includes(x.r.last_status))));
  const med = median(items.map((x) => x.cost));
  const suggestions: Suggestion[] = items.map(({ r, cost, orders, revenue, roi, posted, age }) => {
    const spendingNow = !!r.last_spend && r.last_spend >= addDaysISO(today, -1);
    const reasons = [`ROI ${roi.toFixed(1)}×`, `${orders} orders`];
    if (cost <= med) reasons.push(`only RM ${Math.round(cost).toLocaleString("en-MY")} spent`);
    if (age != null && age <= 60) reasons.push(`posted ${age} day${age === 1 ? "" : "s"} ago`);
    if (r.last_status && IDLE_STATUSES.includes(r.last_status)) reasons.push("proven, but not delivering now");
    else if (spendingNow) reasons.push("spending now");
    return {
      creativeId: r.creative_id, productId: r.product_id, title: r.title, creator: r.creator, postedOn: posted, ageDays: age,
      productKey: r.product_key, productLabel: r.product_key ? productName(r.product_key) : `Product ${r.product_id.slice(-6)}`, account: r.account,
      cost, orders, revenue, roi, costPerOrder: orders > 0 ? cost / orders : null, impressions: num(r.imp), clicks: num(r.clk), ctr: num(r.imp) > 0 ? num(r.clk) / num(r.imp) : null,
      lastSpend: r.last_spend, spendingNow, spendDays: num(r.spend_days), status: r.last_status, statusLabel: r.last_status ? (STATUS_LABEL[r.last_status] ?? r.last_status) : null,
      score: roi * Math.log(1 + orders), reasons,
    };
  }).sort((a, b) => b.score - a.score).slice(0, 100);
  const keys = [...new Set(raw.map((r) => r.product_key).filter((k): k is string => !!k))];
  return {
    today, from, days: f.days, freshest: fresh[0]?.d ?? null, hasData: (fresh[0]?.n ?? 0) > 0,
    now, before, accountRoi, minRoiUsed, suggestions, considered: raw.length, blocked: blockedRows.length, blockedByStatus,
    products: keys.map((k) => ({ key: k, label: productName(k) })).sort((a, b) => a.label.localeCompare(b.label)),
  };
}
