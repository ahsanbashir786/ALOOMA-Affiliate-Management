import { NextResponse } from "next/server";
import { can, getCurrentUser } from "@/lib/auth";
import { clearProfit } from "@/lib/profit/data";
import { clearCosting } from "@/lib/stock/costing";
import { SHOPEE_DATASET_LIST, isShopeeSyncRunning, runShopeeSync, shopeeOverview, type ShopeeDatasetKey } from "@/lib/shopee/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The numbers for Data Sync → Shopee (refreshed every few seconds by the screen). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !can(user, "sync")) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  return NextResponse.json(await shopeeOverview(), { headers: { "cache-control": "no-store" } });
}

/** Starts a sync in the background and answers at once: { dataset? } for one part, { historyDays? } to read further back. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || !can(user, "sync") || user.readOnly) return NextResponse.json({ error: "Your role cannot run a sync." }, { status: 403 });
  if (isShopeeSyncRunning()) return NextResponse.json({ error: "A Shopee sync is already running." }, { status: 409 });
  const b = (await req.json().catch(() => ({}))) as { dataset?: string; historyDays?: number };
  const only = SHOPEE_DATASET_LIST.some((d) => d.key === b.dataset) ? [b.dataset as ShopeeDatasetKey] : undefined;
  const days = b.historyDays && Number.isFinite(b.historyDays) ? Math.min(900, Math.max(7, Math.round(b.historyDays))) : undefined;
  void runShopeeSync({ only, historyDays: days, force: true, trigger: "manual", userId: user.id }).then(() => { clearCosting(); clearProfit(); }).catch(() => {});
  return NextResponse.json({ started: true }, { status: 202 });
}
