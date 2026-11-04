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
    try {
      const d = (await callApi<Record<string, unknown>>(path, o)) ?? {};
      const items = pick(d);
      return { name, path, ok: true, message: "OK", count: Array.isArray(items) ? items.length : null, fields: keyPaths(Array.isArray(items) ? items[0] : items) };
    } catch (e) {
      return { name, path, ok: false, message: e instanceof Error ? e.message : "Failed", count: null, fields: [] };
    }
  };
  if (group === "affiliate") {
    // We do not know for sure which version of each affiliate endpoint this shop can use, so we try the likely ones and report each.
    const post = (query: Record<string, string> = { page_size: "1" }) => ({ method: "POST" as const, query, body: {} });
    const checks = [
      await run("Creator collaborations (target)", "/affiliate_seller/202405/target_collaborations/search", post(), firstList),
      await run("Creator collaborations (target, newer)", "/affiliate_seller/202409/target_collaborations/search", post(), firstList),
      await run("Open collaborations", "/affiliate_seller/202409/open_collaborations/search", post(), firstList),
      await run("Affiliate orders", "/affiliate_seller/202410/orders/search", post(), firstList),
      await run("Affiliate orders (older)", "/affiliate_seller/202405/orders/search", post(), firstList),
      await run("Sample applications", "/affiliate_seller/202409/sample_applications/search", post(), firstList),
      await run("Creator marketplace", "/affiliate_seller/202406/marketplace_creators/search", post(), firstList),
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
