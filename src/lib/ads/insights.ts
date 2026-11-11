import "server-only";
import { sql } from "drizzle-orm";
import { rows } from "@/lib/sql";
import { addDaysISO, daysBetweenISO, todayKL } from "@/lib/time";
import { productName, productRank } from "@/lib/products/catalog";
import { vault, type VaultVideo } from "./vault";
import { BOOST_GROUPS } from "./groups";
import { lastNDays, sqlFrom, sqlPrev, type Range } from "./range";

// Read-only numbers for the GMV Max screens. Everything comes from the Ads sync tables (ads_*).

export type Kpi = { cost: number; revenue: number; orders: number; roi: number | null };
const num = (v: unknown) => (v == null ? 0 : Number(v));
const kpiOf = (cost: number, revenue: number, orders: number): Kpi => ({ cost, revenue, orders, roi: cost > 0 ? revenue / cost : null });

async function kpiBetween(from: string, to: string): Promise<Kpi> {
  const [r] = await rows<{ cost: number; revenue: number; orders: number }>(sql`
    select coalesce(sum(cost), 0)::float8 as cost, coalesce(sum(gross_revenue), 0)::float8 as revenue, coalesce(sum(orders), 0)::int as orders
    from ads_campaign_daily where day between ${from}::date and ${to}::date`);
  return kpiOf(num(r?.cost), num(r?.revenue), num(r?.orders));
}

// ───────────────────────────── Ads Today ─────────────────────────────
export type Alert = { level: "critical" | "warn" | "info"; title: string; detail: string; href?: string };
export type TodayData = {
  hasData: boolean; today: string; latestDay: string | null; latest: Kpi; dayBefore: Kpi; range: Range; rangeKpi: Kpi; rangePrev: Kpi; hasPrev: boolean;
  series: { day: string; cost: number; revenue: number }[]; seriesCapped: boolean; alerts: Alert[];
  opportunities: { key: string; label: string; count: number }[]; topPicks: VaultVideo[]; activeBoosts: number; activeCampaigns: number;
};

