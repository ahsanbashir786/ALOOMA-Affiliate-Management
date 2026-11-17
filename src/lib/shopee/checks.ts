import "server-only";
import { shopeeCall, shopeeConfig, ShopeeApiError, type Fetch } from "./client";

export type ShopeeCheck = { name: string; ok: boolean; message: string; count: number | null; fields: string[] | null; sample: string | null };

const keys = (o: unknown): string[] => (o && typeof o === "object" ? Object.keys(o as object).slice(0, 40) : []);
const text = (e: unknown) => (e instanceof ShopeeApiError || e instanceof Error ? e.message : String(e));

/**
 * A read-only connection check: asks for the shop's details and for one order from the last day. Saves nothing.
 * Only the names of the fields that come back are shown, never customer details.
 */
export async function runShopeeChecks(f: Fetch = fetch): Promise<{ at: string; checks: ShopeeCheck[] }> {
  const cfg = shopeeConfig();
  const checks: ShopeeCheck[] = [];
  const run = async (name: string, fn: () => Promise<{ count: number | null; fields: string[]; sample: string | null }>) => {
    try { const r = await fn(); checks.push({ name, ok: true, message: "", ...r }); }
    catch (e) { checks.push({ name, ok: false, message: text(e), count: null, fields: null, sample: null }); }
  };
  await run("Shop details", async () => {
    const r = await shopeeCall<Record<string, unknown>>("/api/v2/shop/get_shop_info", { cfg, f });
    return { count: null, fields: keys(r), sample: JSON.stringify({ shop_name: r.shop_name, region: r.region, status: r.status }, null, 1) };
  });
  await run("Orders of the last day", async () => {
    const now = Math.floor(Date.now() / 1000);
    const r = await shopeeCall<{ order_list?: unknown[] }>("/api/v2/order/get_order_list", { cfg, f, query: { time_range_field: "create_time", time_from: now - 86400, time_to: now, page_size: 1 } });
    return { count: Array.isArray(r.order_list) ? r.order_list.length : 0, fields: keys(Array.isArray(r.order_list) ? r.order_list[0] : null), sample: null };
  });
  return { at: new Date().toISOString(), checks };
}

const dmy = (sec: number) => { const d = new Date((sec + 8 * 3600) * 1000); return `${String(d.getUTCDate()).padStart(2, "0")}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${d.getUTCFullYear()}`; };

/**
 * Which parts of the Shopee API this app may use: one small read-only call for each. A part Shopee refuses shows Shopee's own words,
 * so the owner knows which API group to add in the Open Platform Console. Only field names are shown, never details.
 */
export async function runShopeeAccessChecks(f: Fetch = fetch): Promise<{ at: string; checks: ShopeeCheck[] }> {
  const cfg = shopeeConfig();
  const checks: ShopeeCheck[] = [];
  const now = Math.floor(Date.now() / 1000), week = now - 7 * 86400;
  const run = async (name: string, path: string, query: Record<string, unknown>, listKeys: string[]) => {
    try {
      const r = await shopeeCall<unknown>(path, { cfg, f, query });
      const list = Array.isArray(r) ? r : listKeys.map((k) => (r as Record<string, unknown>)[k]).find((v) => Array.isArray(v)) as unknown[] | undefined;
      checks.push({ name, ok: true, message: "", count: Array.isArray(list) ? list.length : null, fields: keys(Array.isArray(list) ? list[0] : r), sample: null });
    } catch (e) { checks.push({ name, ok: false, message: text(e), count: null, fields: null, sample: null }); }
  };
  await run("Orders", "/api/v2/order/get_order_list", { time_range_field: "update_time", time_from: week, time_to: now, page_size: 1 }, ["order_list"]);
  await run("Payments (escrow)", "/api/v2/payment/get_escrow_list", { release_time_from: week, release_time_to: now, page_size: 1, page_no: 0 }, ["escrow_list"]);
  await run("Returns", "/api/v2/returns/get_return_list", { update_time_from: week, update_time_to: now, page_size: 1, page_no: 0 }, ["return", "return_list"]);
  await run("Shopee Ads", "/api/v2/ads/get_all_cpc_ads_daily_performance", { start_date: dmy(week), end_date: dmy(now - 86400) }, ["response"]);
  await run("Wallet", "/api/v2/payment/get_wallet_transaction_list", { create_time_from: week, create_time_to: now, page_size: 1, page_no: 0 }, ["transaction_list"]);
  await run("Stock (products, FBS)", "/api/v2/product/get_item_list", { offset: 0, page_size: 1, item_status: "NORMAL" }, ["item"]);
  return { at: new Date().toISOString(), checks };
}
