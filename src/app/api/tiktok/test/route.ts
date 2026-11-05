import { NextResponse } from "next/server";
import { can, getCurrentUser } from "@/lib/auth";
import { callApi } from "@/lib/tiktok/client";

export const runtime = "nodejs";
export const maxDuration = 60;

type Check = { name: string; ok: boolean; message: string; count: number | null };

/** Connection check: asks TikTok for the shop, one order, one product and one affiliate order, and says whether each answered. Never returns the data itself. */
export async function POST() {
  const user = await getCurrentUser();
  if (!user || !can(user, "tiktok.manage")) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const run = async (name: string, path: string, o: Parameters<typeof callApi>[1], pick: (d: Record<string, unknown>) => unknown): Promise<Check> => {
    await new Promise((r) => setTimeout(r, 350)); // stay under TikTok's shared rate limit
    try {
      const d = (await callApi<Record<string, unknown>>(path, o)) ?? {};
      const items = pick(d);
      return { name, ok: true, message: "Answered", count: Array.isArray(items) ? items.length : null };
    } catch (e) {
      return { name, ok: false, message: e instanceof Error ? e.message.replace(/^TikTok said no \(\d+\): /, "") : "Failed", count: null };
    }
  };
  const one = { method: "POST" as const, query: { page_size: "1" }, body: {} };
  const checks = [
    await run("Shop", "/authorization/202309/shops", { shopLevel: false }, (d) => d.shops),
    await run("Orders", "/order/202309/orders/search", one, (d) => d.orders),
    await run("Products", "/product/202309/products/search", one, (d) => d.products),
    await run("Affiliate orders", "/affiliate_seller/202410/orders/search", one, (d) => Object.values(d).find((v) => Array.isArray(v))),
  ];
  return NextResponse.json({ checks, at: new Date().toISOString() });
}
