import "server-only";
import { sql } from "drizzle-orm";
import { rows } from "@/lib/analytics/sql";
import { dayKL, fmtDayLabel, addDaysISO, daysBetweenISO, weekStartISO } from "@/lib/time";
import type { DirRow } from "@/lib/workflow/directory";
import { loadCreatorRows, POST_WINDOW_DAYS } from "./load";
import { productName } from "@/lib/products/catalog";
import { kd, PK_LISTING, TL } from "./sql";
import { hasOrderSql, isOverdueStatus, isShippedStatus } from "./sample-status";

export type SampleResult = "posted" | "waiting" | "not_posted" | "pending" | "closed";
export type ProfileSample = {
  id: string;
  product: string;
  sku: string | null;
  requestedOn: string | null;
  shippedOn: string | null;
  deliveredOn: string | null;
  postByOn: string | null;
  result: SampleResult;
  /** "Delivered", "On the way", "Waiting for your decision", "Declined" … in plain words. */
  stage: string;
  daysToPost: number | null;
};
export type CreatorProfile = {
  row: DirRow;
  firstSeenOn: string | null;
  /** 26 weeks of sales, oldest first: week start, from videos, from LIVE (RM). */
  weeks: { week: string; video: number; live: number }[];
  samples: ProfileSample[];
  videos: { id: string; title: string | null; postedOn: string | null; views: number; gmv: number; units: number; products: string[] }[];
  lives: { id: string; title: string | null; on: string | null; minutes: number | null; gmv: number; items: number; viewers: number; newFollowers: number }[];
  orders: { orderId: string; on: string; product: string; qty: number; amount: number; type: string; state: "Counted" | "Returned" | "Cancelled" }[];
  totals: { orders: number; units: number; gmv: number; aov: number; commission90: number; returnPct: number | null };
};

