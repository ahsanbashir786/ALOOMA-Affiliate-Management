// Pure mappers: TikTok API records → rows for our tt_* tables. Only whitelisted fields are read, so customer personal data
// (names, phones, emails, addresses) can never reach the database. No network, no database here.
type R = Record<string, unknown>;
const obj = (v: unknown): R => (v && typeof v === "object" && !Array.isArray(v) ? (v as R) : {});
const arr = (v: unknown): R[] => (Array.isArray(v) ? (v as R[]) : []);

/** A number from a number, a numeric string, or a money object such as { amount: "12.5", currency: "MYR" }. */
export function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "object") return num(obj(v).amount);
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
export const int = (v: unknown): number | null => { const n = num(v); return n == null ? null : Math.round(n); };
export const str = (v: unknown): string | null => (v == null || v === "" ? null : String(v));
export const cur = (v: unknown): string | null => str(obj(v).currency);
/** Unix seconds, unix milliseconds or a date text → ISO text. */
export function ts(v: unknown): string | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : /^\d+$/.test(String(v)) ? Number(v) : NaN;
  const d = Number.isFinite(n) ? new Date(n > 1e12 ? n : n * 1000) : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
export const day = (v: unknown): string | null => { const t = ts(v); return t ? t.slice(0, 10) : str(v)?.slice(0, 10) ?? null; };

export type Row = Record<string, unknown>;

export function affiliateOrderLines(o: R): Row[] {
  return arr(o.skus).map((s) => ({
    order_id: str(o.id),
    sku_id: str(s.sku_id) ?? str(s.id) ?? "",
    created_at: ts(o.create_time),
    delivery_at: ts(o.delivery_time),
    creator: str(s.creator_username),
    content_id: str(s.content_id),
    content_type: str(s.content_type),
    product_id: str(s.product_id),
    seller_sku: str(s.seller_sku),
    sku_name: str(s.sku_name),
    quantity: int(s.quantity),
    price: num(s.price),
    currency: cur(s.price),
    commission_rate: num(s.commission_rate),
    est_commission: num(s.estimated_paid_commission),
    paid_commission: num(s.actual_paid_commission),
    settlement_status: str(s.settlement_status),
    fully_return: typeof s.fully_return === "boolean" ? s.fully_return : null,
    open_collab_id: str(s.open_collaboration_id),
    target_collab_id: str(s.target_collaboration_id),
    campaign_id: str(s.campaign_id),
  }));
}

export function video(v: R, window: { start: string; end: string }): Row {
  return {
    video_id: str(v.id),
    creator: str(v.username),
    title: str(v.title),
    posted_at: ts(v.video_post_time),
    views: int(v.views),
    gmv: num(v.gmv),
    units_sold: int(v.units_sold),
    click_through_rate: num(v.click_through_rate),
    products: JSON.stringify(arr(v.products).map((p) => ({ id: str(p.id), name: str(p.name) }))),
    window_start: window.start,
    window_end: window.end,
  };
}

export function live(v: R): Row {
  const i = obj(v.interaction_performance);
  const s = obj(v.sales_performance);
  return {
    live_id: str(v.id),
    creator: str(v.username),
    title: str(v.title),
    started_at: ts(v.start_time),
    ended_at: ts(v.end_time),
    gmv: num(s.gmv),
    items_sold: int(s.items_sold),
    sku_orders: int(s.sku_orders),
    customers: int(s.customers),
    viewers: int(i.viewers),
    views: int(i.views),
    avg_viewing_seconds: num(i.avg_viewing_duration),
    new_followers: int(i.new_followers),
    likes: int(i.likes),
    comments: int(i.comments),
    shares: int(i.shares),
    product_clicks: int(i.product_clicks),
    click_through_rate: num(i.click_through_rate),
    click_to_order_rate: num(s.click_to_order_rate),
  };
}

export function sampleRequest(v: R): Row {
  const c = obj(v.creator);
  const p = obj(v.product);
  return {
    id: str(v.id),
    status: str(v.status),
    creator_id: str(c.user_id),
    creator: str(c.username),
    nickname: str(c.nickname),
    followers: int(c.follower_count),
    creator_gmv: num(c.gmv),
    creator_videos: int(c.content_count),
    creator_video_views: int(c.ec_video_view),
    fulfilment_pct: num(c.fulfillment_percentage),
    product_id: str(p.id),
    sku_id: str(p.sku_id),
    product_title: str(p.title),
    sku_name: str(p.sku_name),
    commission_rate: num(v.commission_rate),
    order_id: str(v.order_id),
    is_approvable: typeof v.is_approvable === "boolean" ? v.is_approvable : null,
    expires_at: ts(v.approve_expiration_time),
    available_quantity: int(v.available_quantity),
  };
}

export function skus(p: R): Row[] {
  return arr(p.skus).map((s) => ({
    sku_id: str(s.id),
    product_id: str(p.id),
    product_title: str(p.title),
    seller_sku: str(s.seller_sku),
    price: num(obj(s.price).tax_exclusive_price ?? s.price),
    currency: cur(s.price) ?? str(obj(s.price).currency),
    stock: arr(s.inventory).reduce((a, w) => a + (int(w.quantity) ?? 0), 0),
    product_status: str(p.status),
    updated_at: ts(p.update_time),
  }));
}

export function returnRow(v: R): Row {
  return {
    return_id: str(v.return_id) ?? str(v.id),
    order_id: str(v.order_id),
    status: str(v.return_status),
    return_type: str(v.return_type),
    reason: str(v.return_reason_text) ?? str(v.return_reason),
    refund_amount: num(obj(v.refund_amount).refund_total ?? v.refund_amount),
    currency: cur(v.refund_amount),
    skus: JSON.stringify(arr(v.return_line_items).map((l) => ({ sku_id: str(l.sku_id), seller_sku: str(l.seller_sku) }))),
    created_at: ts(v.create_time),
    updated_at: ts(v.update_time),
  };
}

export function cancellation(v: R): Row {
  return {
    cancel_id: str(v.cancel_id) ?? str(v.id),
    order_id: str(v.order_id),
    status: str(v.cancel_status),
    cancel_type: str(v.cancel_type),
    reason: str(v.cancel_reason_text) ?? str(v.cancel_reason),
    skus: JSON.stringify(arr(v.cancel_line_items).map((l) => ({ sku_id: str(l.sku_id), seller_sku: str(l.seller_sku) }))),
    created_at: ts(v.create_time),
    updated_at: ts(v.update_time),
  };
}

export function shopDay(v: R): Row {
  return {
    day: day(v.start_date),
    gmv: num(v.gmv),
    orders: int(v.orders),
    buyers: int(v.buyers),
    units_sold: int(v.units_sold),
    refunds: num(v.refunds),
    returns_cancellations: int(v.cancellations_and_returns),
    page_views: int(v.product_page_views),
    impressions: int(v.product_impressions),
    avg_order_value: num(v.avg_order_value),
  };
}
