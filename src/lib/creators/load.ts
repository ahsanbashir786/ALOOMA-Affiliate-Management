import "server-only";
import { sql } from "drizzle-orm";
import { rows } from "@/lib/analytics/sql";
import { creatorStatus, explainStatus, winnerThreshold, type StatusInput } from "@/lib/affiliates/status";
import { productName, productRank } from "@/lib/products/catalog";
import { refreshProductKeys } from "@/lib/products/classify";
import { addDaysISO, daysBetweenISO, dayKL, fmtDayLabel, todayKL } from "@/lib/time";
import { getWorkflowStates } from "@/lib/workflow/events";
import { getCommitments } from "@/lib/workflow/commitments";
import type { DirLine, DirRow } from "@/lib/workflow/directory";
import { creatorScore } from "./score";
import { kd, PK_LISTING, TL } from "./sql";
import { hasOrderSql, SAMPLE_OVERDUE_SQL, SAMPLE_SHIPPED_SQL } from "./sample-status";

/** A sample is "late" this many days after it was delivered with nothing posted. */
export const POST_WINDOW_DAYS = 14;
const MIN_PRODUCT_SELLERS = 5;
/** A product the creator sells without a sample still gets its own line when it sold in the last 90 days. */
const LINE_LOOKBACK_DAYS = 90;

export async function hasSyncedData(): Promise<boolean> {
  const [r] = await rows<{ n: number }>(sql`select (select count(*) from (select 1 from tt_affiliate_order_lines limit 1) x)::int + (select count(*) from (select 1 from tt_sample_requests limit 1) y)::int as n`);
  return (r?.n ?? 0) > 0;
}

/**
 * Every creator we know from the TikTok sync, with one line per product they sold or were sent a sample of.
 * Each line has its own status and action from the same rules as everywhere else (`creatorStatus`).
 * Sales are affiliate order lines that were not returned in full or cancelled; "lately" = the 28 days ending at the latest order held.
 */
type Loaded = { all: DirRow[]; ref: string | null; lately: Map<string, number> };
const cache = new Map<string, { stamp: string; at: number; value: Loaded }>();

/** Cached while nothing changed: the key is the newest sync time plus the newest staff record, so a new sync or action shows at once. */
export async function loadCreatorRows(opts: { range?: { start: string; end: string } } = {}): Promise<Loaded> {
  const [st] = await rows<{ s: string }>(sql`select concat_ws('|',
    (select max(synced_at) from tt_affiliate_order_lines), (select max(synced_at) from tt_videos), (select max(synced_at) from tt_sample_requests), (select max(synced_at) from tt_orders),
    (select max(id) from staff_events), (select max(reverted_at) from staff_events), (select count(*) from creators), (select max(id) from commitments),
    (select max(updated_at) from product_map), (select count(*) from product_map), todayKL.d) as s
    from (select to_char(now() at time zone 'Asia/Kuala_Lumpur', 'YYYY-MM-DD') as d) todayKL`);
  const key = opts.range ? `${opts.range.start}..${opts.range.end}` : "all";
  const hit = cache.get(key);
  let value: Loaded;
  if (hit && hit.stamp === st.s && Date.now() - hit.at < 5 * 60_000) value = hit.value;
  else {
    value = await computeCreatorRows(opts);
    if (cache.size > 12) cache.clear();
    cache.set(key, { stamp: st.s, at: Date.now(), value });
  }
  return withOwners(value);
}

/** Who looks after each creator changes often and changes no number, so it is read fresh each time instead of rebuilding everything. */
async function withOwners(v: Loaded): Promise<Loaded> {
  const owners = new Map((await rows<{ username: string; user_id: string | null; name: string | null }>(sql`select o.username, o.user_id, u.name from creator_owners o left join users u on u.id = o.user_id`)).map((o) => [o.username, o]));
  return { ...v, all: v.all.map((r) => { const o = owners.get(r.username); return r.extra && (r.extra.ownerId ?? null) === (o?.user_id ?? null) && (r.extra.ownerName ?? null) === (o?.name ?? null) ? r : r.extra ? { ...r, extra: { ...r.extra, ownerId: o?.user_id ?? null, ownerName: o?.name ?? null } } : r; }) };
}

