import "server-only";
import { sql } from "drizzle-orm";
import { rows } from "@/lib/sql";
import { addDaysISO, daysBetweenISO, todayKL } from "@/lib/time";
import { kd, PK_LISTING, TL } from "@/lib/creators/sql";
import { SAMPLE_OVERDUE_SQL, SAMPLE_SHIPPED_SQL, hasOrderSql } from "@/lib/creators/sample-status";
import { PRODUCTS, UNMAPPED, productName, productRank } from "./catalog";
import { refreshProductKeys } from "./classify";
import { BUCKETS, HIT_ORDERS, HIT_WINDOW, bucketOfAge, diagnose, type Bucket, type Diagnosis, type Hit, type Metrics, type Pair } from "./diagnose";

export type Period = { start: string; end: string; prevStart: string; prevEnd: string; days: number; custom: boolean };
export type Funnel = { sent: number; delivered: number; posted: number; sold: number; notPosted: number; salesPerSample: number | null; medianDays: number | null };
export type NewContent = { matured: number; converting: number; rate: number | null; salesPerVideo: number | null; views: number | null; ctr: number | null };
export type CreatorRow = { name: string; now: number; prev: number; share: number; mix: Record<Bucket, number>; isNew: boolean };
export type TopContent = { id: string; creator: string; kind: "video" | "live"; postDay: string | null; estimated: boolean; orders: number; sales: number; ageDays: number | null; url: string | null };
export type ProductAnalysis = {
  key: string;
  name: string;
  metrics: Metrics;
  diagnosis: Diagnosis;
  orders: Pair;
  /** Last 12 weeks ending at the period end, oldest first; each week split by content age. */
  weekly: { start: string; b: Record<Bucket, number> }[];
  ageCurve: { band: string; sales: number; contents: number }[];
  newContent: { now: NewContent; prev: NewContent };
  creators: CreatorRow[];
  /** Every creator who sold this product in the period or the one before (the Execution Plan names people from this). */
  creatorsAll: CreatorRow[];
  /** Delivered samples of this product, 14+ days old, with no video and no sale since (within the compared periods). */
  unposted: { creator: string; givenOn: string; days: number }[];
  creatorStats: { active: Pair; fresh: number; quiet: number; top1: number; top3: number; top10: number };
  samples: { now: Funnel; prev: Funnel };
  quality: { lines: Pair; reasons: { reason: string; n: number }[] };
  topContent: TopContent[];
};
export type Analysis = { period: Period; ref: string | null; videoCoverFrom: string | null; estimatedSharePct: number | null; products: ProductAnalysis[] };

const emptyB = (): Record<Bucket, number> => ({ new: 0, recent: 0, old: 0, veryold: 0, live: 0, other: 0 });
const AGE_BANDS = [{ band: "0–7 days", max: 7 }, { band: "8–14 days", max: 14 }, { band: "15–30 days", max: 30 }, { band: "31–60 days", max: 60 }, { band: "61–90 days", max: 90 }, { band: "Over 90 days", max: 99999 }];
const WEEKS = 12;
const SAMPLE_WINDOW = 45;

/** The period to look at and the equal one before it. Default: the last 28 days ending at the latest order we hold. */
export async function resolvePeriod(range?: { start: string; end: string }): Promise<{ period: Period; ref: string | null }> {
  const [r] = await rows<{ d: string | null }>(sql`select to_char(max(${kd("created_at")}), 'YYYY-MM-DD') as d from tt_affiliate_order_lines`);
  const ref = r?.d ?? null;
  const end = range?.end ?? ref ?? todayKL();
  const start = range?.start ?? addDaysISO(end, -27);
  const days = daysBetweenISO(start, end) + 1;
  const prevEnd = addDaysISO(start, -1);
  return { period: { start, end, prevStart: addDaysISO(prevEnd, -(days - 1)), prevEnd, days, custom: !!range }, ref };
}

