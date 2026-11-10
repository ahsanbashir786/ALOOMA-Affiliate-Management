import { NextResponse } from "next/server";
import { can, getCurrentUser } from "@/lib/auth";
import { adsConnectionInfo } from "@/lib/tiktok-ads/client";
import { ADS_DATASETS, adsOverview, runAdsAll, runAdsDataset, type AdsDatasetKey } from "@/lib/tiktok-ads/sync";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Live status for the Ads Management tab of Data Sync. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !can(user, "sync")) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  return NextResponse.json(await adsOverview(), { headers: { "cache-control": "no-store" } });
}

/** "Sync now": starts the sync in the background and answers at once; the screen follows progress through GET. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || !can(user, "sync")) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  if (!(await adsConnectionInfo()).connected) return NextResponse.json({ error: "TikTok Ads is not connected yet." }, { status: 409 });
  const asked = (await request.json().catch(() => null)) as { dataset?: string; history?: boolean } | null;
  const key = ADS_DATASETS.find((d) => d.key === asked?.dataset)?.key as AdsDatasetKey | undefined;
  const backfill = asked?.history === true;
  void (key ? runAdsDataset(key, "manual", user.id, { backfill }) : runAdsAll("manual", user.id, { backfill })).catch(() => {});
  return NextResponse.json({ started: key ?? "all" }, { status: 202 });
}
