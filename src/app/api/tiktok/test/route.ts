import { NextResponse } from "next/server";
import { can, getCurrentUser } from "@/lib/auth";
import { callApi } from "@/lib/tiktok/client";
import { keyPaths } from "@/lib/tiktok/sign";

export const runtime = "nodejs";
export const maxDuration = 60;

type Check = { name: string; path?: string; ok: boolean; message: string; count: number | null; fields: string[] };

/** The first list inside a response (the name of that list differs from endpoint to endpoint). */
const firstList = (d: Record<string, unknown>) => Object.values(d).find((v) => Array.isArray(v));

/** Connection test: asks TikTok for the shop, one order and one product and reports which FIELD NAMES come back (never the values). */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || !can(user, "admin")) return NextResponse.json({ error: "Owner only." }, { status: 403 });
  const group = ((await request.json().catch(() => null)) as { group?: string } | null)?.group;
  const run = async (name: string, path: string, o: Parameters<typeof callApi>[1], pick: (d: Record<string, unknown>) => unknown): Promise<Check> => {
    await new Promise((r) => setTimeout(r, 400)); // stay under TikTok's shared rate limit
    try {
      const d = (await callApi<Record<string, unknown>>(path, o)) ?? {};
      const items = pick(d);
      return { name, path, ok: true, message: "OK", count: Array.isArray(items) ? items.length : null, fields: keyPaths(Array.isArray(items) ? items[0] : items) };
    } catch (e) {
      return { name, path, ok: false, message: e instanceof Error ? e.message : "Failed", count: null, fields: [] };
    }
  };
  if (group === "analytics") {
    // Shop analytics reports (videos, products, shop totals) for the last 28 days. Path versions are tried in turn because the shop may only support one.
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const end = new Date(Date.now() + 86400000);
    const q = (extra: Record<string, string> = {}) => ({ query: { start_date_ge: iso(new Date(Date.now() - 28 * 86400000)), end_date_lt: iso(end), page_size: "10", ...extra } });
    const checks = [
      await run("Video performance", "/analytics/202409/shop_videos/performance", q(), firstList),
      await run("Product performance", "/analytics/202405/shop_products/performance", q(), firstList),
      await run("Shop performance", "/analytics/202405/shop/performance", q({ granularity: "ALL" }), (d) => (d.performance ? [d.performance] : firstList(d))),
      await run("LIVE performance", "/analytics/202409/shop_lives/performance", q(), firstList),
      await run("LIVE performance (newer)", "/analytics/202410/shop_lives/performance", q(), firstList),
      await run("LIVE performance (overview)", "/analytics/202409/shop_lives/overview_performance", q(), (d) => (d.performance ? [d.performance] : firstList(d))),
    ];
    return NextResponse.json({ checks });
  }
  if (group === "affiliate") {
    // We do not know for sure which version of each affiliate endpoint this shop can use, so we try the likely ones and report each.
    const post = (query: Record<string, string> = { page_size: "1" }, body: Record<string, unknown> = {}) => ({ method: "POST" as const, query, body });
    const checks = [
      await run("Open collaborations", "/affiliate_seller/202409/open_collaborations/search", post(), firstList),
      await run("Target collaborations", "/affiliate_seller/202409/target_collaborations/search", post({ page_size: "1" }, { collaboration_status: "ONGOING" }), firstList),
      await run("Target collaborations (all statuses)", "/affiliate_seller/202409/target_collaborations/search", post({ page_size: "1" }, { collaboration_status: "ALL" }), firstList),
      await run("Affiliate orders", "/affiliate_seller/202410/orders/search", post(), firstList),
      await run("Sample applications", "/affiliate_seller/202409/sample_applications/search", post(), firstList),
      await run("Creator marketplace", "/affiliate_seller/202406/marketplace_creators/search", post({ page_size: "12" }), firstList),
    ];
    return NextResponse.json({ checks });
  }
  const checks = [
    await run("Authorized shop", "/authorization/202309/shops", { shopLevel: false }, (d) => d.shops),
    await run("Orders (1 order)", "/order/202309/orders/search", { method: "POST", query: { page_size: "1" }, body: {} }, (d) => d.orders),
    await run("Products (1 product)", "/product/202309/products/search", { method: "POST", query: { page_size: "1" }, body: {} }, (d) => d.products),
  ];
  return NextResponse.json({ checks });
}
