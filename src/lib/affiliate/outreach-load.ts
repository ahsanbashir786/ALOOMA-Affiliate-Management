import "server-only";
import { sql } from "drizzle-orm";
import { rows } from "@/lib/sql";
import { loadCreatorRows } from "@/lib/creators/load";
import { kd, PK_LISTING } from "@/lib/creators/sql";
import { hasOrderSql } from "@/lib/creators/sample-status";
import { productName } from "@/lib/products/catalog";
import { addDaysISO, daysBetweenISO, todayKL } from "@/lib/time";
import { sampleGuard, saveSuggestedHint } from "./command";
import { giveMoreSamples, historyOf, PIPELINE, requestStage, type History, type MarketCreator, type MoreSample, type PipelineKey } from "./outreach";
import { evaluate, MIN_LEVEL, PREFERRED_CATEGORIES, type Profile, type Verdict } from "./eligibility";
import { outreachScopes, preferredCategories, reviewEnabled } from "@/lib/tiktok/outreach";
import { marketDue, readMarket, refreshMarket } from "./outreach-bg";

export type SampleCard = {
  id: string; creator: string; nickname: string | null; followers: number | null; product: string; sku: string | null; quantity: number | null; commission: number | null;
  stage: Exclude<PipelineKey, "suggested">; requestedOn: string | null; shippedOn: string | null; deliveredOn: string | null; expiresOn: string | null; daysLeft: number | null; approvable: boolean;
  history: History;
  creatorId: string | null;
  /** Does the creator meet your rules (category and level)? Null until checked. */
  verdict: Verdict | null;
  checkedOn: string | null;
};
export type TikTokCreator = MarketCreator & { verdict: Verdict };
export type Outreach = {
  ref: string;
  counts: Record<PipelineKey, number>;
  samples: Record<Exclude<PipelineKey, "suggested">, SampleCard[]>;
  more: (MoreSample & { verdict: Verdict | null })[];
  tiktok: { ok: true; creators: TikTokCreator[]; hidden: number; fieldsSeen: string[]; at: number | null; note: string | null } | { ok: false; error: string };
  rules: { categories: string[]; level: number; matched: { id: string; name: string }[]; missing: string[]; error: string | null };
  unchecked: number;
  guard: ReturnType<typeof sampleGuard>;
  flags: { reviewOn: boolean; write: boolean; market: boolean; connected: boolean };
};

const WINDOW_DAYS = 150;
const LIMIT = 100;

type Raw = { id: string; creator: string; nickname: string | null; followers: number | null; pk: string; sku: string | null; status: string | null; order_id: string | null; approvable: boolean | null; qty: number | null; commission: number | null;
  req: string | null; ship: string | null; dlv: string | null; ostatus: string | null; expires: string | null; has_post: boolean; creator_id: string | null };

export type Decision = { id: string; creator: string; product: string; approved: boolean; at: string; day: string; source: "app" | "tiktok"; by: string | null; approx: boolean };
export type Period = {
  start: string; end: string;
  /** Sample requests made in the chosen dates, and how far they got. */
  funnel: { requested: number; approved: number; delivered: number; posted: number; sold: number; sales: number };
  decisions: Decision[];
};

