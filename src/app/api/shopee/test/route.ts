import { NextResponse } from "next/server";
import { can, getCurrentUser } from "@/lib/auth";
import { shopeeConnectionInfo } from "@/lib/shopee/client";
import { runShopeeChecks } from "@/lib/shopee/checks";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Connection check for Shopee: asks for the shop's details and one recent order. Saves nothing. */
export async function POST() {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings")) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  if (!(await shopeeConnectionInfo()).connected) return NextResponse.json({ error: "Shopee is not connected yet." }, { status: 409 });
  return NextResponse.json(await runShopeeChecks(), { headers: { "cache-control": "no-store" } });
}
