import { NextResponse } from "next/server";
import { can, getCurrentUser } from "@/lib/auth";
import { callApi } from "@/lib/tiktok/client";
import { keyPaths } from "@/lib/tiktok/sign";

export const runtime = "nodejs";
export const maxDuration = 60;

type Check = { name: string; ok: boolean; message: string; count: number | null; fields: string[] };

/** Connection test: asks TikTok for the shop, one order and one product and reports which FIELD NAMES come back (never the values). */
export async function POST() {
  const user = await getCurrentUser();
  if (!user || !can(user, "admin")) return NextResponse.json({ error: "Owner only." }, { status: 403 });
  const run = async (name: string, path: string, o: Parameters<typeof callApi>[1], pick: (d: Record<string, unknown>) => unknown): Promise<Check> => {
    try {
      const d = (await callApi<Record<string, unknown>>(path, o)) ?? {};
      const items = pick(d);
      return { name, ok: true, message: "OK", count: Array.isArray(items) ? items.length : null, fields: keyPaths(Array.isArray(items) ? items[0] : items) };
    } catch (e) {
      return { name, ok: false, message: e instanceof Error ? e.message : "Failed", count: null, fields: [] };
    }
  };
  const checks = [
    await run("Authorized shop", "/authorization/202309/shops", { shopLevel: false }, (d) => d.shops),
    await run("Orders (1 order)", "/order/202309/orders/search", { method: "POST", query: { page_size: "1" }, body: {} }, (d) => d.orders),
    await run("Products (1 product)", "/product/202309/products/search", { method: "POST", query: { page_size: "1" }, body: {} }, (d) => d.products),
  ];
  return NextResponse.json({ checks });
}
