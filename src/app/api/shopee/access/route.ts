import { NextResponse } from "next/server";
import { can, getCurrentUser } from "@/lib/auth";
import { shopeeConnectionInfo } from "@/lib/shopee/client";
import { runShopeeAccessChecks } from "@/lib/shopee/checks";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Which parts of the Shopee API this app may use (orders, payments, returns, ads, wallet, stock, affiliate). Read-only; saves nothing. */
export async function POST() {
  const user = await getCurrentUser();
  if (!user || user.readOnly || !can(user, "sync")) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  if (!(await shopeeConnectionInfo()).connected) return NextResponse.json({ error: "Shopee is not connected yet." }, { status: 409 });
  return NextResponse.json(await runShopeeAccessChecks(), { headers: { "cache-control": "no-store" } });
}