async function computeCreatorRows(opts: { range?: { start: string; end: string } }): Promise<Loaded> {
  await refreshProductKeys(); // which of the 13 products every listing is (automatic), so no screen shows raw TikTok titles
  const [refRow] = await rows<{ d: string | null }>(sql`select to_char(max(${kd("created_at")}), 'YYYY-MM-DD') as d from tt_affiliate_order_lines`);
  const ref = refRow?.d ?? null;
  const s28 = ref ? addDaysISO(ref, -27) : null;
  const p28s = ref ? addDaysISO(ref, -55) : null;
  const p28e = ref ? addDaysISO(ref, -28) : null;
  const l90 = ref ? addDaysISO(ref, -(LINE_LOOKBACK_DAYS - 1)) : null;
  const w8 = ref ? addDaysISO(ref, -55) : null;
  const R = (col: string) => (opts.range ? sql`${kd(col)} between ${opts.range.start}::date and ${opts.range.end}::date` : sql`true`);
  const D = kd("tl.created_at");
  const refD = ref ?? "1970-01-01";

  const [csales, psales, weekly, vidsC, vidsP, livesC, samples, reqs, contact, owners, doneRows, names, firsts, vidsU] = await Promise.all([
    rows<{ creator: string; gmv_all: number; gmv28: number; prev28: number; ov: number; ol: number; last: string | null }>(sql`
      select tl.creator,
        coalesce(sum(tl.pay) filter (where tl.valid and ${R("tl.created_at")}), 0)::float8 as gmv_all,
        coalesce(sum(tl.pay) filter (where tl.valid and ${D} between ${s28 ?? refD}::date and ${refD}::date), 0)::float8 as gmv28,
        coalesce(sum(tl.pay) filter (where tl.valid and ${D} between ${p28s ?? refD}::date and ${p28e ?? refD}::date), 0)::float8 as prev28,
        (count(distinct tl.order_id) filter (where tl.valid and ${R("tl.created_at")} and tl.content_type = 'Video'))::int as ov,
        (count(distinct tl.order_id) filter (where tl.valid and ${R("tl.created_at")} and tl.content_type = 'Livestream'))::int as ol,
        to_char(max(${D}) filter (where tl.valid), 'YYYY-MM-DD') as last
      from ${TL} where tl.creator is not null group by tl.creator`),
    rows<{ creator: string; pid: string; ov: number; ol: number; ot: number; gv: number; gl: number; gmv: number; gmv28: number; prev28: number; gmv90: number }>(sql`
      select tl.creator, tl.pk as pid,
        (count(distinct tl.order_id) filter (where tl.valid and ${R("tl.created_at")} and tl.content_type = 'Video'))::int as ov,
        (count(distinct tl.order_id) filter (where tl.valid and ${R("tl.created_at")} and tl.content_type = 'Livestream'))::int as ol,
        (count(distinct tl.order_id) filter (where tl.valid and ${R("tl.created_at")}))::int as ot,
        coalesce(sum(tl.pay) filter (where tl.valid and ${R("tl.created_at")} and tl.content_type = 'Video'), 0)::float8 as gv,
        coalesce(sum(tl.pay) filter (where tl.valid and ${R("tl.created_at")} and tl.content_type = 'Livestream'), 0)::float8 as gl,
        coalesce(sum(tl.pay) filter (where tl.valid and ${R("tl.created_at")}), 0)::float8 as gmv,
        coalesce(sum(tl.pay) filter (where tl.valid and ${D} between ${s28 ?? refD}::date and ${refD}::date), 0)::float8 as gmv28,
        coalesce(sum(tl.pay) filter (where tl.valid and ${D} between ${p28s ?? refD}::date and ${p28e ?? refD}::date), 0)::float8 as prev28,
        coalesce(sum(tl.pay) filter (where tl.valid and ${D} between ${l90 ?? refD}::date and ${refD}::date), 0)::float8 as gmv90
      from ${TL} where tl.creator is not null group by tl.creator, tl.pk`),
    rows<{ creator: string; w: number; g: number }>(sql`
      select tl.creator, floor((${refD}::date - ${D}) / 7)::int as w, coalesce(sum(tl.pay) filter (where tl.valid), 0)::float8 as g
      from ${TL} where tl.creator is not null and ${D} between ${w8 ?? refD}::date and ${refD}::date group by 1, 2`),
    rows<{ creator: string; n: number; n28: number; last: string | null }>(sql`
      select v.creator, count(*)::int as n,
        (count(*) filter (where ${kd("v.posted_at")} between ${s28 ?? refD}::date and ${refD}::date))::int as n28,
        to_char(max(${kd("v.posted_at")}), 'YYYY-MM-DD') as last
      from tt_videos v where v.creator is not null group by v.creator`),
    rows<{ creator: string; pid: string; n: number; n28: number; last: string | null }>(sql`
      select v.creator, ${sql.raw(PK_LISTING("p->>'id'"))} as pid, (count(distinct v.video_id) filter (where ${R("v.posted_at")}))::int as n,
        (count(distinct v.video_id) filter (where ${kd("v.posted_at")} between ${s28 ?? refD}::date and ${refD}::date))::int as n28,
        to_char(max(${kd("v.posted_at")}) filter (where ${R("v.posted_at")}), 'YYYY-MM-DD') as last
      from tt_videos v cross join lateral jsonb_array_elements(coalesce(v.products, '[]'::jsonb)) as p
      where v.creator is not null and p->>'id' is not null and ${sql.raw(PK_LISTING("p->>'id'"))} <> 'excluded' group by v.creator, 2`),
    rows<{ creator: string; n: number; n28: number; last: string | null }>(sql`
      select l.creator, count(*)::int as n,
        (count(*) filter (where ${kd("l.started_at")} between ${s28 ?? refD}::date and ${refD}::date))::int as n28,
        to_char(max(${kd("l.started_at")}), 'YYYY-MM-DD') as last
      from tt_lives l where l.creator is not null group by l.creator`),
    // Samples per creator × product (one of the 13). A sample counts as "posted" when the creator posted a video that links that product,
    // or sold that product, after it was sent – this also works for old samples, because orders reach back further than the video list.
    rows<{ creator: string; pid: string; given: { sku: string; on: string; d: boolean }[] | null; sent: number; waiting: number; not_posted: number; posted: number }>(sql`
      select x.creator, x.pk as pid,
        jsonb_agg(jsonb_build_object('sku', x.sku_code, 'on', x.given_on, 'd', x.delivered) order by x.given_on) filter (where x.sku_code is not null) as given,
        count(*)::int as sent,
        (count(*) filter (where x.res = 'waiting'))::int as waiting,
        (count(*) filter (where x.res = 'not_posted'))::int as not_posted,
        (count(*) filter (where x.res = 'posted'))::int as posted
      from (
        select y.*, case when y.has_post then 'posted' when y.dlv is not null and (y.overdue or y.dlv + interval '${sql.raw(String(POST_WINDOW_DAYS))} days' < now()) then 'not_posted' else 'waiting' end as res
        from (
          select z.*,
            (exists (select 1 from tt_videos v cross join lateral jsonb_array_elements(coalesce(v.products, '[]'::jsonb)) p
                     where v.creator = z.creator and v.posted_at >= z.t0 - interval '1 day' and ${sql.raw(PK_LISTING("p->>'id'"))} = z.pk)
             or exists (select 1 from tt_affiliate_order_lines a left join product_map pm on pm.product_id = a.product_id
                        where a.creator = z.creator and coalesce(pm.product_key, 'unmapped') = z.pk and a.created_at >= z.t0 - interval '1 day')) as has_post
          from (
            -- The SKU she was sent comes from the request's SKU ID (the catalogue says which listing it belongs to); the date is when it was delivered, else shipped.
            select r.creator, coalesce(k.seller_sku, r.sku_name) as sku_code, ${sql.raw(SAMPLE_OVERDUE_SQL)} as overdue, ${sql.raw(PK_LISTING("coalesce(k.product_id, r.product_id)"))} as pk,
              coalesce(o.delivered_at, case when o.status in ('DELIVERED', 'COMPLETED') then o.updated_at end) as dlv,
              (coalesce(o.delivered_at, case when o.status in ('DELIVERED', 'COMPLETED') then o.updated_at end) is not null) as delivered,
              to_char(${kd("coalesce(o.delivered_at, case when o.status in ('DELIVERED', 'COMPLETED') then o.updated_at end, o.paid_at, o.created_at, r.first_seen_at)")}, 'YYYY-MM-DD') as given_on,
              coalesce(o.delivered_at, o.created_at, r.first_seen_at) as t0
            from tt_sample_requests r
            left join tt_orders o on o.order_id = r.order_id
            left join tt_skus k on k.sku_id = r.sku_id
            where r.creator is not null and ${sql.raw(hasOrderSql("r"))} and ${sql.raw(SAMPLE_SHIPPED_SQL)} and coalesce(upper(o.status), '') <> 'CANCELLED'
          ) z where z.pk <> 'excluded'
        ) y
      ) x group by x.creator, x.pk`),
    rows<{ creator: string; nickname: string | null; followers: number | null; gmv: number | null; fulfil: number | null; open: number }>(sql`
      select distinct on (r.creator) r.creator, r.nickname, r.followers::float8::bigint::int as followers, r.creator_gmv::float8 as gmv, r.fulfilment_pct::float8 as fulfil,
        (select count(*) from tt_sample_requests q where q.creator = r.creator and not coalesce(${sql.raw(hasOrderSql("q"))}, false) and q.is_approvable and coalesce(upper(q.status), '') !~ '(REJECT|EXPIRE|CANCEL|APPROVED)')::int as open
      from tt_sample_requests r where r.creator is not null order by r.creator, coalesce(r.synced_at, r.first_seen_at) desc`),
    rows<{ username: string; phone: string | null; approach: string | null }>(sql`select username, phone, approach from creators`),
    rows<{ username: string; user_id: string | null; name: string | null }>(sql`select o.username, o.user_id, u.name from creator_owners o left join users u on u.id = o.user_id`),
    rows<{ username: string; action: string; pid: string | null; d: string }>(sql`
      select username, details->>'action' as action, nullif(details->>'productId', '') as pid, to_char(max(at at time zone 'Asia/Kuala_Lumpur'), 'YYYY-MM-DD') as d
      from staff_events where kind = 'contacted' and reverted_at is null and details ? 'action' group by 1, 2, 3`),
    // Everyone we know by name, even with no sales yet.
    rows<{ c: string }>(sql`
      select creator as c from tt_affiliate_order_lines where creator is not null union select creator from tt_sample_requests where creator is not null
      union select creator from tt_videos where creator is not null union select creator from tt_lives where creator is not null
      union select username from creators where source = 'manual' union select username from creator_owners`),
    // The first day we see any real activity (an order, a video or a LIVE). Sample requests do not count: their dates are when we first synced them.
    rows<{ creator: string; d: string }>(sql`
      select creator, to_char(min(d), 'YYYY-MM-DD') as d from (
        select creator, ${kd("created_at")} as d from tt_affiliate_order_lines where creator is not null
        union all select creator, ${kd("posted_at")} from tt_videos where creator is not null and posted_at is not null
        union all select creator, ${kd("started_at")} from tt_lives where creator is not null and started_at is not null) x group by creator`),
    // Videos per product = TikTok's video list plus every video that produced a sale (orders reach back further than the list).
    rows<{ creator: string; pid: string; n: number; sold_only: number }>(sql`
      with listed as (
        select v.creator, ${sql.raw(PK_LISTING("p->>'id'"))} as pk, v.video_id as vid
        from tt_videos v cross join lateral jsonb_array_elements(coalesce(v.products, '[]'::jsonb)) p
        where v.creator is not null and p->>'id' is not null and ${R("v.posted_at")} group by 1, 2, 3),
      sold as (
        select tl.creator, tl.pk, tl.content_id as vid from ${TL}
        where tl.creator is not null and tl.valid and tl.content_type = 'Video' and tl.content_id is not null and ${R("tl.created_at")} group by 1, 2, 3)
      select coalesce(l.creator, s.creator) as creator, coalesce(l.pk, s.pk) as pid, count(*)::int as n, (count(*) filter (where l.vid is null))::int as sold_only
      from listed l full join sold s on s.creator = l.creator and s.pk = l.pk and s.vid = l.vid
      where coalesce(l.pk, s.pk) <> 'excluded' group by 1, 2`),
  ]);

  const usernames = names.map((n) => n.c);
  const [states, comms] = await Promise.all([getWorkflowStates(), getCommitments()]);
  const today = todayKL();
  for (const u of states.keys()) if (!usernames.includes(u)) usernames.push(u);

  const cBy = new Map(csales.map((x) => [x.creator, x]));
  const pBy = new Map<string, typeof psales>();
  for (const x of psales) (pBy.get(x.creator) ?? pBy.set(x.creator, []).get(x.creator)!).push(x);
  const wkBy = new Map<string, number[]>();
  for (const x of weekly) { const a = wkBy.get(x.creator) ?? wkBy.set(x.creator, new Array(8).fill(0)).get(x.creator)!; if (x.w >= 0 && x.w < 8) a[7 - x.w] = x.g; }
  const vcBy = new Map(vidsC.map((x) => [x.creator, x]));
  const vpBy = new Map(vidsP.map((x) => [`${x.creator}|${x.pid}`, x]));
  const vuBy = new Map(vidsU.map((x) => [`${x.creator}|${x.pid}`, x]));
  const lvBy = new Map(livesC.map((x) => [x.creator, x]));
  const smBy = new Map<string, typeof samples>();
  for (const x of samples) (smBy.get(x.creator) ?? smBy.set(x.creator, []).get(x.creator)!).push(x);
  const rqBy = new Map(reqs.map((x) => [x.creator, x]));
  const infoBy = new Map(contact.map((c) => [c.username, c]));
  const ownBy = new Map(owners.map((o) => [o.username, o]));
  const firstBy = new Map(firsts.map((x) => [x.creator, x.d]));
  const doneBy = new Map(doneRows.map((x) => [`${x.username}|${x.pid ?? ""}|${x.action}`, x.d]));

  // Winner bars: per product (top 10% of that product's sellers) when enough creators sell it, otherwise the overall bar.
  const globalWinner = winnerThreshold(csales.map((x) => x.gmv28));
  const byProduct = new Map<string, number[]>();
  for (const x of psales) (byProduct.get(x.pid) ?? byProduct.set(x.pid, []).get(x.pid)!).push(x.gmv28);
  const winnerFor = new Map<string, number>();
  for (const [pid, xs] of byProduct) winnerFor.set(pid, xs.filter((v) => v > 0).length >= MIN_PRODUCT_SELLERS ? winnerThreshold(xs) : globalWinner);
  // Where each creator's last-28-day sales sit among all who sold (0–1), for the score.
  const sold28 = csales.map((x) => x.gmv28).filter((v) => v > 0).sort((a, b) => a - b);
  const rank = (v: number) => (sold28.length ? sold28.filter((x) => x <= v).length / sold28.length : 0.5);

  const all: DirRow[] = [];
  for (const username of usernames) {
    const cs = cBy.get(username);
    const st = states.get(username);
    const paused = st?.status === "paused";
    const info = infoBy.get(username);
    const rq = rqBy.get(username);
    const vc = vcBy.get(username);
    const lv = lvBy.get(username);
    const sm = smBy.get(username) ?? [];
    const sales = pBy.get(username) ?? [];
    const outs = comms.filter((c) => c.username === username && c.state !== "fulfilled");
    const overdue = outs.some((c) => c.dueOn < today);
    const firstOut = [...outs].sort((a, b) => a.dueOn.localeCompare(b.dueOn))[0];
    const nextOpen = st?.open[0];
    const nextLabel = firstOut
      ? firstOut.dueOn < today ? `Promise ${daysBetweenISO(firstOut.dueOn, today)}d overdue` : `Promise due ${fmtDayLabel(firstOut.dueOn)}`
      : nextOpen ? `${nextOpen.kind === "resume" ? "Resume" : "Follow-up"} ${fmtDayLabel(nextOpen.dueOn)}` : null;

    // Products: everything sampled, plus anything that sold in the last 90 days.
    const pids = new Map<string, { sample?: (typeof sm)[number]; sale?: (typeof sales)[number] }>();
    for (const s of sm) pids.set(s.pid, { ...pids.get(s.pid), sample: s });
    for (const s of sales) if (pids.has(s.pid) || s.gmv90 > 0) pids.set(s.pid, { ...pids.get(s.pid), sale: s });

    const lines: DirLine[] = [];
    for (const [pid, { sample, sale }] of pids) {
      const vp = vpBy.get(`${username}|${pid}`);
      const vu = vuBy.get(`${username}|${pid}`);
      const input: StatusInput = {
        paused,
        gmv28: sale?.gmv28 ?? 0, prev28: sale?.prev28 ?? 0, gmvAll: sale?.gmv ?? 0, videos28: vp?.n28 ?? 0,
        winnerGmv: winnerFor.get(pid) || globalWinner,
        samples: { sent: sample?.sent ?? 0, waiting: sample?.waiting ?? 0, notPosted: sample?.not_posted ?? 0, posted: sample?.posted ?? 0 },
      };
      const s = creatorStatus(input);
      // Only the SKUs that were sent to her as samples, each with the date(s) given (the same SKU twice = two dates).
      const sampleSkus: NonNullable<DirLine["sampleSkus"]> = [];
      for (const g of sample?.given ?? []) { const e = sampleSkus.find((x) => x.sku === g.sku) ?? (sampleSkus.push({ sku: g.sku, times: [] }), sampleSkus[sampleSkus.length - 1]); e.times.push({ on: g.on, delivered: g.d }); }
      const skus = sampleSkus.map((x) => x.sku);
      lines.push({
        pid, name: productName(pid), skus, noSample: false, sampled: !!sample,
        ordersVideo: sale?.ov ?? 0, ordersLive: sale?.ol ?? 0, orders: sale?.ot ?? 0, gmvVideo: sale?.gv ?? 0, gmvLive: sale?.gl ?? 0, gmv: sale?.gmv ?? 0, gmv28: sale?.gmv28 ?? 0, prev28: sale?.prev28 ?? 0,
        videos: Math.max(vu?.n ?? 0, vp?.n ?? 0), videosSoldOnly: vu?.sold_only ?? 0, sampleSkus, videos28: vp?.n28 ?? 0, lastVideoOn: vp?.last ?? null, lastVideoLabel: vp?.last ? fmtDayLabel(vp.last) : null,
        lastVideoDaysAgo: vp?.last && ref ? Math.max(0, daysBetweenISO(vp.last, ref)) : null, undatedVideos: 0,
        status: s.status, action: s.action, reason: explainStatus(input, s.status), doneOn: doneBy.get(`${username}|${pid}|${s.action}`) ?? null,
      });
    }
    // The owner's product order, everywhere.
    lines.sort((a, b) => productRank(a.pid) - productRank(b.pid) || b.gmv - a.gmv);
    if (!lines.length) {
      const input: StatusInput = {
        paused, gmv28: cs?.gmv28 ?? 0, prev28: cs?.prev28 ?? 0, gmvAll: cs?.gmv_all ?? 0, videos28: vc?.n28 ?? 0, winnerGmv: globalWinner,
        samples: { sent: 0, waiting: 0, notPosted: 0, posted: 0 },
      };
      const s = creatorStatus(input);
      lines.push({
        pid: null, name: "No product yet", skus: [], noSample: true, sampled: false, ordersVideo: cs?.ov ?? 0, ordersLive: cs?.ol ?? 0, orders: 0,
        gmvVideo: 0, gmvLive: 0, gmv: 0, gmv28: cs?.gmv28 ?? 0, prev28: cs?.prev28 ?? 0, videos: 0, videos28: vc?.n28 ?? 0, lastVideoOn: null, lastVideoLabel: null, lastVideoDaysAgo: null, undatedVideos: 0,
        status: s.status, action: s.action, reason: explainStatus(input, s.status), doneOn: doneBy.get(`${username}||${s.action}`) ?? null,
      });
    }

    const ov = cs?.ov ?? 0, ol = cs?.ol ?? 0;
    const hasLive = ol > 0 || (lv?.n ?? 0) > 0, hasVideo = ov > 0 || (vc?.n ?? 0) > 0;
    const type = hasVideo && hasLive ? "Video + LIVE" : hasLive ? "LIVE" : hasVideo ? "Video" : info?.approach === "both" ? "Video + LIVE" : info?.approach === "live" ? "LIVE" : info?.approach === "video" ? "Video" : null;
    const weeks = wkBy.get(username) ?? new Array(8).fill(0);
    const posted = sm.reduce((n, s) => n + s.posted, 0), notPosted = sm.reduce((n, s) => n + s.not_posted, 0);
    const sc = creatorScore({ salesRank: cs && cs.gmv28 > 0 ? rank(cs.gmv28) : null, gmv28: cs?.gmv28 ?? 0, gmvAll: cs?.gmv_all ?? 0, posted, notPosted, fulfilmentPct: rq?.fulfil ?? null, posts28: (vc?.n28 ?? 0) + (lv?.n28 ?? 0), weeks, followers: rq?.followers ?? null });
    const own = ownBy.get(username);
    all.push({
      username, type, phone: info?.phone ?? null, lines, allLines: lines, gmvAll: cs?.gmv_all ?? 0, overdue, paused,
      lastContactedOn: st?.lastContactedAt ? dayKL(st.lastContactedAt) : null,
      extra: {
        nickname: rq?.nickname ?? null, followers: rq?.followers ?? null, creatorGmv: rq?.gmv ?? null, fulfilmentPct: rq?.fulfil ?? null,
        weeks, gmv28: cs?.gmv28 ?? 0, prev28: cs?.prev28 ?? 0, score: sc.score, tier: sc.tier, scoreWhy: sc.why, scoreParts: sc.parts,
        ownerId: own?.user_id ?? null, ownerName: own?.name ?? null,
        videosAll: vc?.n ?? 0, videos28: vc?.n28 ?? 0, livesAll: lv?.n ?? 0, lives28: lv?.n28 ?? 0,
        firstOn: firstBy.get(username) ?? null, lastVideoOn: vc?.last ?? null, lastLiveOn: lv?.last ?? null, lastSaleOn: cs?.last ?? null, requestsOpen: rq?.open ?? 0, nextLabel,
      },
    });
  }
  return { all, ref, lately: new Map(csales.map((x) => [x.creator, x.gmv28])) };
}
