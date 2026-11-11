import "server-only";
import { sql } from "drizzle-orm";
import { cache } from "react";
import { rows } from "@/lib/sql";
import { addDaysISO, daysBetweenISO, todayKL } from "@/lib/time";
import { productName } from "@/lib/products/catalog";
import { STATUS_LABEL, isBlocked } from "./status";
import { classify, type GroupKey, type Rules } from "./groups";
import { sqlFrom, type Range } from "./range";

// Every video GMV Max knows, judged on ALL of its history. Read only.
// Sources: Video Daily Results (ads_creative_daily), the Shop sync for who made a video and its sales without ads (tt_videos),
// Own Account Posts (ads_videos), Boost Sessions (ads_boosts) and the Boost Log.

export type VaultVideo = {
  key: string; creativeId: string; productId: string; title: string | null; creator: string | null; account: string | null;
  postedOn: string | null; ageDays: number | null; productKey: string | null; productLabel: string;
  cost: number; orders: number; revenue: number; roi: number | null; costPerOrder: number | null; impressions: number; clicks: number;
  cost7: number; revenue7: number; orders7: number; roi7: number | null;
  /** Results inside the chosen date range (the group itself is always judged on all history). */ rCost: number; rOrders: number; rRevenue: number; rRoi: number | null;
  firstSpend: string | null; lastSpend: string | null; daysSinceSpend: number | null; spendDays: number;
  /** Sales the video made on its own (Shop sync), with or without ads. */ organicGmv: number; views: number;
  status: string | null; /** The day TikTok's API gave that status. */ statusDay: string | null; statusLabel: string | null; boostedNow: boolean; lastLogged: string | null;
  group: GroupKey; why: string; score: number;
};
export type Vault = { today: string; rules: Rules; autoRoi: number; accountRoi: number | null; videos: VaultVideo[]; counts: Record<GroupKey, number>; freshest: string | null };

export const DEFAULT_RULES = { minOrders: 3, idleDays: 7 };
const num = (v: unknown) => (v == null ? 0 : Number(v));
const median = (xs: number[]) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

type Raw = {
  creative_id: string; product_id: string; cost: number; orders: number; revenue: number; imp: number; clk: number;
  cost7: number; rev7: number; orders7: number; cost_r: number; orders_r: number; rev_r: number; first_spend: string | null; last_spend: string | null; spend_days: number;
  last_status: string | null; status_day: string | null; ad_title: string | null; account_name: string | null;
  creator: string | null; title: string | null; posted_at: Date | string | null; organic: number; views: number;
  product_key: string | null; boosted_now: boolean; last_logged: string | null;
};

const load = cache(async (today: string, rangeFrom: string, rangeTo: string): Promise<{ raw: Raw[]; freshest: string | null }> => {
  const from7 = addDaysISO(today, -6);
  const raw = await rows<Raw>(sql`
    with agg as (
      select d.creative_id, d.product_id,
        coalesce(sum(d.cost), 0)::float8 as cost, coalesce(sum(d.orders), 0)::int as orders, coalesce(sum(d.gross_revenue), 0)::float8 as revenue,
        coalesce(sum(d.impressions), 0)::float8 as imp, coalesce(sum(d.clicks), 0)::float8 as clk,
        coalesce(sum(d.cost) filter (where d.day >= ${from7}::date), 0)::float8 as cost7,
        coalesce(sum(d.gross_revenue) filter (where d.day >= ${from7}::date), 0)::float8 as rev7,
        coalesce(sum(d.orders) filter (where d.day >= ${from7}::date), 0)::int as orders7,
        coalesce(sum(d.cost) filter (where d.day between ${rangeFrom}::date and ${rangeTo}::date), 0)::float8 as cost_r,
        (coalesce(sum(d.orders) filter (where d.day between ${rangeFrom}::date and ${rangeTo}::date), 0))::int as orders_r,
        coalesce(sum(d.gross_revenue) filter (where d.day between ${rangeFrom}::date and ${rangeTo}::date), 0)::float8 as rev_r,
        to_char(min(d.day) filter (where coalesce(d.cost, 0) > 0), 'YYYY-MM-DD') as first_spend,
        to_char(max(d.day) filter (where coalesce(d.cost, 0) > 0), 'YYYY-MM-DD') as last_spend,
        (count(distinct d.day) filter (where coalesce(d.cost, 0) > 0))::int as spend_days,
        (array_agg(d.delivery_status order by d.day desc) filter (where d.delivery_status is not null))[1] as last_status,
        to_char(max(d.day) filter (where d.delivery_status is not null), 'YYYY-MM-DD') as status_day,
        (array_agg(d.title order by d.day desc) filter (where d.title is not null))[1] as ad_title,
        (array_agg(d.account_name order by d.day desc) filter (where d.account_name is not null))[1] as account_name
      from ads_creative_daily d group by 1, 2
    ), organic as (
      -- Videos that sell on their own and have never appeared in the ads results at all.
      select v.video_id as creative_id, coalesce(v.products->0->>'id', '-') as product_id,
        0::float8 as cost, 0 as orders, 0::float8 as revenue, 0::float8 as imp, 0::float8 as clk, 0::float8 as cost7, 0::float8 as rev7, 0 as orders7, 0::float8 as cost_r, 0 as orders_r, 0::float8 as rev_r,
        null::text as first_spend, null::text as last_spend, 0 as spend_days, null::text as last_status, null::text as status_day, null::text as ad_title, null::text as account_name
      from tt_videos v where coalesce(v.gmv, 0) > 0 and not exists (select 1 from ads_creative_daily d where d.creative_id = v.video_id)
    ), allv as (select * from agg union all select * from organic)
    select a.*, v.creator, coalesce(v.title, av.title, a.ad_title) as title, coalesce(v.posted_at, av.posted_at) as posted_at,
      coalesce(v.gmv, 0)::float8 as organic, coalesce(v.views, 0)::float8 as views, pm.product_key,
      exists (select 1 from ads_boosts b where b.item_id = a.creative_id and coalesce(b.ends_at, now() + interval '1 day') > now() and coalesce(b.status, '') not ilike '%delet%') as boosted_now,
      (select to_char(max(bb.boosted_on), 'YYYY-MM-DD') from ads_boost_batch_videos bv join ads_boost_batches bb on bb.id = bv.batch_id where bv.creative_id = a.creative_id) as last_logged
    from allv a
    left join tt_videos v on v.video_id = a.creative_id
    left join lateral (select title, posted_at from ads_videos where item_id = a.creative_id limit 1) av on true
    left join product_map pm on pm.product_id = a.product_id
    where coalesce(pm.product_key, '') <> 'excluded'`);
  const [f] = await rows<{ d: string | null }>(sql`select to_char(max(day), 'YYYY-MM-DD') as d from ads_creative_daily`);
  return { raw, freshest: f?.d ?? null };
});

