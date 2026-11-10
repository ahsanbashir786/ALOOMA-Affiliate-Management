// Pure mappers: TikTok API for Business answers → rows for our ads_* tables. No network, no database here.
// TikTok's field names for GMV Max are read tolerantly (the first name that is present wins) and every row also keeps the whole answer
// ("raw"), so a field we did not map yet is never lost and can be added later without a new sync.
import { day as dayOf, int, num, str, ts, type Row } from "@/lib/tiktok/map";
export type { Row };
type R = Record<string, unknown>;
/** The two kinds of GMV Max campaign, as TikTok names them (TikTok's own error message listed these as the allowed values). */
export const GMV_MAX_PROMOTION_TYPES = ["PRODUCT_GMV_MAX", "LIVE_GMV_MAX"];
export const obj = (v: unknown): R => (v && typeof v === "object" && !Array.isArray(v) ? (v as R) : {});
export const arr = (v: unknown): R[] => (Array.isArray(v) ? (v as R[]) : []);
/** The first of these names that holds a value. */
export const pick = (o: R, ...names: string[]): unknown => { for (const n of names) if (o[n] != null && o[n] !== "") return o[n]; return null; };
/** TikTok sends metrics as text ("12.50"); a number with thousands commas is read too. */
export const dec = (v: unknown): number | null => (typeof v === "string" ? num(v.replace(/,/g, "")) : num(v));
export const raw = (o: unknown): string => JSON.stringify(o ?? null);

export function advertiser(o: R): Row {
  return { advertiser_id: str(pick(o, "advertiser_id", "id")), name: str(pick(o, "name", "advertiser_name")), currency: str(o.currency), timezone: str(pick(o, "timezone", "display_timezone")), status: str(pick(o, "status", "advertiser_status")), raw: raw(o) };
}

export function store(o: R, advertiserId: string): Row {
  const avail = pick(o, "is_gmv_max_available", "gmv_max_available", "is_available");
  return { advertiser_id: advertiserId, store_id: str(o.store_id), store_name: str(pick(o, "store_name", "name")), store_code: str(o.store_code), bc_id: str(pick(o, "store_authorized_bc_id", "bc_id")), available: avail == null ? null : avail === true || avail === "true" || avail === 1, raw: raw(o) };
}

export function campaign(o: R, advertiserId: string): Row {
  return {
    advertiser_id: advertiserId,
    campaign_id: str(o.campaign_id),
    store_id: str(pick(o, "store_id", "shop_id")),
    name: str(pick(o, "campaign_name", "name")),
    status: str(pick(o, "operation_status", "primary_status", "status", "secondary_status")),
    promotion_type: str(pick(o, "gmv_max_promotion_type", "shopping_ads_type", "promotion_type")),
    budget: dec(pick(o, "budget", "daily_budget")),
    roas_target: dec(pick(o, "roas_bid", "roi_target", "target_roi", "roas_target")),
    created_at: ts(pick(o, "create_time", "created_time")),
    modified_at: ts(pick(o, "modify_time", "modified_time", "update_time")),
    raw: raw(o),
  };
}

/** A TikTok yes/no that may arrive as true/false, "true"/"false", 1/0 or a word. */
export const yes = (v: unknown): boolean | null => (v == null || v === "" ? null : v === true || v === 1 || /^(true|yes|1|eligible|authorized)$/i.test(String(v)));

/** One video from the GMV Max video list. Field names are read tolerantly; the whole answer is kept in raw. */
export function video(o: R, advertiserId: string, storeId: string): Row {
  const ident = obj(pick(o, "identity_info", "identity", "tt_account"));
  return {
    advertiser_id: advertiserId, store_id: storeId,
    item_id: str(pick(o, "item_id", "video_id", "post_id", "id")),
    spu_id: str(pick(o, "spu_id", "item_group_id", "product_id")),
    title: str(pick(o, "text", "title", "caption", "video_title", "description")),
    identity_id: str(pick(o, "identity_id") ?? pick(ident, "identity_id", "id")),
    username: str(pick(o, "identity_name", "tt_account_name", "user_name", "username", "display_name", "unique_id", "nickname") ?? pick(ident, "identity_name", "user_name", "display_name", "name")),
    posted_at: ts(pick(o, "create_time", "post_time", "publish_time", "posted_time", "video_create_time")),
    authorization_status: str(pick(o, "authorization_status", "auth_status", "authorized_status", "video_status")),
    authorization_type: str(pick(o, "authorization_type", "auth_type", "identity_type")),
    eligible: yes(pick(o, "is_eligible", "eligible", "is_available", "available", "can_boost")),
    status: str(pick(o, "status", "exploration_status", "delivery_status", "creative_delivery_status")),
    raw: raw(o),
  };
}

/** One creative boost session of a campaign. */
export function boost(o: R, advertiserId: string, campaignId: string): Row {
  const s = obj(o.session);
  const g = (...n: string[]) => pick(o, ...n) ?? pick(s, ...n);
  return {
    advertiser_id: advertiserId, campaign_id: campaignId,
    session_id: str(g("session_id", "id")), store_id: str(g("store_id")),
    item_id: str(g("item_id", "video_id", "post_id")),
    status: str(g("status", "operation_status", "session_status", "delivery_status")),
    budget: dec(g("budget", "session_budget")), bid_type: str(g("bid_type")), schedule_type: str(g("schedule_type")),
    starts_at: ts(g("schedule_start_time", "start_time", "begin_time")), ends_at: ts(g("schedule_end_time", "end_time")),
    raw: raw(o),
  };
}