export async function adsToday(range: Range): Promise<TodayData> {
  const today = todayKL();
  const [l] = await rows<{ d: string | null }>(sql`select to_char(max(day), 'YYYY-MM-DD') as d from ads_campaign_daily where coalesce(cost, 0) > 0 or coalesce(orders, 0) > 0`);
  const latestDay = l?.d ?? null;
  const end = latestDay ?? today;
  const d = (n: number) => addDaysISO(end, n);
  const [pf, pt] = sqlPrev(range);
  const chartFrom = (() => { const f = sqlFrom(range); const cap = addDaysISO(range.to, -119); return f < cap ? cap : f; })();
  const [latest, dayBefore, rangeKpi, rangePrev, seriesRaw, v, camp, boosts] = await Promise.all([
    kpiBetween(end, end), kpiBetween(d(-1), d(-1)), kpiBetween(sqlFrom(range), range.to), range.prevFrom ? kpiBetween(pf, pt) : Promise.resolve(kpiOf(0, 0, 0)),
    rows<{ day: string; cost: number; revenue: number }>(sql`select to_char(day, 'YYYY-MM-DD') as day, coalesce(sum(cost), 0)::float8 as cost, coalesce(sum(gross_revenue), 0)::float8 as revenue from ads_campaign_daily where day between ${chartFrom}::date and ${range.to}::date group by 1 order by 1`),
    vault(), campaignHealth(lastNDays(today, 7)),
    rows<{ n: number }>(sql`select count(*)::int as n from ads_boosts where coalesce(ends_at, now() + interval '1 day') > now()`),
  ]);
  const byDay = new Map(seriesRaw.map((r) => [r.day, r]));
  const nDays = daysBetweenISO(chartFrom, range.to) + 1;
  const series = Array.from({ length: nDays }, (_, i) => { const day = addDaysISO(chartFrom, i); const r = byDay.get(day); return { day, cost: num(r?.cost), revenue: num(r?.revenue) }; });

  const alerts: Alert[] = [];
  if (latestDay && latestDay < addDaysISO(today, -2)) alerts.push({ level: "warn", title: "Ads Data Is Old", detail: `The newest results are from ${latestDay}. Press Sync Now in Data Sync.`, href: "/sync?tab=ads" });
  for (const c of camp.campaigns) {
    const href = `/ads?tab=campaigns`;
    if (c.health === "nosales") alerts.push({ level: "critical", title: `Spending With No Orders: ${c.name}`, detail: `RM ${Math.round(c.now.cost).toLocaleString("en-MY")} spent in the last 7 days and no order.`, href });
    else if (c.health === "losing") alerts.push({ level: "critical", title: `ROI Dropped: ${c.name}`, detail: `ROI ${c.now.roi?.toFixed(1)}× in the last 7 days, was ${c.before.roi?.toFixed(1)}× the week before.`, href });
    else if (c.health === "stopped") alerts.push({ level: "warn", title: `Stopped Spending: ${c.name}`, detail: `It spent the week before, but nothing in the last 3 days${c.lastSpend ? ` (last spend ${c.lastSpend})` : ""}.`, href });
    if (c.budget && c.latestCost >= c.budget * 0.9) alerts.push({ level: "info", title: `Budget Nearly Used: ${c.name}`, detail: `RM ${Math.round(c.latestCost)} of the RM ${Math.round(c.budget)} daily budget was used on the latest day.`, href });
  }
  const needAuth = v.videos.filter((x) => x.status === "AUTHORIZATION_NEEDED").length;
  if (needAuth) alerts.push({ level: "warn", title: `${needAuth} Video${needAuth === 1 ? "" : "s"} Need Authorization`, detail: "TikTok cannot use them in ads until the creator authorizes them.", href: "/ads?tab=picks&group=blocked" });
  const golden = v.counts.stopped;
  if (golden) alerts.push({ level: "info", title: `${golden} Golden Video${golden === 1 ? "" : "s"} Not Being Used`, detail: "Proven sellers that GMV Max has stopped spending on.", href: "/ads?tab=picks&group=stopped" });
  const order = { critical: 0, warn: 1, info: 2 };
  alerts.sort((a, b) => order[a.level] - order[b.level]);

  const label: Record<string, string> = { stopped: "Stopped While Selling", promise: "Sold, Then Dropped", underfed: "Selling, Low Spend", never: "Never Started" };
  return {
    hasData: !!latestDay || v.videos.length > 0, today, latestDay, latest, dayBefore, range, rangeKpi, rangePrev, hasPrev: !!range.prevFrom, series, seriesCapped: !!range.from ? chartFrom > range.from : true, alerts,
    opportunities: BOOST_GROUPS.map((k) => ({ key: k, label: label[k], count: v.counts[k] })),
    // Proven videos first; a never-started video only when it already sells without ads.
    topPicks: [...v.videos.filter((x) => !x.boostedNow && (x.group === "stopped" || x.group === "promise" || x.group === "underfed")), ...v.videos.filter((x) => x.group === "never" && x.organicGmv > 0)].slice(0, 5),
    activeBoosts: num(boosts[0]?.n), activeCampaigns: camp.campaigns.filter((c) => c.now.cost > 0).length,
  };
}

