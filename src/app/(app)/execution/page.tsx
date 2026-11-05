import type { Metadata } from "next";
import { can, requireUser } from "@/lib/auth";
import { loadPlan, syncPlan } from "@/lib/execution/plan";
import { PageHeader } from "@/components/ui/primitives";
import { ExecutionBoard } from "@/components/execution/board";

export const metadata: Metadata = { title: "Execution Plan" };

export default async function ExecutionPage() {
  const user = await requireUser();
  // The plan writes itself from the latest numbers; this is a quick check unless something changed.
  try { await syncPlan(); } catch (e) { console.error("Execution plan sync failed", e); }
  const data = await loadPlan();
  return (
    <div className="space-y-2">
      <PageHeader title="Execution Plan" description="What to do next to sell more of each product. The system writes the actions from the product numbers; your team assigns, does and ticks them off." />
      <ExecutionBoard data={data} me={user.id} meName={user.name} canManage={can(user, "manager")} />
    </div>
  );
}
