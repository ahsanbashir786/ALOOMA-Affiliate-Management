import { NextResponse } from "next/server";
import { can, getCurrentUser } from "@/lib/auth";
import { connectionInfo } from "@/lib/tiktok/client";
import { DATASETS, runAll, runDataset, syncOverview, trustCheck, type DatasetKey } from "@/lib/tiktok/sync";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Live status for the Data Sync screen. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !can(user, "manager")) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const [ov, trust] = await Promise.all([syncOverview(), trustCheck()]);
  return NextResponse.json({ ...ov, trust }, { headers: { "cache-control": "no-store" } });
}

/** "Sync now": starts the sync in the background and answers at once; the screen follows progress through GET. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || !can(user, "manager")) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  if (!(await connectionInfo()).connected) return NextResponse.json({ error: "TikTok Shop is not connected yet." }, { status: 409 });
  const dataset = ((await request.json().catch(() => null)) as { dataset?: string } | null)?.dataset;
  const key = DATASETS.find((d) => d.key === dataset)?.key as DatasetKey | undefined;
  const job = key ? runDataset(key, "manual", user.id) : runAll("manual", user.id);
  void Promise.resolve(job).catch(() => {});
  return NextResponse.json({ started: key ?? "all" }, { status: 202 });
}