// ───────────────────────────── Campaign Health ─────────────────────────────
export type Health = "healthy" | "watch" | "losing" | "nosales" | "stopped" | "idle";
export const HEALTH_LABEL: Record<Health, string> = { healthy: "Healthy", watch: "Watch", losing: "ROI Dropped", nosales: "No Sales", stopped: "Stopped Spending", idle: "Not Running" };
export type CampaignRow = {
  id: string; name: string; account: string | null; status: string | null; type: string | null; budget: number | null; roasTarget: number | null;
  now: Kpi; before: Kpi; all: Kpi; lastSpend: string | null; latestCost: number; trend: number[]; health: Health; note: string;
};
export async function campaignHealth(range: Range): Promise<{ range: Range; campaigns: CampaignRow[]; total: Kpi; totalBefore: Kpi; hasPrev: boolean }> {
  const to = range.to, from = sqlFrom(range), [pFrom, pTo] = sqlPrev(range), t3 = addDaysISO(to, -2), t14 = addDaysISO(to, -13);
  const raw = await rows<{
    campaign_id: string; name: string | null; account: string | null; status: string | null; promotion_type: string | null; budget: number | null; roas_target: number | null;
    c: number; r: number; o: number; pc: number; pr: number; po: number; ac: number; ar: number; ao: number; last_spend: string | null; c3: number; latest_cost: number; trend: number[] | null;
  }>(sql`
    with d as (
      select campaign_id, max(advertiser_id) as advertiser_id,
        coalesce(sum(cost) filter (where day between ${from}::date and ${to}::date), 0)::float8 as c,
        coalesce(sum(gross_revenue) filter (where day between ${from}::date and ${to}::date), 0)::float8 as r,
        coalesce(sum(orders) filter (where day between ${from}::date and ${to}::date), 0)::int as o,
        coalesce(sum(cost) filter (where day between ${pFrom}::date and ${pTo}::date), 0)::float8 as pc,
        coalesce(sum(gross_revenue) filter (where day between ${pFrom}::date and ${pTo}::date), 0)::float8 as pr,
        coalesce(sum(orders) filter (where day between ${pFrom}::date and ${pTo}::date), 0)::int as po,
        coalesce(sum(cost), 0)::float8 as ac, coalesce(sum(gross_revenue), 0)::float8 as ar, coalesce(sum(orders), 0)::int as ao,
        to_char(max(day) filter (where coalesce(cost, 0) > 0), 'YYYY-MM-DD') as last_spend,
        coalesce(sum(cost) filter (where day >= ${t3}::date), 0)::float8 as c3,
        coalesce(sum(cost) filter (where day = ${to}::date), 0)::float8 as latest_cost
      from ads_campaign_daily group by 1
    )
    select d.*, c.name, adv.name as account, c.status, c.promotion_type, c.budget::float8 as budget, c.roas_target::float8 as roas_target,
      (select array_agg(coalesce(x.rev, 0) order by g.day) from generate_series(${t14}::date, ${to}::date, interval '1 day') g(day)
        left join lateral (select sum(gross_revenue)::float8 as rev from ads_campaign_daily z where z.campaign_id = d.campaign_id and z.day = g.day::date) x on true) as trend
    from d left join ads_campaigns c on c.campaign_id = d.campaign_id left join ads_advertisers adv on adv.advertiser_id = d.advertiser_id
    where d.ac > 0 or d.ao > 0 order by d.c desc, d.ac desc`);
  const campaigns = raw.map((x): CampaignRow => {
    const now = kpiOf(num(x.c), num(x.r), num(x.o)), before = kpiOf(num(x.pc), num(x.pr), num(x.po)), all = kpiOf(num(x.ac), num(x.ar), num(x.ao));
    let health: Health = "healthy", note = "ROI is holding";
    if (now.cost <= 0 && before.cost <= 0) { health = "idle"; note = "No spend in this period or the one before"; }
    else if (num(x.c3) <= 0 && before.cost > 0) { health = "stopped"; note = "No spend in the last 3 days"; }
    else if (now.cost >= 10 && now.orders === 0) { health = "nosales"; note = "Spending, but no orders"; }
    else if (now.roi != null && before.roi != null && before.cost >= 20 && now.roi < before.roi * 0.7) { health = "losing"; note = `ROI fell from ${before.roi.toFixed(1)}× to ${now.roi.toFixed(1)}×`; }
    else if (x.roas_target && now.roi != null && now.roi < num(x.roas_target)) { health = "watch"; note = `ROI ${now.roi.toFixed(1)}× is under the target ${num(x.roas_target).toFixed(1)}×`; }
    else if (now.roi != null && before.roi != null && now.roi < before.roi * 0.9) { health = "watch"; note = "ROI is slipping a little"; }
    return {
      id: x.campaign_id, name: x.name || `Campaign ${x.campaign_id.slice(-6)}`, account: x.account, status: x.status, type: x.promotion_type, budget: x.budget == null ? null : num(x.budget), roasTarget: x.roas_target == null ? null : num(x.roas_target),
      now, before, all, lastSpend: x.last_spend, latestCost: num(x.latest_cost), trend: (x.trend ?? []).map(num), health, note,
    };
  });
  const sum = (f: (c: CampaignRow) => Kpi) => campaigns.reduce((a, c) => kpiOf(a.cost + f(c).cost, a.revenue + f(c).revenue, a.orders + f(c).orders), kpiOf(0, 0, 0));
  return { range, campaigns, total: sum((c) => c.now), totalBefore: sum((c) => c.before), hasPrev: !!range.prevFrom };
}

