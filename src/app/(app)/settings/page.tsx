import type { Metadata } from "next";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getWorkflowSettings } from "@/lib/creators/workflow/settings";
import { Card, CardHeader, PageHeader } from "@/components/ui/primitives";
import { connectionInfo, tiktokConfig } from "@/lib/tiktok/client";
import { TikTokActions } from "@/components/settings/tiktok-card";
import { fmtDayLabel, dayKL } from "@/lib/time";
import { one, type SP } from "@/lib/url";
import { NewUserForm, UserRow, WorkflowForm } from "@/components/settings/forms";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const me = await requireUser("admin");
  const sp = (await searchParams) as SP;
  const cfg = tiktokConfig();
  const tt = await connectionInfo();
  const ttMsg = ({ connected: "Connected to TikTok Shop.", denied: "TikTok did not approve the connection.", state: "The connection check failed (security code did not match). Please try Connect again.", missing: "The TikTok app key, secret or app ID is missing on the server.", error: `TikTok connection failed: ${one(sp.why) ?? "unknown error"}` } as Record<string, string>)[one(sp.tiktok) ?? ""];
  const [team, w] = await Promise.all([
    db.select({ id: users.id, name: users.name, email: users.email, role: users.role, active: users.active, canEditContacts: users.canEditContacts }).from(users).orderBy(asc(users.name)),
    getWorkflowSettings(),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Who can use the system, the TikTok connection, and how often creators are followed up." />

      {ttMsg && <p role="status" className="rounded-lg border border-line-strong bg-surface-2 px-4 py-3 text-[14px] text-ink" data-testid="tiktok-msg">{ttMsg}</p>}

      <Card>
        <CardHeader title="TikTok Shop connection" description="Lets the system read orders, products, returns and shipping straight from TikTok. Read-only: it never changes your shop." />
        <div className="border-t border-line p-5">
          <TikTokActions v={{ configured: !!cfg, hasAuthLink: !!(cfg?.authUrl || cfg?.serviceId), connected: tt.connected, sellerName: tt.sellerName, shopName: tt.shopName, region: tt.region, scopes: tt.scopes, connectedLabel: tt.connectedAt ? fmtDayLabel(dayKL(tt.connectedAt)) : null, expiresLabel: tt.accessExpiresAt ? fmtDayLabel(dayKL(new Date(tt.accessExpiresAt * 1000))) : null }} />
        </div>
      </Card>

      <Card>
        <CardHeader title="Team" description="Viewers can look and work on the actions assigned to them. Affiliate managers can also assign work, sync data and see everything. Admins (the owner) also manage settings and users. WhatsApp numbers can only be edited by admins and by people you tick “Can edit WhatsApp”." />
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
    </div>
  );
}
