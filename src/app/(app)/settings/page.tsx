import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { settings, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getOwnAccounts, getThresholds } from "@/lib/analytics/settings";
import { Card, CardHeader, PageHeader } from "@/components/ui/primitives";
import { NewUserForm, OwnAccountsForm, ThresholdsForm, UserRow } from "@/components/settings/forms";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const me = await requireUser("admin");
  const [team, t, own, [stored]] = await Promise.all([
    db.select({ id: users.id, name: users.name, email: users.email, role: users.role, active: users.active }).from(users).orderBy(asc(users.name)),
    getThresholds(),
    getOwnAccounts(),
    db.select().from(settings).where(eq(settings.key, "own_accounts")),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Who can use the app, and the rules that decide how creators are grouped and what we recommend." />

      <Card>
        <CardHeader title="Team" description="Viewers can look but not change anything. Affiliate managers can upload data and work the action centre. Admins also manage settings and users." />
        <ul className="border-t border-line">
          {team.map((u) => <UserRow key={u.id} u={u} isMe={u.id === me.id} />)}
        </ul>
        <div className="border-t border-line bg-surface-2/50 p-5">
          <p className="mb-3 text-[13px] font-medium text-ink">Add a team member</p>
          <NewUserForm />
        </div>
      </Card>

      <Card>
        <CardHeader title="Recommendation rules" description="Thresholds used to group creators and size the opportunity. Defaults are tuned to this kind of catalogue; adjust them as your programme grows." />
        <div className="border-t border-line p-5"><ThresholdsForm t={t} /></div>
      </Card>

      <Card>
        <CardHeader title="Brand accounts" />
        <div className="border-t border-line p-5"><OwnAccountsForm accounts={own.join(", ")} auto={!stored} /></div>
      </Card>
    </div>
  );
}
