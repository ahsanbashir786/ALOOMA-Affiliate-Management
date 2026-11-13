import { requireUser } from "@/lib/auth";
import { syncFreshness } from "@/lib/creators/meta";
import { AppShell } from "@/components/shell/app-shell";
import { can } from "@/lib/can";
import { alertSummary } from "@/lib/alerts/queries";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [user, sync] = await Promise.all([requireUser(), syncFreshness()]);
  // The bell shows only for people who can open Settings. A failed read must never stop a page.
  const alerts = can(user, "settings") ? await alertSummary().then((s) => ({ unseen: s.unseen, worst: s.worst })).catch(() => null) : null;
  return (
    <AppShell user={user} sync={sync} alerts={alerts}>
      {children}
    </AppShell>
  );
}
