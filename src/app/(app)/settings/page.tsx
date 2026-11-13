import type { Metadata } from "next";
import { headers } from "next/headers";
import { Bell, Building2, HardDrive, Plug, ShoppingBag, Store, Users } from "lucide-react";
import { can, requireUser } from "@/lib/auth";
import { gate } from "@/lib/gate";
import { rows } from "@/lib/sql";
import { sql } from "drizzle-orm";
import { Card, CardHeader, PageHeader } from "@/components/ui/primitives";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { TabLinks } from "@/components/ui/tab-links";
import { connectionInfo, tiktokConfig } from "@/lib/tiktok/client";
import { adsConfig, adsConnectionInfo, redirectUriFor } from "@/lib/tiktok-ads/client";
import { TikTokActions } from "@/components/settings/tiktok-card";
import { TikTokAdsActions } from "@/components/settings/tiktok-ads-card";
import { AlertsPanel } from "@/components/settings/alerts-panel";
import { StoragePanel } from "@/components/settings/storage-panel";
import { ShopeeActions } from "@/components/settings/shopee-card";
import { shopeeConfig, shopeeConnectionInfo } from "@/lib/shopee/client";
import { publicUrl } from "@/lib/public-url";
import { BoostWriteCard } from "@/components/settings/boost-write-card";
import { getBoostWriteSettings, recentBoostActions } from "@/lib/tiktok-ads/boost-write";
import { UsersPanel } from "@/components/users/users-panel";
import { fmtDayLabel, dayKL } from "@/lib/time";
import { one, type SP } from "@/lib/url";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

type Tab = "connection" | "users" | "storage" | "alerts";
const TABS: Tab[] = ["connection", "users", "storage", "alerts"];