/** Everything the creator profile page shows, from the TikTok sync. null when we have never seen this creator. */
export async function getCreatorProfile(username: string): Promise<CreatorProfile | null> {
  const { all, ref } = await loadCreatorRows();
  const row = all.find((r) => r.username === username);
  if (!row) return null;
  const refD = ref ?? dayKL(Date.now());
  // 26 whole weeks (Monday to Sunday), the last one being the week of the latest order.
  const lastMon = weekStartISO(refD);
  const w26 = addDaysISO(lastMon, -25 * 7);

  const [weekly, samples, videos, lives, orders, tot, first] = await Promise.all([
    rows<{ w: string; v: number; l: number }>(sql`
      select to_char(date_trunc('week', ${kd("tl.created_at")}::timestamp), 'YYYY-MM-DD') as w,
        coalesce(sum(tl.pay) filter (where tl.valid and tl.content_type <> 'Livestream'), 0)::float8 as v,
        coalesce(sum(tl.pay) filter (where tl.valid and tl.content_type = 'Livestream'), 0)::float8 as l
      from ${TL} where tl.creator = ${username} and ${kd("tl.created_at")} >= ${w26}::date group by 1`),
    rows<{ id: string; pk: string; sku: string | null; status: string | null; req: string | null; ship: string | null; dlv: string | null; ostatus: string | null; has_post: boolean; first_post: string | null; order_id: string | null; approvable: boolean | null }>(sql`
      select z.id, z.pk, z.sku, z.status, z.order_id, z.approvable, z.req, z.ship, z.dlv, z.ostatus,
        (exists (select 1 from tt_videos v cross join lateral jsonb_array_elements(coalesce(v.products, '[]'::jsonb)) p
                 where v.creator = z.creator and v.posted_at >= z.t0 - interval '1 day' and ${sql.raw(PK_LISTING("p->>'id'"))} = z.pk)
         or exists (select 1 from tt_affiliate_order_lines a left join product_map pm on pm.product_id = a.product_id
                    where a.creator = z.creator and coalesce(pm.product_key, 'unmapped') = z.pk and a.created_at >= z.t0 - interval '1 day')) as has_post,
        (select to_char(min(${kd("v.posted_at")}), 'YYYY-MM-DD') from tt_videos v cross join lateral jsonb_array_elements(coalesce(v.products, '[]'::jsonb)) p
          where v.creator = z.creator and v.posted_at >= z.t0 - interval '1 day' and ${sql.raw(PK_LISTING("p->>'id'"))} = z.pk) as first_post
      from (
        select r.id, r.creator, r.status, case when ${sql.raw(hasOrderSql("r"))} then r.order_id end as order_id, r.is_approvable as approvable, r.first_seen_at, coalesce(k.seller_sku, r.sku_name) as sku, ${sql.raw(PK_LISTING("coalesce(k.product_id, r.product_id)"))} as pk,
          coalesce(o.delivered_at, o.created_at, r.first_seen_at) as t0,
          to_char(${kd("r.first_seen_at")}, 'YYYY-MM-DD') as req,
          to_char(${kd("coalesce(o.paid_at, o.created_at)")}, 'YYYY-MM-DD') as ship,
          to_char(${kd("coalesce(o.delivered_at, case when o.status in ('DELIVERED', 'COMPLETED') then o.updated_at end)")}, 'YYYY-MM-DD') as dlv,
          o.status as ostatus
        from tt_sample_requests r left join tt_orders o on o.order_id = r.order_id left join tt_skus k on k.sku_id = r.sku_id
        where r.creator = ${username}
      ) z where z.pk <> 'excluded' order by z.first_seen_at desc`),
    rows<{ id: string; title: string | null; posted: string | null; views: number | null; gmv: number; units: number; products: { id: string | null }[] | null }>(sql`
      select v.video_id as id, v.title, to_char(${kd("v.posted_at")}, 'YYYY-MM-DD') as posted, v.views::float8 as views,
        coalesce((select sum(w.gmv) from tt_video_windows w where w.video_id = v.video_id), v.gmv, 0)::float8 as gmv,
        coalesce((select sum(w.units_sold) from tt_video_windows w where w.video_id = v.video_id), v.units_sold, 0)::int as units, v.products
      from tt_videos v where v.creator = ${username} order by v.posted_at desc nulls last limit 6`),
    rows<{ id: string; title: string | null; on: string | null; minutes: number | null; gmv: number; items: number; viewers: number; fol: number }>(sql`
      select l.live_id as id, l.title, to_char(${kd("l.started_at")}, 'YYYY-MM-DD') as on,
        (extract(epoch from (l.ended_at - l.started_at)) / 60)::float8 as minutes, coalesce(l.gmv, 0)::float8 as gmv, coalesce(l.items_sold, 0)::int as items, coalesce(l.viewers, 0)::float8 as viewers, coalesce(l.new_followers, 0)::int as fol
      from tt_lives l where l.creator = ${username} order by l.started_at desc nulls last limit 6`),
    rows<{ order_id: string; on: string; pid: string | null; qty: number; pay: number; type: string; valid: boolean; returned: boolean }>(sql`
      select tl.order_id, to_char(${kd("tl.created_at")}, 'YYYY-MM-DD') as on, tl.pk as pid, tl.qty::int as qty, tl.pay::float8 as pay, tl.content_type as type, tl.valid,
        coalesce((select a.fully_return from tt_affiliate_order_lines a where a.order_id = tl.order_id and a.sku_id = tl.sku_id), false) as returned
      from ${TL} where tl.creator = ${username} order by tl.created_at desc limit 12`),
    rows<{ orders: number; units: number; gmv: number; comm90: number; bad: number; n: number }>(sql`
      select (count(distinct tl.order_id) filter (where tl.valid))::int as orders, coalesce(sum(tl.qty) filter (where tl.valid), 0)::int as units,
        coalesce(sum(tl.pay) filter (where tl.valid), 0)::float8 as gmv,
        coalesce(sum(tl.comm) filter (where tl.valid and ${kd("tl.created_at")} >= ${addDaysISO(refD, -89)}::date), 0)::float8 as comm90,
        (count(*) filter (where not tl.valid))::int as bad, count(*)::int as n
      from ${TL} where tl.creator = ${username}`),
    rows<{ d: string | null }>(sql`
      select to_char(min(d), 'YYYY-MM-DD') as d from (
        select ${kd("created_at")} as d from tt_affiliate_order_lines where creator = ${username}
        union all select ${kd("posted_at")} from tt_videos where creator = ${username}
        union all select ${kd("first_seen_at")} from tt_sample_requests where creator = ${username}) x`),
  ]);

  // Video product links are TikTok listing IDs; show them as your 13 products.
  const listingKey = new Map((await rows<{ product_id: string; product_key: string }>(sql`select product_id, product_key from product_map`)).map((r) => [r.product_id, r.product_key]));

  const wk = new Map(weekly.map((x) => [x.w, x]));
  const weeks: CreatorProfile["weeks"] = [];
  for (let i = 0; i < 26; i++) {
    const key = addDaysISO(w26, i * 7);
    weeks.push({ week: key, video: wk.get(key)?.v ?? 0, live: wk.get(key)?.l ?? 0 });
  }

  const nowDay = dayKL(Date.now());
  const sampleList: ProfileSample[] = samples.map((s) => {
    const st = (s.status ?? "").toUpperCase();
    const dead = !isShippedStatus(st) || (s.ostatus ?? "").toUpperCase() === "CANCELLED";
    const postBy = s.dlv ? addDaysISO(s.dlv, POST_WINDOW_DAYS) : null;
    const result: SampleResult = dead ? "closed" : !s.order_id ? "pending" : s.has_post ? "posted" : s.dlv && (isOverdueStatus(st) || (postBy && postBy < nowDay)) ? "not_posted" : "waiting";
    const stage = dead ? (/REJECT/.test(st) ? "Declined" : /EXPIRE/.test(st) ? "Request expired" : "Cancelled") : !s.order_id ? (s.approvable ? "Waiting for your decision" : "Requested") : s.dlv ? (isOverdueStatus(st) ? "Delivered · overdue on TikTok" : "Delivered") : "On the way";
    return { id: s.id, product: productName(s.pk), sku: s.sku, requestedOn: s.req, shippedOn: s.ship, deliveredOn: s.dlv, postByOn: postBy, result, stage, daysToPost: result === "posted" && s.first_post && s.dlv ? Math.max(0, daysBetweenISO(s.dlv, s.first_post)) : null };
  });

  const t = tot[0];
  return {
    row,
    firstSeenOn: first[0]?.d ?? null,
    weeks,
    samples: sampleList,
    videos: videos.map((v) => ({ id: v.id, title: v.title, postedOn: v.posted, views: v.views ?? 0, gmv: v.gmv, units: v.units, products: (v.products ?? []).map((p) => (p.id && listingKey.get(p.id) !== "excluded" ? productName(listingKey.get(p.id ?? "") ?? null) : "")).filter((x, i, a) => x && a.indexOf(x) === i) })),
    lives: lives.map((l) => ({ id: l.id, title: l.title, on: l.on, minutes: l.minutes, gmv: l.gmv, items: l.items, viewers: l.viewers, newFollowers: l.fol })),
    orders: orders.map((o) => ({ orderId: o.order_id, on: o.on, product: productName(o.pid), qty: o.qty, amount: o.pay, type: o.type, state: o.valid ? "Counted" : o.returned ? "Returned" : "Cancelled" })),
    totals: { orders: t?.orders ?? 0, units: t?.units ?? 0, gmv: t?.gmv ?? 0, aov: t && t.orders ? t.gmv / t.orders : 0, commission90: t?.comm90 ?? 0, returnPct: t && t.n ? (t.bad / t.n) * 100 : null },
  };
}

export const dayLabel = (d: string | null) => (d ? fmtDayLabel(d) : "–");
