import { requireUser } from "@/lib/auth";
import { getDataBounds } from "@/lib/period";
import { dueTodayCount } from "@/lib/workflow/today";
import { AppShell } from "@/components/shell/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const bounds = await getDataBounds();
  const due = await dueTodayCount();
  return (
    <AppShell user={user} openActions={due} bounds={bounds}>
      {children}
    </AppShell>
  );
}
