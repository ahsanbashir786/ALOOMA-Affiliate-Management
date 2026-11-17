"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { sql as pg } from "@/db";
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

export type ShopeeSyncView = {
  running: boolean; orders: number; payments: number; awaiting: number; firstOrder: string | null; lastOrder: string | null; error: string | null;
  datasets: { key: string; label: string; what: string; at: string | null; records: number; error: string | null }[];
  /** The last 30 days of the Shopee wallet: money in (order payouts, refunds back), money out (withdrawals to the bank), and the newest balance. */
  wallet: { moneyIn: number; moneyOut: number; balance: number | null } | null;
};

/** What the Data Sync → Shopee screen shows. Anyone who can open Data Sync can read it. */
export async function getShopeeSyncView(): Promise<ShopeeSyncView> {
  await requirePermission("sync");
  const st = await shopeeSyncStatus();
  const [w] = await pg`select coalesce(sum(amount) filter (where amount > 0), 0)::float8 as money_in, coalesce(-sum(amount) filter (where amount < 0), 0)::float8 as money_out, count(*)::int as n,
    (select balance::float8 from shopee_wallet_tx where balance is not null order by created_at desc limit 1) as balance from shopee_wallet_tx where created_at > now() - interval '30 days'`;
  return {
    running: isShopeeSyncRunning(), orders: st.orders.records, payments: st.escrow.records, awaiting: st.awaiting, firstOrder: st.firstOrder, lastOrder: st.lastOrder,
    error: st.datasets.find((d) => d.error)?.error ?? null,
    wallet: w && Number(w.n) > 0 ? { moneyIn: Number(w.money_in), moneyOut: Number(w.money_out), balance: w.balance == null ? null : Number(w.balance) } : null,
    datasets: st.datasets.map((d) => ({ key: d.key, label: d.label, what: d.what, at: d.at ? new Date(d.at).toISOString() : null, records: d.records, error: d.error })),
  };
}

/** Starts a sync in the background (a first sync can take a few minutes) and returns at once; the screen shows the progress. `historyDays` reads further back. */
export async function startShopeeSync(historyDays?: number): Promise<{ started: boolean; message: string | null }> {
  await requirePermission("sync");
  if (isShopeeSyncRunning()) return { started: false, message: "A Shopee sync is already running." };
  const days = historyDays && Number.isFinite(historyDays) ? Math.min(730, Math.max(7, Math.round(historyDays))) : undefined;
  void runShopeeSync({ historyDays: days, force: true }).then(() => { clearCosting(); clearProfit(); }).catch(() => {});
  return { started: true, message: null };
}