type Line = { pk: string; creator: string; oid: string; cid: string | null; ct: string; day: string; pay: number; valid: boolean };
const median = (a: number[]) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor((a.length - 1) / 2)] : null);

type Cached = { stamp: string; at: number; value: Analysis };
const cache = new Map<string, Cached>();

export async function analyseProducts(range?: { start: string; end: string }): Promise<Analysis> {
  const { period, ref } = await resolvePeriod(range);
  const [st] = await rows<{ s: string }>(sql`select concat_ws('|', (select max(synced_at) from tt_affiliate_order_lines), (select max(synced_at) from tt_videos), (select max(synced_at) from tt_sample_requests), (select max(synced_at) from tt_orders), (select max(updated_at) from product_map), (select count(*) from product_map), ${todayKL()}::text) as s`);
  const key = `${period.start}|${period.end}`;
  const hit = cache.get(key);
  if (hit && hit.stamp === st.s && Date.now() - hit.at < 5 * 60_000) return hit.value;
  const value = await compute(period, ref);
  if (cache.size > 8) cache.clear();
  cache.set(key, { stamp: st.s, at: Date.now(), value });
  return value;
}

async function compute(period: Period, ref: string | null): Promise<Analysis> {
  await refreshProductKeys();
  const spanStart = period.prevStart < addDaysISO(period.end, -(WEEKS * 7 - 1)) ? period.prevStart : addDaysISO(period.end, -(WEEKS * 7 - 1));
  const D = kd("tl.created_at");
  const [lines, firstSale, creatorFirst, videos, cover, sampleRows, reasons] = await Promise.all([
    rows<Line>(sql`
      select tl.pk, tl.creator, tl.order_id as oid, tl.content_id as cid, tl.content_type as ct, to_char(${D}, 'YYYY-MM-DD') as day, tl.pay::float8 as pay, tl.valid
      from ${TL} where tl.creator is not null and ${D} between ${spanStart}::date and ${period.end}::date`),
    rows<{ cid: string; d: string }>(sql`select tl.content_id as cid, to_char(min(${D}), 'YYYY-MM-DD') as d from ${TL} where tl.content_id is not null group by 1`),
    rows<{ creator: string; pk: string; d: string }>(sql`select tl.creator, tl.pk, to_char(min(${D}) filter (where tl.valid), 'YYYY-MM-DD') as d from ${TL} where tl.creator is not null group by 1, 2`),
    rows<{ id: string; creator: string; day: string; views: number; ctr: number | null; pks: string[] }>(sql`
      select v.video_id as id, v.creator, to_char(${kd("v.posted_at")}, 'YYYY-MM-DD') as day,
        coalesce((select sum(w.views) from tt_video_windows w where w.video_id = v.video_id), v.views, 0)::float8 as views, v.click_through_rate::float8 as ctr,
        array_agg(distinct ${sql.raw(PK_LISTING("p->>'id'"))}) as pks
      from tt_videos v cross join lateral jsonb_array_elements(coalesce(v.products, '[]'::jsonb)) p
      where v.posted_at is not null and v.creator is not null and p->>'id' is not null group by v.video_id, v.creator, v.posted_at, v.views, v.click_through_rate`),
    rows<{ d: string | null }>(sql`select to_char(coalesce((select min(window_start) from tt_video_windows), (select min(${kd("posted_at")}) from tt_videos)), 'YYYY-MM-DD') as d`),
    rows<{ creator: string; pk: string; given_on: string; delivered: boolean; has_video: boolean }>(sql`
      select z.creator, z.pk, z.given_on, z.delivered,
        exists (select 1 from tt_videos v cross join lateral jsonb_array_elements(coalesce(v.products, '[]'::jsonb)) p
                where v.creator = z.creator and v.posted_at >= z.t0 - interval '1 day' and ${sql.raw(PK_LISTING("p->>'id'"))} = z.pk) as has_video
      from (
        select r.creator, ${sql.raw(PK_LISTING("coalesce(k.product_id, r.product_id)"))} as pk,
          (coalesce(o.delivered_at, case when o.status in ('DELIVERED', 'COMPLETED') then o.updated_at end) is not null) as delivered,
          to_char(${kd("coalesce(o.delivered_at, case when o.status in ('DELIVERED', 'COMPLETED') then o.updated_at end, o.paid_at, o.created_at, r.first_seen_at)")}, 'YYYY-MM-DD') as given_on,
          coalesce(o.delivered_at, o.created_at, r.first_seen_at) as t0
        from tt_sample_requests r left join tt_orders o on o.order_id = r.order_id left join tt_skus k on k.sku_id = r.sku_id
        where r.creator is not null and ${sql.raw(hasOrderSql("r"))} and ${sql.raw(SAMPLE_SHIPPED_SQL)} and coalesce(upper(o.status), '') <> 'CANCELLED'
      ) z where z.pk <> 'excluded' and z.given_on between ${period.prevStart} and ${period.end}`),
    rows<{ pk: string; reason: string; n: number }>(sql`
      select tl.pk, coalesce(nullif(c.reason, ''), nullif(r.reason, ''), 'No reason given') as reason, count(*)::int as n
      from ${TL} left join tt_cancellations c on c.order_id = tl.order_id left join tt_returns r on r.order_id = tl.order_id
      where not tl.valid and ${D} between ${period.start}::date and ${period.end}::date group by 1, 2`),
  ]);
  void SAMPLE_OVERDUE_SQL;

  const postDay = new Map<string, string>(); // real posting day from TikTok's video list
  for (const v of videos) if (!postDay.has(v.id) || v.day < postDay.get(v.id)!) postDay.set(v.id, v.day);
  const fsDay = new Map(firstSale.map((f) => [f.cid, f.d]));
  const cfs = new Map(creatorFirst.map((c) => [`${c.creator}|${c.pk}`, c.d]));
  const coverFrom = cover[0]?.d ?? null;
  const observable = (start: string) => coverFrom != null && start >= coverFrom;

  const inNow = (d: string) => d >= period.start && d <= period.end;
  const inPrev = (d: string) => d >= period.prevStart && d <= period.prevEnd;
  const ageOf = (cid: string, day: string) => { const p = postDay.get(cid) ?? fsDay.get(cid); return p ? Math.max(0, daysBetweenISO(p, day)) : null; };
  const bucketOf = (l: Line): Bucket => {
    if (l.ct === "Livestream") return "live";
    if (l.ct === "Video" && l.cid) { const a = ageOf(l.cid, l.day); return a == null ? "other" : bucketOfAge(a); }
    return "other";
  };

  type Acc = {
    sales: Pair; orders: { now: Set<string>; prev: Set<string> }; creators: { now: Map<string, number>; prev: Map<string, number> };
    buckets: { now: Record<Bucket, number>; prev: Record<Bucket, number> }; bad: Pair; all: Pair;
    weekly: Record<Bucket, number>[]; age: { sales: number; ids: Set<string> }[]; mix: Map<string, Record<Bucket, number>>;
    content: Map<string, { creator: string; kind: "video" | "live"; orders: Set<string>; sales: number; firstDay: string }>;
    videoOrders: Map<string, { oids: Set<string>; pay: number }>; // per video: orders and sales within 14 days of posting
    salesLines: { creator: string; day: string; pay: number }[];
  };
  const accs = new Map<string, Acc>();
  const A = (pk: string): Acc => accs.get(pk) ?? (accs.set(pk, { sales: { now: 0, prev: 0 }, orders: { now: new Set(), prev: new Set() }, creators: { now: new Map(), prev: new Map() }, buckets: { now: emptyB(), prev: emptyB() }, bad: { now: 0, prev: 0 }, all: { now: 0, prev: 0 }, weekly: Array.from({ length: WEEKS }, emptyB), age: AGE_BANDS.map(() => ({ sales: 0, ids: new Set<string>() })), mix: new Map(), content: new Map(), videoOrders: new Map(), salesLines: [] }), accs.get(pk)!);

  for (const l of lines) {
    const a = A(l.pk);
    const now = inNow(l.day), prev = inPrev(l.day);
    if (now) a.all.now++; else if (prev) a.all.prev++;
    if (!l.valid) { if (now) a.bad.now++; else if (prev) a.bad.prev++; continue; }
    const b = bucketOf(l);
    if (now || prev) {
      const side = now ? "now" : "prev";
      a.sales[side] += l.pay; a.orders[side].add(l.oid); a.buckets[side][b] += l.pay;
      a.creators[side].set(l.creator, (a.creators[side].get(l.creator) ?? 0) + l.pay);
    }
    if (now) {
      const mx = a.mix.get(l.creator) ?? a.mix.set(l.creator, emptyB()).get(l.creator)!; mx[b] += l.pay;
      if (b !== "other" && l.cid) {
        const c = a.content.get(l.cid) ?? a.content.set(l.cid, { creator: l.creator, kind: b === "live" ? "live" : "video", orders: new Set(), sales: 0, firstDay: l.day }).get(l.cid)!;
        c.orders.add(l.oid); c.sales += l.pay; if (l.day < c.firstDay) c.firstDay = l.day;
      }
      if (l.ct === "Video" && l.cid) { const ag = ageOf(l.cid, l.day); if (ag != null) { const i = AGE_BANDS.findIndex((x) => ag <= x.max); a.age[i].sales += l.pay; a.age[i].ids.add(l.cid); } }
    }
    const w = Math.floor(daysBetweenISO(l.day, period.end) / 7);
    if (w >= 0 && w < WEEKS) a.weekly[w][b] += l.pay;
    a.salesLines.push({ creator: l.creator, day: l.day, pay: l.pay });
    if (l.ct === "Video" && l.cid) {
      const p = postDay.get(l.cid);
      if (p && l.day >= p && daysBetweenISO(p, l.day) <= HIT_WINDOW) { const vo = a.videoOrders.get(l.cid) ?? a.videoOrders.set(l.cid, { oids: new Set(), pay: 0 }).get(l.cid)!; vo.oids.add(l.oid); vo.pay += l.pay; }
    }
  }

  // Videos linking each product, posted in each period; the cohort old enough to judge (posted at least 14 days before the period ends).
  const vids = new Map<string, { id: string; day: string; views: number; ctr: number | null }[]>();
  for (const v of videos) for (const pk of v.pks) (vids.get(pk) ?? vids.set(pk, []).get(pk)!).push(v);
  const newContent = (pk: string, start: string, end: string): NewContent & { posted: number } => {
    const list = (vids.get(pk) ?? []).filter((v) => v.day >= start && v.day <= end);
    const matured = list.filter((v) => v.day <= addDaysISO(end, -HIT_WINDOW));
    const acc = A(pk);
    let conv = 0, pay = 0;
    for (const v of matured) { const vo = acc.videoOrders.get(v.id); if (vo && vo.oids.size >= HIT_ORDERS) conv++; pay += vo?.pay ?? 0; }
    const ctrs = matured.map((v) => v.ctr).filter((x): x is number => x != null);
    return { posted: list.length, matured: matured.length, converting: conv, rate: matured.length ? (conv / matured.length) * 100 : null, salesPerVideo: matured.length ? pay / matured.length : null, views: matured.length ? matured.reduce((n, v) => n + v.views, 0) / matured.length : null, ctr: ctrs.length ? (ctrs.reduce((n, x) => n + x, 0) / ctrs.length) * 100 : null };
  };

  const samplesBy = new Map<string, typeof sampleRows>();
  for (const s of sampleRows) (samplesBy.get(s.pk) ?? samplesBy.set(s.pk, []).get(s.pk)!).push(s);
  const funnel = (pk: string, start: string, end: string): Funnel => {
    const list = (samplesBy.get(pk) ?? []).filter((s) => s.given_on >= start && s.given_on <= end);
    const acc = A(pk);
    const byCreator = new Map<string, typeof sampleRows>();
    for (const s of list) (byCreator.get(s.creator) ?? byCreator.set(s.creator, []).get(s.creator)!).push(s);
    let delivered = 0, posted = 0, sold = 0, notPosted = 0, pay = 0; const days: number[] = [];
    const all = samplesBy.get(pk) ?? [];
    for (const s of list) {
      const sales = acc.salesLines.filter((x) => x.creator === s.creator && x.day >= s.given_on);
      const first = sales.length ? sales.reduce((m, x) => (x.day < m ? x.day : m), "9999") : null;
      const didSell = s.delivered && first != null;
      if (s.delivered) delivered++;
      if (didSell) sold++;
      if (s.has_video || didSell) posted++;
      else if (s.delivered && daysBetweenISO(s.given_on, period.end) >= 14) notPosted++;
      if (didSell && first) days.push(daysBetweenISO(s.given_on, first));
    }
    // Sales within 45 days of a sample go to the latest sample the creator had at that time (so two samples never count the same sale).
    for (const l of acc.salesLines) {
      const mine = all.filter((s) => s.creator === l.creator && s.delivered && s.given_on <= l.day && daysBetweenISO(s.given_on, l.day) <= SAMPLE_WINDOW).sort((x, y) => (x.given_on < y.given_on ? 1 : -1))[0];
      if (mine && mine.given_on >= start && mine.given_on <= end) pay += l.pay;
    }
    return { sent: list.length, delivered, posted, sold, notPosted, salesPerSample: list.length ? pay / list.length : null, medianDays: median(days) };
  };

  const unposted = (pk: string) => {
    const acc = A(pk);
    const out: { creator: string; givenOn: string; days: number }[] = [];
    for (const s of samplesBy.get(pk) ?? []) {
      const days = daysBetweenISO(s.given_on, period.end);
      if (!s.delivered || s.has_video || days < 14 || days > 120) continue;
      if (acc.salesLines.some((x) => x.creator === s.creator && x.day >= s.given_on)) continue;
      out.push({ creator: s.creator, givenOn: s.given_on, days });
    }
    return out.sort((x, y) => x.days - y.days).slice(0, 600);
  };

  const keys = [...PRODUCTS.map((p) => p.key as string), ...[...accs.keys()].filter((k) => k === UNMAPPED)].sort((a, b) => productRank(a) - productRank(b));
  const reasonBy = new Map<string, { reason: string; n: number }[]>();
  for (const r of reasons) (reasonBy.get(r.pk) ?? reasonBy.set(r.pk, []).get(r.pk)!).push({ reason: r.reason, n: r.n });

  let estSales = 0, allSales = 0;
  const products: ProductAnalysis[] = keys.map((pk) => {
    const a = A(pk);
    const nowC = newContent(pk, period.start, period.end), prevC = newContent(pk, period.prevStart, period.prevEnd);
    const obsNow = observable(period.start), obsPrev = observable(period.prevStart);
    const creators = [...new Set([...a.creators.now.keys(), ...a.creators.prev.keys()])].map((name) => {
      const first = cfs.get(`${name}|${pk}`);
      return { name, now: a.creators.now.get(name) ?? 0, prev: a.creators.prev.get(name) ?? 0, share: a.sales.now > 0 ? ((a.creators.now.get(name) ?? 0) / a.sales.now) * 100 : 0, mix: a.mix.get(name) ?? emptyB(), isNew: first != null && inNow(first) } satisfies CreatorRow;
    }).sort((x, y) => y.now - x.now || y.prev - x.prev);
    const sortedNow = creators.filter((c) => c.now > 0);
    const topShare = (n: number) => (a.sales.now > 0 ? (sortedNow.slice(0, n).reduce((s, c) => s + c.now, 0) / a.sales.now) * 100 : 0);
    const prevTop = [...creators].sort((x, y) => y.prev - x.prev).filter((c) => c.prev > 0).slice(0, 3);
    const quiet = prevTop.map((c) => ({ name: c.name, drop: c.prev - c.now, quiet: c.now <= c.prev * 0.2 })).filter((c) => c.quiet).sort((x, y) => y.drop - x.drop)[0] ?? null;
    const fresh = creators.filter((c) => c.isNew && c.now > 0);
    const metrics: Metrics = {
      sales: a.sales, creators: { now: a.creators.now.size, prev: a.creators.prev.size },
      newCreators: { count: fresh.length, sales: fresh.reduce((n, c) => n + c.now, 0) },
      buckets: a.buckets,
      videosPosted: { now: obsNow ? nowC.posted : null, prev: obsPrev ? prevC.posted : null },
      hit: { now: obsNow && nowC.matured > 0 ? ({ matured: nowC.matured, converting: nowC.converting } satisfies Hit) : null, prev: obsPrev && prevC.matured > 0 ? ({ matured: prevC.matured, converting: prevC.converting } satisfies Hit) : null },
      salesPerNewVideo: { now: obsNow ? nowC.salesPerVideo : null, prev: obsPrev ? prevC.salesPerVideo : null },
      returnRate: { now: a.all.now ? (a.bad.now / a.all.now) * 100 : null, prev: a.all.prev ? (a.bad.prev / a.all.prev) * 100 : null },
      quietCreator: quiet ? { name: quiet.name, drop: quiet.drop } : null,
    };
    const top: TopContent[] = [...a.content.entries()].map(([id, c]) => {
      const real = postDay.get(id), est = fsDay.get(id) ?? null;
      const pd = real ?? est;
      return { id, creator: c.creator, kind: c.kind, postDay: pd, estimated: !real, orders: c.orders.size, sales: c.sales, ageDays: pd ? Math.max(0, daysBetweenISO(pd, c.firstDay)) : null, url: c.kind === "video" ? `https://www.tiktok.com/@${encodeURIComponent(c.creator)}/video/${id}` : null };
    }).sort((x, y) => y.sales - x.sales).slice(0, 8);
    for (const c of a.content.values()) { allSales += c.sales; }
    for (const [id, c] of a.content) if (!postDay.get(id)) estSales += c.sales;
    return {
      key: pk, name: productName(pk), metrics, diagnosis: diagnose(metrics), orders: { now: a.orders.now.size, prev: a.orders.prev.size },
      weekly: a.weekly.map((b, i) => ({ start: addDaysISO(period.end, -(i * 7 + 6)), b })).reverse(),
      ageCurve: AGE_BANDS.map((x, i) => ({ band: x.band, sales: a.age[i].sales, contents: a.age[i].ids.size })),
      newContent: { now: nowC, prev: prevC },
      creators: creators.slice(0, 10),
      creatorsAll: creators,
      unposted: unposted(pk),
      creatorStats: { active: { now: a.creators.now.size, prev: a.creators.prev.size }, fresh: fresh.length, quiet: creators.filter((c) => c.prev > 0 && c.now <= c.prev * 0.2).length, top1: topShare(1), top3: topShare(3), top10: topShare(10) },
      samples: { now: funnel(pk, period.start, period.end), prev: funnel(pk, period.prevStart, period.prevEnd) },
      quality: { lines: a.bad, reasons: (reasonBy.get(pk) ?? []).sort((x, y) => y.n - x.n).slice(0, 5) },
      topContent: top,
    };
  });
  void BUCKETS;
  return { period, ref, videoCoverFrom: coverFrom, estimatedSharePct: allSales > 0 ? (estSales / allSales) * 100 : null, products };
}
