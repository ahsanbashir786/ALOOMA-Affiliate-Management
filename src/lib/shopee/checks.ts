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
