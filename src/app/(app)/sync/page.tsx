import type { Metadata } from "next";
import { can } from "@/lib/auth";
import { gate } from "@/lib/gate";
import { connectionInfo } from "@/lib/tiktok/client";
import { syncOverview } from "@/lib/tiktok/sync";
import { SyncBoard } from "@/components/sync/sync-board";

export const metadata: Metadata = { title: "Data Sync" };
export const dynamic = "force-dynamic";

export default async function SyncPage() {
  const { user, denied } = await gate("sync", "Data Sync");
  if (denied) return denied;
  const [ov, conn] = await Promise.all([syncOverview(), connectionInfo()]);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight text-ink">Data Sync</h1>
          {conn.connected && <p className="mt-0.5 text-[14px] text-ink-3">{[conn.shopName ?? conn.sellerName, conn.region].filter(Boolean).join(" · ")}</p>}
        </div>
      </div>
      <SyncBoard initial={ov} connected={conn.connected} canAdmin={can(user, "settings")} canRun={can(user, "sync")} serverNow={ov.now} />
    </div>
  );
}
