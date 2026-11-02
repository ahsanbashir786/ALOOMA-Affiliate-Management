import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { actions } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getDataBounds } from "@/lib/period";
import { AppShell } from "@/components/shell/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const bounds = await getDataBounds();
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(actions)
    .where(eq(actions.status, "open"));
  return (
    <AppShell user={user} openActions={n} bounds={bounds}>
      {children}
    </AppShell>
  );
}