// ───────────────────────────── Product Performance ─────────────────────────────
export type ProductRow = { key: string; label: string; now: Kpi; before: Kpi; costPerOrder: number | null; share: number; videosWithSpend: number; golden: number; verdict: "push" | "hold" | "fix" | "idle"; note: string };
export async function productPerformance(range: Range): Promise<{ range: Range; products: ProductRow[]; accountRoi: number | null }> {
  const from = sqlFrom(range), to = range.to, [pFrom, pTo] = sqlPrev(range);
  const [raw, v] = await Promise.all([
    rows<{ product_id: string; product_key: string | null; title: string | null; c: number; r: number; o: number; pc: number; pr: number; po: number }>(sql`
      select d.product_id, pm.product_key, max(d.title) as title,
        coalesce(sum(d.cost) filter (where d.day between ${from}::date and ${to}::date), 0)::float8 as c, coalesce(sum(d.gross_revenue) filter (where d.day between ${from}::date and ${to}::date), 0)::float8 as r, coalesce(sum(d.orders) filter (where d.day between ${from}::date and ${to}::date), 0)::int as o,
        coalesce(sum(d.cost) filter (where d.day between ${pFrom}::date and ${pTo}::date), 0)::float8 as pc, coalesce(sum(d.gross_revenue) filter (where d.day between ${pFrom}::date and ${pTo}::date), 0)::float8 as pr, coalesce(sum(d.orders) filter (where d.day between ${pFrom}::date and ${pTo}::date), 0)::int as po
      from ads_product_daily d left join product_map pm on pm.product_id = d.product_id
      where d.day between least(${pFrom}::date, ${from}::date) and ${to}::date and coalesce(pm.product_key, '') <> 'excluded' group by 1, 2`),
    vault(undefined, range),
  ]);
  type Acc = { key: string; label: string; c: number; r: number; o: number; pc: number; pr: number; po: number; rank: number };
  const m = new Map<string, Acc>();
  for (const x of raw) {
    const key = x.product_key ?? `id:${x.product_id}`;
    const a = m.get(key) ?? { key, label: x.product_key ? productName(x.product_key) : x.title || `Product ${x.product_id.slice(-6)}`, c: 0, r: 0, o: 0, pc: 0, pr: 0, po: 0, rank: productRank(x.product_key) };
    a.c += num(x.c); a.r += num(x.r); a.o += num(x.o); a.pc += num(x.pc); a.pr += num(x.pr); a.po += num(x.po); m.set(key, a);
  }
  const vkey = (x: VaultVideo) => x.productKey ?? `id:${x.productId}`;
  const totalCost = [...m.values()].reduce((a, x) => a + x.c, 0), totalRev = [...m.values()].reduce((a, x) => a + x.r, 0);
  const accountRoi = totalCost > 0 ? totalRev / totalCost : null;
  const products = [...m.values()].map((a): ProductRow => {
    const now = kpiOf(a.c, a.r, a.o), before = kpiOf(a.pc, a.pr, a.po);
    const mine = v.videos.filter((x) => vkey(x) === a.key);
    const golden = mine.filter((x) => x.group === "stopped" || x.group === "promise").length;
    let verdict: ProductRow["verdict"] = "hold", note = "ROI is near your average";
    if (now.cost <= 0) { verdict = "idle"; note = golden ? "No ad spend now, but it has proven videos" : "No ad spend in this period"; }
    else if (now.roi != null && accountRoi != null && now.roi >= accountRoi * 1.15) { verdict = "push"; note = `ROI ${now.roi.toFixed(1)}× is above your average ${accountRoi.toFixed(1)}×`; }
    else if (now.orders === 0 || (now.roi != null && accountRoi != null && now.roi < accountRoi * 0.7)) { verdict = "fix"; note = now.orders === 0 ? "Spending with no orders" : `ROI ${now.roi?.toFixed(1)}× is well under your average`; }
    return { key: a.key, label: a.label, now, before, costPerOrder: now.orders > 0 ? now.cost / now.orders : null, share: totalCost > 0 ? now.cost / totalCost : 0, videosWithSpend: mine.filter((x) => x.rCost > 0).length, golden, verdict, note };
  }).sort((a, b) => b.now.revenue - a.now.revenue || b.before.revenue - a.before.revenue);
  return { range, products, accountRoi };
}

