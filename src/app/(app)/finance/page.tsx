import type { Metadata } from "next";
import Link from "next/link";
import { Banknote, Hourglass, Landmark, Scale } from "lucide-react";
import { gate } from "@/lib/gate";
import { PageHeader } from "@/components/ui/primitives";
import { TabLinks } from "@/components/ui/tab-links";
import { RangePicker } from "@/components/ads/range-picker";
import { CashBoard, PendingBoard, PnlBoard } from "@/components/finance/boards";
import { cashData, pendingData, pnlData } from "@/lib/finance/data";
import { rangeSuffix, resolveRange } from "@/lib/ads/range";
import { connectionInfo } from "@/lib/tiktok/client";
import { todayKL } from "@/lib/time";
import { one, type SP } from "@/lib/url";

export const metadata: Metadata = { title: "Finance" };
export const dynamic = "force-dynamic";

const TABS = [{ key: "cash", label: "Money Released", icon: Banknote }, { key: "pnl", label: "Profit And Loss", icon: Scale }, { key: "pending", label: "Not Paid Yet", icon: Hourglass }] as const;
type Tab = (typeof TABS)[number]["key"];

export default async function FinancePage({ searchParams }: { searchParams: Promise<SP> }) {
  const { denied } = await gate("finance", "Finance");
  if (denied) return denied;
  const sp = await searchParams;
  const tab: Tab = TABS.find((t) => t.key === one(sp.tab))?.key ?? "cash";
  const today = todayKL();
  const spR = { range: one(sp.range), from: one(sp.from), to: one(sp.to) };
  const range = resolveRange(spR, today, "30d");
  const carry = rangeSuffix(spR);
  const header = <PageHeader title="Finance" description="The money TikTok has paid and will pay, the fees it takes, and your profit. Read from TikTok Shop's own settlement records." />;
  const [conn, probe] = await Promise.all([connectionInfo(), cashData(range)]);
  if (!probe.hasData)
    return (
      <div className="space-y-6">{header}
        <div className="grid place-items-center rounded-3xl border border-dashed border-line-strong bg-surface px-6 py-20 text-center" data-testid="fin-empty">
          <span className="grid size-16 place-items-center rounded-2xl bg-brand-soft text-brand"><Landmark className="size-8" /></span>
          <h2 className="mt-4 text-[20px] font-semibold text-ink">No Finance Data Yet</h2>
          <p className="mt-1 max-w-md text-[14.5px] text-ink-3">{conn.connected ? "After you turn on the Finance permission, connect TikTok Shop again, then press Sync Now in Data Sync." : "Connect TikTok Shop first, then press Sync Now in Data Sync."}</p>
          <div className="mt-5 flex gap-2"><Link href="/settings?tab=connection&src=shop" className="inline-flex h-10 items-center rounded-lg bg-brand px-5 text-[14.5px] font-medium text-white hover:bg-brand-strong">Open Connection</Link><Link href="/sync" className="inline-flex h-10 items-center rounded-lg border border-line-strong px-5 text-[14.5px] font-medium text-ink hover:bg-surface-2">Open Data Sync</Link></div>
        </div>
      </div>
    );
  let body: React.ReactNode;
  if (tab === "cash") body = <CashBoard d={probe} rangeLabel={range.label} />;
  else if (tab === "pnl") { const a = one(sp.ads); body = <PnlBoard p={await pnlData(range, a === "in" || a === "out" ? a : null)} rangeLabel={range.label} />; }
  else body = <PendingBoard d={await pendingData()} />;
  return (
    <div className="space-y-6">
      {header}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TabLinks label="Finance sections" size="sm" items={TABS.map((t) => ({ href: `/finance?tab=${t.key}${carry}`, label: t.label, icon: t.icon, active: tab === t.key, testId: `fin-tab-${t.key}` }))} />
        {tab !== "pending" && <RangePicker today={today} rangeKey={range.key} from={range.from} to={range.to} label={range.label} />}
      </div>
      {body}
    </div>
  );
}