/** One line of a GMV Max report: { dimensions: {...}, metrics: {...} }. */
export type ReportLine = { dims: R; mets: R };
export const reportLine = (o: R): ReportLine => ({ dims: obj(o.dimensions), mets: obj(o.metrics) });
/** TikTok writes the day as "2026-11-05 00:00:00". */
export const reportDay = (dims: R): string | null => { const v = str(pick(dims, "stat_time_day", "stat_time", "date")); return v ? v.slice(0, 10) : null; };
const bad = (d: string | null) => !d || !/^\d{4}-\d{2}-\d{2}$/.test(d);

export function campaignDaily(l: ReportLine, advertiserId: string): Row | null {
  const d = reportDay(l.dims), id = str(l.dims.campaign_id);
  if (!id || bad(d)) return null;
  return { advertiser_id: advertiserId, campaign_id: id, day: d, cost: dec(l.mets.cost), net_cost: dec(l.mets.net_cost), orders: int(dec(l.mets.orders)), gross_revenue: dec(l.mets.gross_revenue), roi: dec(l.mets.roi), cost_per_order: dec(l.mets.cost_per_order), raw: raw(l) };
}

/** When TikTok splits a result by creative or product but not by campaign, the campaign is "-" (a key can never be empty). */
export const NO_CAMPAIGN = "-";
/** Metric names tried for the extra ad numbers (the first one TikTok accepts is used). */
export const FUNNEL_METRICS = {
  impressions: ["product_impressions", "impressions", "ad_impressions"],
  clicks: ["product_clicks", "clicks", "ad_clicks"],
  click_rate: ["product_click_rate", "ad_click_rate", "click_rate", "ctr"],
  conversion_rate: ["ad_conversion_rate", "conversion_rate", "cvr"],
  view_rate_2s: ["ad_video_view_rate_2s", "video_view_rate_2s"],
  view_rate_6s: ["ad_video_view_rate_6s", "video_view_rate_6s"],
} as const;
/** Every optional metric worth asking for. Which of them TikTok accepts is found out once per account (see discovery in sync.ts). */
export const OPTIONAL_METRICS = ["cost_per_order", "title", "tt_account_name", "shop_content_type", "product_name", ...Object.values(FUNNEL_METRICS).flat()];
const funnel = (m: R) => ({
  impressions: int(dec(pick(m, ...FUNNEL_METRICS.impressions))), clicks: int(dec(pick(m, ...FUNNEL_METRICS.clicks))),
  click_rate: dec(pick(m, ...FUNNEL_METRICS.click_rate)), conversion_rate: dec(pick(m, ...FUNNEL_METRICS.conversion_rate)),
});

/** One video's result for one product in one campaign on one day. `product` is the product the request was filtered to (used when TikTok does not repeat it in the line). */
export function creativeDaily(l: ReportLine, advertiserId: string, scope?: { campaign?: string; product?: string }): Row | null {
  const d = reportDay(l.dims), cid = str(l.dims.campaign_id) ?? scope?.campaign ?? NO_CAMPAIGN, id = str(pick(l.dims, "item_id", "creative_id", "video_id"));
  const pid = str(pick(l.dims, "item_group_id", "product_id", "spu_id")) ?? scope?.product ?? "-";
  if (!id || bad(d)) return null;
  return {
    advertiser_id: advertiserId, campaign_id: cid, product_id: pid, creative_id: id, day: d,
    title: str(pick(l.mets, "title", "video_title")) ?? str(pick(l.dims, "title")),
    account_name: str(pick(l.mets, "tt_account_name", "account_name")),
    content_type: str(pick(l.mets, "shop_content_type", "content_type")),
    cost: dec(l.mets.cost), orders: int(dec(l.mets.orders)), gross_revenue: dec(l.mets.gross_revenue), roi: dec(l.mets.roi), cost_per_order: dec(l.mets.cost_per_order),
    ...funnel(l.mets), view_rate_2s: dec(pick(l.mets, ...FUNNEL_METRICS.view_rate_2s)), view_rate_6s: dec(pick(l.mets, ...FUNNEL_METRICS.view_rate_6s)), raw: raw(l),
  };
}

export function productDaily(l: ReportLine, advertiserId: string, scope?: { campaign?: string }): Row | null {
  const d = reportDay(l.dims), cid = str(l.dims.campaign_id) ?? scope?.campaign ?? NO_CAMPAIGN, id = str(pick(l.dims, "item_group_id", "product_id", "spu_id"));
  if (!id || bad(d)) return null;
  return { advertiser_id: advertiserId, campaign_id: cid, product_id: id, day: d, title: str(pick(l.mets, "product_name", "title")), cost: dec(l.mets.cost), orders: int(dec(l.mets.orders)), gross_revenue: dec(l.mets.gross_revenue), roi: dec(l.mets.roi), cost_per_order: dec(l.mets.cost_per_order), ...funnel(l.mets), raw: raw(l) };
}

/** True when a batch of report lines holds at least one number we could read. If TikTok renamed its fields, this catches it instead of saving empty rows. */
export function hasReadableMetrics(lines: ReportLine[]): boolean {
  return lines.some((l) => ["cost", "orders", "gross_revenue", "roi"].some((k) => dec(l.mets[k]) != null));
}
export const metricNames = (lines: ReportLine[]): string[] => [...new Set(lines.flatMap((l) => Object.keys(l.mets)))].slice(0, 30);
export { dayOf };
