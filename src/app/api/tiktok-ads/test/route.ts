import { NextResponse } from "next/server";
import { can, getCurrentUser } from "@/lib/auth";
import { adsConnectionInfo } from "@/lib/tiktok-ads/client";
import { runAdsChecks } from "@/lib/tiktok-ads/checks";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Connection check for TikTok Ads: asks for the ad accounts, GMV Max shops, campaigns and one week of results. Saves nothing. */
export async function POST() {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings")) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  if (!(await adsConnectionInfo()).connected) return NextResponse.json({ error: "TikTok Ads is not connected yet." }, { status: 409 });
  return NextResponse.json(await runAdsChecks(), { headers: { "cache-control": "no-store" } });
}