/** For the chosen dates: the outreach funnel (from your own data) and every approval or rejection, with who made it and where. */
export async function loadOutreachPeriod(range: { start: string; end: string }): Promise<Period> {
  const [f] = await rows<{ requested: number; approved: number; delivered: number; posted: number; sold: number; sales: number }>(sql`
    with req as (
      select r.id, r.creator, ${sql.raw(PK_LISTING("coalesce(k.product_id, r.product_id)"))} as pk, r.status, o.status as ostatus,
        (r.order_id is not null and r.order_id !~ '^0*$') as has_order,
        coalesce(o.delivered_at, case when o.status in ('DELIVERED', 'COMPLETED') then o.updated_at end) as dlv,
        coalesce(o.delivered_at, o.created_at, r.first_seen_at) as t0,
        least(r.first_seen_at, coalesce(o.created_at, r.first_seen_at)) as asked
      from tt_sample_requests r left join tt_orders o on o.order_id = r.order_id left join tt_skus k on k.sku_id = r.sku_id
      where r.creator is not null
    ), x as (
      select q.*,
        (q.has_order or upper(coalesce(q.status, '')) ~ 'APPROV') and upper(coalesce(q.ostatus, '')) <> 'CANCELLED' as approved,
        exists (select 1 from tt_videos v cross join lateral jsonb_array_elements(coalesce(v.products, '[]'::jsonb)) p
                where v.creator = q.creator and v.posted_at >= q.t0 - interval '1 day' and ${sql.raw(PK_LISTING("p->>'id'"))} = q.pk) as video,
        (select coalesce(sum(coalesce(a.price, 0) * coalesce(a.quantity, 1)), 0) from tt_affiliate_order_lines a left join product_map pm on pm.product_id = a.product_id
          where a.creator = q.creator and coalesce(pm.product_key, 'unmapped') = q.pk and a.created_at >= q.t0 - interval '1 day' and not coalesce(a.fully_return, false)) as sold_rm
      from req q where q.pk <> 'excluded' and ${kd("q.asked")} between ${range.start}::date and ${range.end}::date
    )
    select count(*)::int as requested, (count(*) filter (where approved))::int as approved, (count(*) filter (where approved and dlv is not null))::int as delivered,
      (count(*) filter (where approved and dlv is not null and (video or sold_rm > 0)))::int as posted, (count(*) filter (where approved and sold_rm > 0))::int as sold,
      coalesce(sum(sold_rm) filter (where approved), 0)::float8 as sales
    from x`);
  const decisions = await rows<{ id: string; creator: string; pk: string; approved: boolean; at: string; day: string; from_app: boolean; by: string | null; approx: boolean }>(sql`
    select r.id, r.creator, ${sql.raw(PK_LISTING("coalesce(k.product_id, r.product_id)"))} as pk,
      upper(coalesce(r.status, '')) !~ '(REJECT|DECLIN)' as approved,
      coalesce(ev.at, r.decided_at, o.created_at, r.first_seen_at)::text as at,
      to_char(${kd("coalesce(ev.at, r.decided_at, o.created_at, r.first_seen_at)")}, 'YYYY-MM-DD') as day,
      (ev.at is not null) as from_app, ev.name as by, (ev.at is null and r.decided_at is null) as approx
    from tt_sample_requests r
    left join tt_orders o on o.order_id = r.order_id left join tt_skus k on k.sku_id = r.sku_id
    left join lateral (select e.at, u.name from staff_events e left join users u on u.id = e.user_id
      where e.kind = 'note' and e.details->>'applicationId' = r.id and e.reverted_at is null order by e.at desc limit 1) ev on true
    where r.creator is not null and (upper(coalesce(r.status, '')) ~ '(APPROV|REJECT|DECLIN)' or (r.order_id is not null and r.order_id !~ '^0*$'))
      and ${kd("coalesce(ev.at, r.decided_at, o.created_at, r.first_seen_at)")} between ${range.start}::date and ${range.end}::date
    order by 5 desc limit 500`);
  return {
    start: range.start, end: range.end,
    funnel: f ?? { requested: 0, approved: 0, delivered: 0, posted: 0, sold: 0, sales: 0 },
    decisions: decisions.map((d) => ({ id: d.id, creator: d.creator, product: productName(d.pk), approved: d.approved, at: d.at, day: d.day, source: d.from_app ? "app" : "tiktok", by: d.by, approx: d.approx })),
  };
}

