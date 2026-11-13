import type { Metadata } from "next";
import { Building2, ShoppingBag } from "lucide-react";
import { can } from "@/lib/auth";
import { gate } from "@/lib/gate";
import { connectionInfo } from "@/lib/tiktok/client";
import { syncOverview } from "@/lib/tiktok/sync";
import { adsConfig, adsConnectionInfo } from "@/lib/tiktok-ads/client";
import { adsOverview } from "@/lib/tiktok-ads/sync";
import { SyncBoard } from "@/components/sync/sync-board";
import { AdsSyncBoard } from "@/components/sync/ads-sync-board";
import { TabLinks } from "@/components/ui/tab-links";
import { one, type SP } from "@/lib/url";

export const metadata: Metadata = { title: "Data Sync" };
export const dynamic = "force-dynamic";

export default async function SyncPage({ searchParams }: PageProps<"/sync">) {
  const { user, denied } = await gate("sync", "Data Sync");
  if (denied) return denied;
  const tab = one(((await searchParams) as SP).tab) === "ads" ? "ads" : "affiliate";
  const tabs = (
    <TabLinks label="Data source" items={[
      { href: "/sync", label: "Affiliate", icon: ShoppingBag, active: tab === "affiliate", testId: "sync-tab-affiliate" },
      { href: "/sync?tab=ads", label: "Ads Management", icon: Building2, active: tab === "ads", testId: "sync-tab-ads" },
    ]} />
  );
  if (tab === "ads") {
    const [ov, conn] = await Promise.all([adsOverview(), adsConnectionInfo()]);
    return (
      <div className="space-y-6">
        <div className="space-y-3">
          <h1 className="text-[26px] font-semibold tracking-tight text-ink">Data Sync</h1>
          {tabs}
          <p className="text-[14px] text-ink-3">TikTok Ads · GMV Max campaigns, creatives and daily results</p>
        </div>
        <AdsSyncBoard initial={ov} connected={conn.connected} configured={!!adsConfig()} canAdmin={can(user, "settings")} canRun={can(user, "sync")} canConnect={can(user, "settings")} serverNow={ov.now} />
      </div>
    );
  }
  const [ov, conn] = await Promise.all([syncOverview(), connectionInfo()]);
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h1 className="text-[26px] font-semibold tracking-tight text-ink">Data Sync</h1>
        {tabs}
        {conn.connected && <p className="text-[14px] text-ink-3">{[conn.shopName ?? conn.sellerName, conn.region].filter(Boolean).join(" · ")}</p>}
      </div>
      <SyncBoard initial={ov} connected={conn.connected} canAdmin={can(user, "settings")} canRun={can(user, "sync")} serverNow={ov.now} />
    </div>
  );
}
