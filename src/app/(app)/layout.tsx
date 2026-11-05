import { requireUser } from "@/lib/auth";
import { syncFreshness } from "@/lib/creators/meta";
import { AppShell } from "@/components/shell/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [user, sync] = await Promise.all([requireUser(), syncFreshness()]);
  return (
    <AppShell user={user} sync={sync}>
      {children}
    </AppShell>
  );
}