// ───────────────────────────── Creator Ad Scoreboard ─────────────────────────────
export type CreatorRow = { creator: string; videos: number; sellers: number; all: Kpi; week: Kpi; golden: number; blocked: number; best: VaultVideo | null };
export async function creatorScoreboard(range: Range): Promise<{ range: Range; creators: CreatorRow[]; unknownVideos: number; accountRoi: number | null }> {
  const v = await vault(undefined, range);
  const m = new Map<string, CreatorRow & { c: number; r: number; o: number; c7: number; r7: number; o7: number }>();
  let unknown = 0;
  for (const x of v.videos) {
    if (x.rCost <= 0 && !(x.cost <= 0 && x.organicGmv > 0 && !range.from)) continue;
    if (!x.creator) { unknown++; continue; }
    const a = m.get(x.creator) ?? { creator: x.creator, videos: 0, sellers: 0, all: kpiOf(0, 0, 0), week: kpiOf(0, 0, 0), golden: 0, blocked: 0, best: null, c: 0, r: 0, o: 0, c7: 0, r7: 0, o7: 0 };
    a.videos++; if (x.orders > 0) a.sellers++;
    a.c += x.rCost; a.r += x.rRevenue; a.o += x.rOrders; a.c7 += x.cost7; a.r7 += x.revenue7; a.o7 += x.orders7;
    if (x.group === "stopped" || x.group === "promise" || (x.group === "never" && x.organicGmv > 0)) a.golden++;
    if (x.group === "blocked") a.blocked++;
    if (!a.best || x.rRevenue > a.best.rRevenue) a.best = x;
    m.set(x.creator, a);
  }
  const creators = [...m.values()].map(({ c, r, o, c7, r7, o7, ...a }) => ({ ...a, all: kpiOf(c, r, o), week: kpiOf(c7, r7, o7) })).sort((a, b) => b.all.revenue - a.all.revenue);
  return { range, creators, unknownVideos: unknown, accountRoi: v.accountRoi };
}

