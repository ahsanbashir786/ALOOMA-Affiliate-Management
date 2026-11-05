import type { Metadata } from "next";
import { can } from "@/lib/auth";
import { gate } from "@/lib/gate";
import { loadPlan, syncPlan } from "@/lib/execution/plan";
import { PageHeader } from "@/components/ui/primitives";
import { ExecutionBoard } from "@/components/execution/board";

export const metadata: Metadata = { title: "Execution Plan" };

export default async function ExecutionPage() {
  const { user, denied } = await gate("execution.view", "Execution Plan");
  if (denied) return denied;
  // The plan is written after every data sync. Opening the screen only reads it (and writes it once if it was never written).
  let data = await loadPlan();
  if (!data.tasks.length) {
    try { await syncPlan(); data = await loadPlan(); } catch (e) { console.error("Execution plan sync failed", e); }
  }
  return (
    <div className="space-y-2">
      <PageHeader title="Execution Plan" description="What to do next to sell more of each product. The system writes the actions from the product numbers; your team assigns, does and ticks them off." />
      <ExecutionBoard data={data} me={user.id} meName={user.name} canManage={can(user, "execution.assign")} canWork={can(user, "execution.work")} />
    </div>
  );
}