/** All videos, each in its group. `rules.minRoi` null = automatic (your all-time ROI, rounded up, at least 3). */
export async function vault(rules: { minRoi: number | null; minOrders: number; idleDays: number } = { minRoi: null, ...DEFAULT_RULES }, range?: Pick<Range, "from" | "to">): Promise<Vault> {
  const today = todayKL();
  const { raw, freshest } = await load(today, range ? sqlFrom(range) : sqlFrom({ from: null }), range?.to ?? today);
  const tc = raw.reduce((a, r) => a + num(r.cost), 0), tr = raw.reduce((a, r) => a + num(r.revenue), 0);
  const accountRoi = tc > 0 ? tr / tc : null;
  const autoRoi = Math.max(3, Math.ceil(accountRoi ?? 5));
  const R: Rules = { minRoi: rules.minRoi ?? autoRoi, minOrders: rules.minOrders, idleDays: rules.idleDays };
  const typical7 = median(raw.filter((r) => num(r.cost7) > 0).map((r) => num(r.cost7)));
  const counts = { stopped: 0, promise: 0, underfed: 0, never: 0, winning: 0, fading: 0, wasting: 0, blocked: 0, other: 0 } as Record<GroupKey, number>;
  const videos = raw.map((r): VaultVideo => {
    const cost = num(r.cost), orders = num(r.orders), revenue = num(r.revenue), cost7 = num(r.cost7), revenue7 = num(r.rev7);
    const roi = cost > 0 ? revenue / cost : null;
    const daysSinceSpend = r.last_spend ? Math.max(0, daysBetweenISO(r.last_spend, today)) : null;
    const posted = r.posted_at ? new Date(r.posted_at).toISOString().slice(0, 10) : null;
    const { group, why } = classify({ cost, orders, revenue, cost7, revenue7, daysSinceSpend, blocked: isBlocked(r.last_status), typical7 }, R);
    counts[group]++;
    const organic = num(r.organic);
    const score = group === "never" ? Math.log(1 + organic) : (roi ?? 0) * Math.log(1 + orders) * (group === "stopped" ? 1.3 : 1);
    return {
      key: `${r.creative_id}|${r.product_id}`, creativeId: r.creative_id, productId: r.product_id, title: r.title, creator: r.creator, account: r.account_name,
      postedOn: posted, ageDays: posted ? Math.max(0, daysBetweenISO(posted, today)) : null,
      productKey: r.product_key, productLabel: r.product_key ? productName(r.product_key) : r.product_id === "-" ? "Unknown product" : `Product ${r.product_id.slice(-6)}`,
      cost, orders, revenue, roi, costPerOrder: orders > 0 && cost > 0 ? cost / orders : null, impressions: num(r.imp), clicks: num(r.clk),
      cost7, revenue7, orders7: num(r.orders7), roi7: cost7 > 0 ? revenue7 / cost7 : null,
      rCost: num(r.cost_r), rOrders: num(r.orders_r), rRevenue: num(r.rev_r), rRoi: num(r.cost_r) > 0 ? num(r.rev_r) / num(r.cost_r) : null,
      firstSpend: r.first_spend, lastSpend: r.last_spend, daysSinceSpend, spendDays: num(r.spend_days), organicGmv: organic, views: num(r.views),
      status: r.last_status, statusDay: r.status_day, statusLabel: r.last_status ? (STATUS_LABEL[r.last_status] ?? r.last_status) : null, boostedNow: !!r.boosted_now, lastLogged: r.last_logged,
      group, why: group === "never" && organic > 0 ? `Never in ads, yet it sold RM ${Math.round(organic).toLocaleString("en-MY")} on its own` : why, score,
    };
  }).sort((a, b) => b.score - a.score);
  return { today, rules: R, autoRoi, accountRoi, videos, counts, freshest };
}
