"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { shopeeDisconnect } from "@/lib/shopee/client";
import { isShopeeSyncRunning, runShopeeSync, shopeeSyncStatus } from "@/lib/shopee/sync";
import { clearProfit } from "@/lib/profit/data";
import { clearCosting } from "@/lib/stock/costing";

/** Forget the Shopee connection (the login is deleted). Nothing in Shopee changes. */
export async function disconnectShopee(): Promise<{ ok: true }> {
  await requirePermission("settings");
  await shopeeDisconnect();
  revalidatePath("/settings");
  return { ok: true };
}

export type ShopeeSyncView = { running: boolean; ordersAt: string | null; escrowAt: string | null; orders: number; payments: number; awaiting: number; firstOrder: string | null; lastOrder: string | null; error: string | null };

export async function getShopeeSyncView(): Promise<ShopeeSyncView> {
  await requirePermission("settings");
  const st = await shopeeSyncStatus();
  return { running: isShopeeSyncRunning(), ordersAt: st.orders.at ? new Date(st.orders.at).toISOString() : null, escrowAt: st.escrow.at ? new Date(st.escrow.at).toISOString() : null, orders: st.orders.records, payments: st.escrow.records, awaiting: st.awaiting, firstOrder: st.firstOrder, lastOrder: st.lastOrder, error: st.orders.error ?? st.escrow.error };
}

/** Starts a sync in the background (a first sync can take a few minutes) and returns at once; the card shows the progress. `historyDays` reads further back. */
export async function startShopeeSync(historyDays?: number): Promise<{ started: boolean; message: string | null }> {
  await requirePermission("settings");
  if (isShopeeSyncRunning()) return { started: false, message: "A Shopee sync is already running." };
  const days = historyDays && Number.isFinite(historyDays) ? Math.min(730, Math.max(7, Math.round(historyDays))) : undefined;
  void runShopeeSync({ historyDays: days }).then(() => { clearCosting(); clearProfit(); }).catch(() => {});
  return { started: true, message: null };
}
