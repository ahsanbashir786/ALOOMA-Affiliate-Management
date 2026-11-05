import { NextResponse } from "next/server";
import { can, getCurrentUser } from "@/lib/auth";
import { connectionInfo } from "@/lib/tiktok/client";
import { refreshPlanAfterSync } from "@/lib/execution/refresh";
import { DATASETS, runAll, runDataset, syncOverview, type DatasetKey } from "@/lib/tiktok/sync";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Live status for the Data Sync screen. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !can(user, "manager")) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  return NextResponse.json(await syncOverview(), { headers: { "cache-control": "no-store" } });
}

/** "Sync now": starts the sync in the background and answers at once; the screen follows progress through GET. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || !can(user, "manager")) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  if (!(await connectionInfo()).connected) return NextResponse.json({ error: "TikTok Shop is not connected yet." }, { status: 409 });
  const asked = (await request.json().catch(() => null)) as { dataset?: string; history?: boolean; reread?: boolean } | null;
  const dataset = asked?.dataset;
  const key = DATASETS.find((d) => d.key === dataset)?.key as DatasetKey | undefined;
  const backfill = asked?.history === true;
  const reread = asked?.reread === true;
  const job = key ? runDataset(key, "manual", user.id, { backfill, reread }) : runAll("manual", user.id, { backfill, reread });
  void Promise.resolve(job).then(refreshPlanAfterSync).catch(() => {});
  return NextResponse.json({ started: key ?? "all" }, { status: 202 });
}