// ───────────────────────────── Boost Log ─────────────────────────────
export type LogVideo = { creativeId: string; productId: string; budget: number; title: string | null; creator: string | null; before: Kpi; after: Kpi };
export type LogBatch = { id: number; boostedOn: string; days: number; totalBudget: number; note: string | null; createdBy: string | null; afterDays: number; before: Kpi; after: Kpi; videos: LogVideo[]; verdict: "better" | "same" | "worse" | "early" };
export const LOG_WINDOW = 7;
export async function boostLog(range: Range): Promise<LogBatch[]> {
  const today = todayKL(), rf = sqlFrom(range), rt = range.to;
  const raw = await rows<{
    id: number; boosted_on: string; days: number; total_budget: number; note: string | null; created_by: string | null;
    creative_id: string; product_id: string; budget: number; title: string | null; creator: string | null; bc: number; br: number; bo: number; ac: number; ar: number; ao: number;
  }>(sql`
    select b.id::int as id, to_char(b.boosted_on, 'YYYY-MM-DD') as boosted_on, b.days, b.total_budget::float8 as total_budget, b.note, b.created_by,
      bv.creative_id, bv.product_id, bv.budget::float8 as budget, coalesce(v.title, s.ad_title) as title, v.creator,
      coalesce(s.bc, 0)::float8 as bc, coalesce(s.br, 0)::float8 as br, coalesce(s.bo, 0)::int as bo, coalesce(s.ac, 0)::float8 as ac, coalesce(s.ar, 0)::float8 as ar, coalesce(s.ao, 0)::int as ao
    from ads_boost_batches b join ads_boost_batch_videos bv on bv.batch_id = b.id
    left join tt_videos v on v.video_id = bv.creative_id
    left join lateral (
      select max(d.title) as ad_title,
        sum(d.cost) filter (where d.day >= b.boosted_on - ${LOG_WINDOW}::int and d.day < b.boosted_on) as bc, sum(d.gross_revenue) filter (where d.day >= b.boosted_on - ${LOG_WINDOW}::int and d.day < b.boosted_on) as br, sum(d.orders) filter (where d.day >= b.boosted_on - ${LOG_WINDOW}::int and d.day < b.boosted_on) as bo,
        sum(d.cost) filter (where d.day >= b.boosted_on and d.day < b.boosted_on + ${LOG_WINDOW}::int) as ac, sum(d.gross_revenue) filter (where d.day >= b.boosted_on and d.day < b.boosted_on + ${LOG_WINDOW}::int) as ar, sum(d.orders) filter (where d.day >= b.boosted_on and d.day < b.boosted_on + ${LOG_WINDOW}::int) as ao
      from ads_creative_daily d where d.creative_id = bv.creative_id and (bv.product_id = '-' or d.product_id = bv.product_id)
    ) s on true
    where b.boosted_on between ${rf}::date and ${rt}::date
    order by b.boosted_on desc, b.id desc, bv.budget desc`);
  const m = new Map<number, LogBatch>();
  for (const x of raw) {
    const elapsed = Math.round((Date.parse(today) - Date.parse(x.boosted_on)) / 86400_000) + 1;
    const b = m.get(x.id) ?? { id: x.id, boostedOn: x.boosted_on, days: x.days, totalBudget: num(x.total_budget), note: x.note, createdBy: x.created_by, afterDays: Math.max(0, Math.min(LOG_WINDOW, elapsed)), before: kpiOf(0, 0, 0), after: kpiOf(0, 0, 0), videos: [], verdict: "early" as const };
    const before = kpiOf(num(x.bc), num(x.br), num(x.bo)), after = kpiOf(num(x.ac), num(x.ar), num(x.ao));
    b.videos.push({ creativeId: x.creative_id, productId: x.product_id, budget: num(x.budget), title: x.title, creator: x.creator, before, after });
    b.before = kpiOf(b.before.cost + before.cost, b.before.revenue + before.revenue, b.before.orders + before.orders);
    b.after = kpiOf(b.after.cost + after.cost, b.after.revenue + after.revenue, b.after.orders + after.orders);
    m.set(x.id, b);
  }
  for (const b of m.values()) {
    // Compare sales per day, because the "after" window may not be complete yet.
    const perDayBefore = b.before.revenue / LOG_WINDOW, perDayAfter = b.afterDays > 0 ? b.after.revenue / b.afterDays : 0;
    b.verdict = b.afterDays < 2 ? "early" : perDayAfter > perDayBefore * 1.15 ? "better" : perDayAfter < perDayBefore * 0.85 ? "worse" : "same";
  }
  return [...m.values()];
}

