import type { Metadata } from "next";
import { gate } from "@/lib/gate";
import { Card, CardHeader, PageHeader } from "@/components/ui/primitives";
import { connectionInfo, tiktokConfig } from "@/lib/tiktok/client";
import { TikTokActions } from "@/components/settings/tiktok-card";
import { fmtDayLabel, dayKL } from "@/lib/time";
import { one, type SP } from "@/lib/url";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const { denied } = await gate("settings", "Settings");
  if (denied) return denied;
  const sp = (await searchParams) as SP;
  const cfg = tiktokConfig();
  const tt = await connectionInfo();
  const msg = ({ connected: "Connected to TikTok Shop.", denied: "TikTok did not approve the connection.", state: "The connection check failed (security code did not match). Please try Connect again.", missing: "The TikTok app key, secret or app ID is missing on the server.", error: `TikTok connection failed: ${one(sp.why) ?? "unknown error"}` } as Record<string, string>)[one(sp.tiktok) ?? ""];
  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="The connection that feeds every screen. People and what they may do are in Users & Roles." />
      {msg && <p role="status" className="rounded-lg border border-line-strong bg-surface-2 px-4 py-3 text-[14px] text-ink" data-testid="tiktok-msg">{msg}</p>}
      <Card>
        <CardHeader title="TikTok Shop connection" description="Read-only access to orders, products, returns, videos, LIVE and samples." />
        <div className="border-t border-line p-5">
          <TikTokActions v={{ configured: !!cfg, hasAuthLink: !!(cfg?.authUrl || cfg?.serviceId), connected: tt.connected, sellerName: tt.sellerName, shopName: tt.shopName, region: tt.region, scopes: tt.scopes, connectedLabel: tt.connectedAt ? fmtDayLabel(dayKL(tt.connectedAt)) : null, expiresLabel: tt.accessExpiresAt ? fmtDayLabel(dayKL(new Date(tt.accessExpiresAt * 1000))) : null }} />
        </div>
      </Card>
    </div>
  );
}