export async function loadOutreach(): Promise<Outreach | null> {
  const { all, ref } = await loadCreatorRows();
  if (!ref) return null;
  const since = addDaysISO(todayKL(), -WINDOW_DAYS);
  const raw = await rows<Raw>(sql`
    select z.creator_id, z.id, z.creator, z.nickname, z.followers, z.pk, z.sku, z.status, z.order_id, z.approvable, z.qty, z.commission, z.req, z.ship, z.dlv, z.ostatus, z.expires,
      (z.dlv is not null and (exists (select 1 from tt_videos v cross join lateral jsonb_array_elements(coalesce(v.products, '[]'::jsonb)) p
                 where v.creator = z.creator and v.posted_at >= z.t0 - interval '1 day' and ${sql.raw(PK_LISTING("p->>'id'"))} = z.pk)
         or exists (select 1 from tt_affiliate_order_lines a left join product_map pm on pm.product_id = a.product_id
                    where a.creator = z.creator and coalesce(pm.product_key, 'unmapped') = z.pk and a.created_at >= z.t0 - interval '1 day'))) as has_post
    from (
      select r.creator_id, r.id, r.creator, r.nickname, r.followers::int as followers, r.status, case when ${sql.raw(hasOrderSql("r"))} then r.order_id end as order_id, r.is_approvable as approvable,
        r.available_quantity as qty, r.commission_rate::float8 as commission, coalesce(k.seller_sku, r.sku_name) as sku, ${sql.raw(PK_LISTING("coalesce(k.product_id, r.product_id)"))} as pk,
        coalesce(o.delivered_at, o.created_at, r.first_seen_at) as t0,
        to_char(${kd("r.first_seen_at")}, 'YYYY-MM-DD') as req,
        to_char(${kd("coalesce(o.paid_at, o.created_at)")}, 'YYYY-MM-DD') as ship,
        to_char(${kd("coalesce(o.delivered_at, case when o.status in ('DELIVERED', 'COMPLETED') then o.updated_at end)")}, 'YYYY-MM-DD') as dlv,
        to_char(${kd("r.expires_at")}, 'YYYY-MM-DD') as expires,
        o.status as ostatus
      from tt_sample_requests r left join tt_orders o on o.order_id = r.order_id left join tt_skus k on k.sku_id = r.sku_id
      where r.creator is not null and (r.first_seen_at >= ${since}::date or (r.is_approvable and r.order_id is null))
    ) z where z.pk <> 'excluded'
    order by z.req desc nulls last, z.id`);

  const byName = new Map(all.map((r) => [r.username, r]));
  const prefs = await preferredCategories();
  const stored = await rows<{ open_id: string; level: number | null; category_ids: string[]; followers: number | null; pps: number | null; rating: number | null; post_rate: number | null; sample_score: number | null; fulfilment_score: number | null; official_recommend: boolean | null; rising_star: boolean | null; blocked: boolean | null; has_collaborated: boolean | null; invited_90d: boolean | null; has_profile: boolean; checked: string }>(sql`
    select open_id, level, category_ids, followers::float8 as followers, pps::float8 as pps, rating::float8 as rating, post_rate::float8 as post_rate, sample_score::float8 as sample_score, fulfilment_score::float8 as fulfilment_score,
      official_recommend, rising_star, blocked, has_collaborated, invited_90d, has_profile, to_char(checked_at at time zone 'Asia/Kuala_Lumpur', 'YYYY-MM-DD') as checked from tt_creator_profiles`);
  const profileOf = new Map(stored.map((p) => [p.open_id, p]));
  const verdictFor = (id: string | null): { v: Verdict | null; on: string | null } => {
    const p = id ? profileOf.get(id) : undefined;
    if (!p) return { v: null, on: null };
    const prof: Profile = { level: p.has_profile ? p.level : null, categoryIds: p.category_ids, blocked: p.blocked, officialRecommend: p.official_recommend, risingStar: p.rising_star, pps: p.pps, rating: p.rating, postRate: p.post_rate, sampleScore: p.sample_score, fulfilmentScore: p.fulfilment_score, hasCollaborated: p.has_collaborated, invited90d: p.invited_90d };
    return { v: evaluate(prof, prefs.ids, prefs.roots), on: p.checked };
  };
  const today = todayKL();
  const samples: Outreach["samples"] = { requested: [], approved: [], shipped: [], delivered: [], posted: [] };
  const seen = new Set<string>();
  for (const r of raw) {
    if (seen.has(r.id)) continue; seen.add(r.id);
    const stage = requestStage({ status: r.status, hasOrder: !!r.order_id, approvable: r.approvable, delivered: !!r.dlv, shipped: !!r.ship, hasPost: r.has_post, orderCancelled: (r.ostatus ?? "").toUpperCase() === "CANCELLED" });
    if (!stage) continue;
    if (stage === "requested" && r.expires && r.expires < today) continue; // TikTok will not let it be approved any more
    const vd = verdictFor(r.creator_id);
    samples[stage].push({
      id: r.id, creator: r.creator, nickname: r.nickname, followers: r.followers, product: productName(r.pk), sku: r.sku, quantity: r.qty, commission: r.commission,
      stage, requestedOn: r.req, shippedOn: r.ship, deliveredOn: r.dlv, expiresOn: r.expires, daysLeft: r.expires ? daysBetweenISO(today, r.expires) : null, approvable: r.approvable === true,
      history: historyOf(byName.get(r.creator)), creatorId: r.creator_id, verdict: vd.v, checkedOn: vd.on,
    });
  }
  // Requests that expire first are shown first: those are the ones about to be lost.
  samples.requested.sort((a, b) => (a.daysLeft ?? 999) - (b.daysLeft ?? 999));
  const unchecked = samples.requested.filter((c) => c.creatorId && !c.verdict).length;

  const [flagOn, scopes] = await Promise.all([reviewEnabled(), outreachScopes()]);
  const idByName = new Map((await rows<{ creator: string; id: string }>(sql`select distinct on (creator) creator, creator_id as id from tt_sample_requests where creator is not null and creator_id is not null order by creator, synced_at desc`)).map((r) => [r.creator, r.id]));
  // Your rules apply here too: a creator TikTok shows below level 5 or outside your categories is left out; not checked yet stays (marked).
  const more = giveMoreSamples(all).map((m) => ({ ...m, verdict: verdictFor(idByName.get(m.username) ?? null).v })).filter((m) => m.verdict?.status !== "not");
  let tiktok: Outreach["tiktok"];
  if (!scopes.connected) tiktok = { ok: false, error: "TikTok Shop is not connected." };
  else if (!scopes.market) tiktok = { ok: false, error: "TikTok has not granted the creator search permission yet. Reconnect TikTok in Settings after switching it on in Partner Center." };
  else {
    // The list is fetched in the background (worker, every 6 hours) and kept, so this screen never waits for TikTok or shows "busy".
    const m = await readMarket();
    if (marketDue(m)) void refreshMarket().catch(() => undefined);
    if (!m.at && !m.creators.length) tiktok = { ok: false, error: m.error ?? "The first list is being fetched from TikTok now. It appears here within a few minutes." };
    else tiktok = { ...judgeCreators(m.creators, prefs, m.fieldsSeen), at: m.at, note: m.error };
  }
  if (tiktok.ok) await saveSuggestedHint({ eligible: tiktok.creators.filter((c) => c.verdict.status === "eligible").length, notSure: tiktok.creators.filter((c) => c.verdict.status === "unknown").length, own: more.length, at: Date.now() }).catch(() => undefined);
  const rules = { categories: PREFERRED_CATEGORIES, level: MIN_LEVEL, matched: prefs.matched, missing: prefs.missing, error: prefs.ok ? null : prefs.error ?? null };
  const lists = Object.fromEntries(Object.entries(samples).map(([k, v]) => [k, v.slice(0, LIMIT)])) as Outreach["samples"];
  const counts = { suggested: more.length + (tiktok.ok ? tiktok.creators.length : 0), requested: samples.requested.length, approved: samples.approved.length, shipped: samples.shipped.length, delivered: samples.delivered.length, posted: samples.posted.length } as Record<PipelineKey, number>;
  void PIPELINE;
  return { ref, counts, samples: lists, more, tiktok, rules, unchecked, guard: sampleGuard(all), flags: { reviewOn: flagOn, write: scopes.write, market: scopes.market, connected: scopes.connected } };
}


/** Applies your rules to TikTok's list: eligible creators first (best fit first), then the ones we are not sure about. Not eligible ones are counted, and kept for the "show all" switch. */
export function judgeCreators(list: MarketCreator[], prefs: { ids: string[]; roots: import("./eligibility").Category[] }, fieldsSeen: string[]): { ok: true; creators: TikTokCreator[]; hidden: number; fieldsSeen: string[] } {
  const judged = list.map((c) => ({ ...c, verdict: evaluate({ level: c.level, categoryIds: c.categoryIds, blocked: c.blocked, officialRecommend: c.officialRecommend, risingStar: c.risingStar, fastGrowing: c.fastGrowing, pps: c.pps, hasCollaborated: c.hasCollaborated, invited90d: c.invited90d }, prefs.ids, prefs.roots) }));
  const rank = { eligible: 0, unknown: 1, not: 2 } as const;
  judged.sort((a, b) => rank[a.verdict.status] - rank[b.verdict.status] || (b.verdict.fit ?? 0) - (a.verdict.fit ?? 0));
  return { ok: true, creators: judged, hidden: judged.filter((c) => c.verdict.status === "not").length, fieldsSeen };
}