// ───────────────────────────── Video Detail ─────────────────────────────
export type VideoDetail = {
  rows: VaultVideo[]; series: { day: string; cost: number; revenue: number; orders: number }[];
  campaigns: { campaignId: string; name: string; productLabel: string; cost: number; revenue: number; orders: number; roi: number | null; lastSpend: string | null }[];
  /** The newest rows exactly as TikTok's API sent them. */ sent: { day: string; productId: string; delivery: string | null; exploration: string | null; boost: string | null; authorization: string | null; json: unknown }[];
  post: { status: string | null; eligible: boolean | null; authorization: string | null; json: unknown } | null;
  logged: { id: number; boostedOn: string; budget: number }[]; sessions: { sessionId: string; status: string | null; budget: number | null; startsAt: string | null; endsAt: string | null; active: boolean }[];
};
export async function videoDetail(id: string): Promise<VideoDetail | null> {
  const v = await vault();
  const mine = v.videos.filter((x) => x.creativeId === id);
  if (!mine.length) return null;
  const end = v.today, start = addDaysISO(end, -59);
  const [s, c, logged, sessions, sent, post] = await Promise.all([
    rows<{ day: string; cost: number; revenue: number; orders: number }>(sql`select to_char(day, 'YYYY-MM-DD') as day, coalesce(sum(cost), 0)::float8 as cost, coalesce(sum(gross_revenue), 0)::float8 as revenue, coalesce(sum(orders), 0)::int as orders from ads_creative_daily where creative_id = ${id} and day >= ${start}::date group by 1`),
    rows<{ campaign_id: string; name: string | null; product_id: string; product_key: string | null; cost: number; revenue: number; orders: number; last_spend: string | null }>(sql`
      select d.campaign_id, c.name, d.product_id, pm.product_key, coalesce(sum(d.cost), 0)::float8 as cost, coalesce(sum(d.gross_revenue), 0)::float8 as revenue, coalesce(sum(d.orders), 0)::int as orders, to_char(max(d.day) filter (where coalesce(d.cost, 0) > 0), 'YYYY-MM-DD') as last_spend
      from ads_creative_daily d left join ads_campaigns c on c.campaign_id = d.campaign_id left join product_map pm on pm.product_id = d.product_id where d.creative_id = ${id} group by 1, 2, 3, 4 order by 5 desc`),
    rows<{ id: number; boosted_on: string; budget: number }>(sql`select b.id::int as id, to_char(b.boosted_on, 'YYYY-MM-DD') as boosted_on, bv.budget::float8 as budget from ads_boost_batch_videos bv join ads_boost_batches b on b.id = bv.batch_id where bv.creative_id = ${id} order by b.boosted_on desc`),
    rows<{ session_id: string; status: string | null; budget: number | null; starts_at: Date | null; ends_at: Date | null; active: boolean }>(sql`
      select session_id, status, budget::float8 as budget, starts_at, ends_at, coalesce(ends_at, now() + interval '1 day') > now() as active from ads_boosts where item_id = ${id}
      union all
      select a.session_id, 'CREATED_IN_APP', a.budget::float8, a.created_at, a.ends_at, a.stopped_at is null and (a.ends_at is null or a.ends_at > now()) from ads_boost_actions a
        where a.item_id = ${id} and a.action = 'create' and a.ok and a.session_id is not null and not exists (select 1 from ads_boosts b where b.session_id = a.session_id)
      order by starts_at desc nulls last`),
    rows<{ day: string; product_id: string; delivery_status: string | null; exploration_status: string | null; boost_status: string | null; authorization_type: string | null; raw: unknown }>(sql`select to_char(day, 'YYYY-MM-DD') as day, product_id, delivery_status, exploration_status, boost_status, authorization_type, raw from ads_creative_daily where creative_id = ${id} order by day desc limit 4`),
    rows<{ status: string | null; eligible: boolean | null; authorization_type: string | null; raw: unknown }>(sql`select status, eligible, authorization_type, raw from ads_videos where item_id = ${id} limit 1`),
  ]);
  const byDay = new Map(s.map((r) => [r.day, r]));
  return {
    rows: mine,
    series: Array.from({ length: 60 }, (_, i) => { const day = addDaysISO(start, i); const r = byDay.get(day); return { day, cost: num(r?.cost), revenue: num(r?.revenue), orders: num(r?.orders) }; }),
    campaigns: c.map((x) => ({ campaignId: x.campaign_id, name: x.name || (x.campaign_id === "-" ? "Campaign not given" : `Campaign ${x.campaign_id.slice(-6)}`), productLabel: x.product_key ? productName(x.product_key) : `Product ${x.product_id.slice(-6)}`, cost: num(x.cost), revenue: num(x.revenue), orders: num(x.orders), roi: num(x.cost) > 0 ? num(x.revenue) / num(x.cost) : null, lastSpend: x.last_spend })),
    sent: sent.map((x) => ({ day: x.day, productId: x.product_id, delivery: x.delivery_status, exploration: x.exploration_status, boost: x.boost_status, authorization: x.authorization_type, json: x.raw })),
    post: post[0] ? { status: post[0].status, eligible: post[0].eligible, authorization: post[0].authorization_type, json: post[0].raw } : null,
    logged: logged.map((x) => ({ id: x.id, boostedOn: x.boosted_on, budget: num(x.budget) })),
    sessions: sessions.map((x) => ({ sessionId: x.session_id, status: x.status, budget: x.budget == null ? null : num(x.budget), startsAt: x.starts_at ? new Date(x.starts_at).toISOString().slice(0, 10) : null, endsAt: x.ends_at ? new Date(x.ends_at).toISOString().slice(0, 10) : null, active: !!x.active })),
  };
}