function Soon({ icon: Icon, title, items }: { icon: React.ComponentType<{ className?: string }>; title: string; items: string[] }) {
  return (
    <div className="grid place-items-center rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-16 text-center" data-testid="settings-soon">
      <span className="grid size-14 place-items-center rounded-2xl bg-brand-soft text-brand"><Icon className="size-7" /></span>
      <h2 className="mt-5 text-[20px] font-semibold text-ink">{title}</h2>
      <p className="mt-1 text-[14.5px] text-ink-3">Coming later. This is where it will live:</p>
      <ul className="mt-4 space-y-1.5 text-[14px] text-ink-2">{items.map((i) => <li key={i}>{i}</li>)}</ul>
    </div>
  );
}

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  // The screen opens for anyone who may use at least one of its parts; the other parts show Permission Denied.
  const user = await requireUser();
  const canConn = can(user, "settings"), canUsers = can(user, "users");
  if (!canConn && !canUsers) { const { denied } = await gate("settings", "Settings"); return denied; }
  const sp = (await searchParams) as SP;
  const asked = one(sp.tab);
  const tab: Tab = TABS.includes(asked as Tab) ? (asked as Tab) : canConn ? "connection" : "users";
  const src = one(sp.src) === "ads" ? "ads" : one(sp.src) === "shopee" ? "shopee" : "shop";
  const first = canConn ? "/settings?tab=connection" : "/settings?tab=users";

  const tabs = (
    <TabLinks label="Settings sections" items={[
      { href: "/settings?tab=connection", label: "Connection", icon: Plug, active: tab === "connection", locked: !canConn, testId: "settings-tab-connection" },
      { href: "/settings?tab=users", label: "User Management", icon: Users, active: tab === "users", locked: !canUsers, testId: "settings-tab-users" },
      { href: "/settings?tab=storage", label: "Storage", icon: HardDrive, active: tab === "storage", locked: !canConn, testId: "settings-tab-storage" },
      { href: "/settings?tab=alerts", label: "System Alerts", icon: Bell, active: tab === "alerts", locked: !canConn, testId: "settings-tab-alerts" },
    ]} />
  );
  const denied = (need: "settings" | "users", screen: string) => (
    <PermissionDenied need={need} screen={screen} roleName={user.roleName} home={{ href: first, label: canConn ? "Connection" : "User Management" }} canManageRoles={canUsers} />
  );

  let body: React.ReactNode;
  if (tab === "users") {
    body = canUsers ? <UsersPanel meId={user.id} /> : denied("users", "Settings: User Management");
  } else if (!canConn) {
    body = denied("settings", tab === "connection" ? "Settings: Connection" : tab === "storage" ? "Settings: Storage" : "Settings: System Alerts");
  } else if (tab === "storage") {
    body = <StoragePanel />;
  } else if (tab === "alerts") {
    body = <AlertsPanel />;
  } else {
    const hdr = await headers();
    const [tt, ads, adsCfg, accounts, shops] = [await connectionInfo(), await adsConnectionInfo(), adsConfig(), await rows<{ advertiser_id: string; name: string | null; currency: string | null }>(sql`select advertiser_id, name, currency from ads_advertisers order by name nulls last, advertiser_id`), await rows<{ n: number }>(sql`select count(*)::int as n from ads_stores`)];
    const cfg = tiktokConfig();
    const shopMsg = ({ connected: "Connected to TikTok Shop.", denied: "TikTok did not approve the connection.", state: "The connection check failed (security code did not match). Please try Connect again.", missing: "The TikTok app key, secret or app ID is missing on the server.", error: `TikTok connection failed: ${one(sp.why) ?? "unknown error"}` } as Record<string, string>)[one(sp.tiktok) ?? ""];
    const adsMsg = ({ connected: "Connected to TikTok Ads.", denied: "TikTok did not approve the connection.", state: "The connection check failed (security code did not match). Please try Connect again.", missing: "The TikTok Ads app ID or secret is missing on the server.", error: `TikTok Ads connection failed: ${one(sp.why) ?? "unknown error"}` } as Record<string, string>)[one(sp.ads) ?? ""];
    const shopee = await shopeeConnectionInfo();
    const shopeeCfg = shopeeConfig();
    const shopeeMsg = ({ connected: "Connected to Shopee.", denied: "Shopee did not send the approval. Please try Connect again.", state: "The connection check failed (it did not start from this browser). Please try Connect again.", missing: "The Shopee partner ID or key is missing on the server.", error: `Shopee connection failed: ${one(sp.why) ?? "unknown error"}` } as Record<string, string>)[one(sp.shopee) ?? ""];
    const shopeeRedirect = publicUrl("/api/shopee/callback", new Request(`${hdr.get("x-forwarded-proto") ?? "http"}://${hdr.get("x-forwarded-host") ?? hdr.get("host") ?? "localhost:3000"}/`, { headers: hdr })).toString();
    const origin = `${hdr.get("x-forwarded-proto") ?? "http"}://${hdr.get("host") ?? "localhost:3000"}/`;
    const redirect = redirectUriFor(adsCfg ?? { appId: "", appSecret: "", redirectUri: process.env.TIKTOK_ADS_REDIRECT_URI?.trim() || null }, origin, hdr.get("x-forwarded-host"), hdr.get("x-forwarded-proto"));
    const accountList = accounts.length ? accounts.map((a) => ({ id: a.advertiser_id, name: a.name, currency: a.currency })) : ads.advertiserIds.map((id) => ({ id, name: null, currency: null }));
    body = (
      <div className="space-y-5">
        <TabLinks size="sm" label="Connection type" items={[
          { href: "/settings?tab=connection&src=shop", label: "Affiliate (TikTok Shop)", icon: ShoppingBag, active: src === "shop", testId: "conn-tab-shop" },
          { href: "/settings?tab=connection&src=ads", label: "Ad Management (GMV Max)", icon: Building2, active: src === "ads", testId: "conn-tab-ads" },
          { href: "/settings?tab=connection&src=shopee", label: "Shopee", icon: Store, active: src === "shopee", testId: "conn-tab-shopee" },
        ]} />
        {src === "shop" ? (
          <>
            {shopMsg && <p role="status" className="rounded-lg border border-line-strong bg-surface-2 px-4 py-3 text-[14px] text-ink" data-testid="tiktok-msg">{shopMsg}</p>}
            <Card>
              <CardHeader title="TikTok Shop connection" description="Read-only access to orders, products, returns, videos, LIVE and samples." />
              <div className="border-t border-line p-5">
                <TikTokActions v={{ configured: !!cfg, hasAuthLink: !!(cfg?.authUrl || cfg?.serviceId), connected: tt.connected, sellerName: tt.sellerName, shopName: tt.shopName, region: tt.region, scopes: tt.scopes, connectedLabel: tt.connectedAt ? fmtDayLabel(dayKL(tt.connectedAt)) : null, expiresLabel: tt.accessExpiresAt ? fmtDayLabel(dayKL(new Date(tt.accessExpiresAt * 1000))) : null }} />
              </div>
            </Card>
          </>
        ) : src === "shopee" ? (
          <>
            {shopeeMsg && <p role="status" className="rounded-lg border border-line-strong bg-surface-2 px-4 py-3 text-[14px] text-ink" data-testid="shopee-msg">{shopeeMsg}</p>}
            <Card>
              <CardHeader title="Shopee connection" description="Read-only access to your Shopee shop through the Shopee Open Platform. Orders and payouts sync in the next step." />
              <div className="border-t border-line p-5">
                <ShopeeActions v={{ configured: !!shopeeCfg, connected: shopee.connected, env: shopeeCfg?.env ?? "sandbox", shopName: shopee.shopName, shopId: shopee.shopIds[0] ?? null, region: shopee.region, connectedLabel: shopee.connectedAt ? fmtDayLabel(dayKL(shopee.connectedAt)) : null, accessLabel: shopee.accessExpiresAt ? fmtDayLabel(dayKL(new Date(shopee.accessExpiresAt * 1000))) : null, refreshLabel: shopee.refreshExpiresAt ? fmtDayLabel(dayKL(new Date(shopee.refreshExpiresAt * 1000))) : null, redirectUri: shopeeRedirect, redirectDomain: shopeeRedirect.replace(/\/api\/shopee\/callback$/, "") }} />
              </div>
            </Card>
          </>
        ) : (
          <>
            {adsMsg && <p role="status" className="rounded-lg border border-line-strong bg-surface-2 px-4 py-3 text-[14px] text-ink" data-testid="tiktok-ads-msg">{adsMsg}</p>}
            <Card>
              <CardHeader title="TikTok Ads connection" description="GMV Max campaigns, creatives and daily results, from TikTok API for Business. A separate login from TikTok Shop." />
              <div className="border-t border-line p-5">
                <TikTokAdsActions v={{ configured: !!adsCfg, connected: ads.connected, connectedLabel: ads.connectedAt ? fmtDayLabel(dayKL(ads.connectedAt)) : null, accounts: accountList, shops: shops[0]?.n ?? 0, permissions: ads.scopes.length, redirectUri: redirect }} />
              </div>
            </Card>
            {ads.connected && <BoostWriteCard initial={await getBoostWriteSettings()} actions={await recentBoostActions(15)} />}
          </>
        )}
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Connections, people and what each role can open." />
      {tabs}
      {body}
    </div>
  );
}
