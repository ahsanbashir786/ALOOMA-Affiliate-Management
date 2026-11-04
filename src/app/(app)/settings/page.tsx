import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { settings, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getOwnAccounts, getThresholds } from "@/lib/analytics/settings";
import { getWorkflowSettings } from "@/lib/workflow/settings";
import { Card, CardHeader, PageHeader } from "@/components/ui/primitives";
import { connectionInfo, tiktokConfig } from "@/lib/tiktok/client";
import { TikTokActions } from "@/components/settings/tiktok-card";
import { fmtDayLabel, dayKL } from "@/lib/time";
import { one, type SP } from "@/lib/url";
import { NewUserForm, OwnAccountsForm, ThresholdsForm, UserRow, WorkflowForm } from "@/components/settings/forms";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const me = await requireUser("admin");
  const sp = (await searchParams) as SP;
  const cfg = tiktokConfig();
  const tt = await connectionInfo();
  const ttMsg = ({ connected: "Connected to TikTok Shop.", denied: "TikTok did not approve the connection.", state: "The connection check failed (security code did not match). Please try Connect again.", missing: "The TikTok app key, secret or app ID is missing on the server.", error: `TikTok connection failed: ${one(sp.why) ?? "unknown error"}` } as Record<string, string>)[one(sp.tiktok) ?? ""];
  const [team, t, own, [stored], w] = await Promise.all([
    db.select({ id: users.id, name: users.name, email: users.email, role: users.role, active: users.active, canEditContacts: users.canEditContacts }).from(users).orderBy(asc(users.name)),
    getThresholds(),
    getOwnAccounts(),
    db.select().from(settings).where(eq(settings.key, "own_accounts")),
    getWorkflowSettings(),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Who can use the app, and the rules that decide how creators are grouped and what we recommend." />

      {ttMsg && <p role="status" className="rounded-lg border border-line-strong bg-surface-2 px-4 py-3 text-[14px] text-ink" data-testid="tiktok-msg">{ttMsg}</p>}

      <Card>
        <CardHeader title="TikTok Shop connection" description="Lets the system read orders, products, returns and shipping straight from TikTok instead of uploaded files. Read-only: it never changes your shop." />
        <div className="border-t border-line p-5">
          <TikTokActions v={{ configured: !!cfg, hasAuthLink: !!(cfg?.authUrl || cfg?.serviceId), connected: tt.connected, sellerName: tt.sellerName, shopName: tt.shopName, region: tt.region, scopes: tt.scopes, connectedLabel: tt.connectedAt ? fmtDayLabel(dayKL(tt.connectedAt)) : null, expiresLabel: tt.accessExpiresAt ? fmtDayLabel(dayKL(new Date(tt.accessExpiresAt * 1000))) : null }} />
        </div>
      </Card>

      <Card>
        <CardHeader title="Team" description="Viewers can look but not change anything. Affiliate managers can upload data and do Today's Work. Admins (the owner) also see Progress and manage settings and users. WhatsApp numbers can only be edited by admins and by people you tick “Can edit WhatsApp”." />
        <ul className="border-t border-line">
          {team.map((u) => <UserRow key={u.id} u={u} isMe={u.id === me.id} />)}
        </ul>
        <div className="border-t border-line bg-surface-2/50 p-5">
          <p className="mb-3 text-[13px] font-medium text-ink">Add a team member</p>
          <NewUserForm />
        </div>
      </Card>

      <Card>
        <CardHeader title="Daily workflow" description="How often to follow up and when a creator is suggested for a pause. All dates use Malaysia time." />
        <div className="border-t border-line p-5"><WorkflowForm w={w} /></div>
      </Card>

      <Card>
        <CardHeader title="Recommendation rules" description="Thresholds used to group creators. The “uplift” settings only feed an assumption-based scenario on the Opportunities page, never staff targets. Defaults are tuned to this kind of catalogue; adjust them as your programme grows." />
        <div className="border-t border-line p-5"><ThresholdsForm t={t} /></div>
      </Card>

      <Card>
        <CardHeader title="Brand accounts" />
        <div className="border-t border-line p-5"><OwnAccountsForm accounts={own.join(", ")} auto={!stored} /></div>
      </Card>
    </div>
  );
}
