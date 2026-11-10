import type { Metadata } from "next";
import { gate } from "@/lib/gate";
import { PageHeader } from "@/components/ui/primitives";
import { adsConnectionInfo } from "@/lib/tiktok-ads/client";
import { DEFAULT_FILTERS, boostData, type BoostFilters } from "@/lib/ads/boost";
import { BoostBoard } from "@/components/ads/boost-board";
import { one, type SP } from "@/lib/url";

export const metadata: Metadata = { title: "GMV Max" };
export const dynamic = "force-dynamic";

const int = (v: string | undefined, d: number, lo: number, hi: number) => { const n = Number(v); return Number.isFinite(n) && v !== undefined && v !== "" ? Math.min(hi, Math.max(lo, Math.round(n))) : d; };

export default async function AdsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { denied } = await gate("ads", "GMV Max");
  if (denied) return denied;
  const sp = await searchParams;
  const days = ([7, 30, 90] as const).find((d) => d === Number(one(sp.days))) ?? DEFAULT_FILTERS.days;
  const f: BoostFilters = { days, minRoi: one(sp.roi) ? int(one(sp.roi), 0, 1, 200) : null, minOrders: int(one(sp.orders), DEFAULT_FILTERS.minOrders, 1, 1000), maxAgeDays: int(one(sp.age), DEFAULT_FILTERS.maxAgeDays, 7, 1000), product: one(sp.product) || null };
  const [data, conn] = await Promise.all([boostData(f), adsConnectionInfo()]);
  return (
    <div className="space-y-6">
      <PageHeader title="GMV Max" description="How your GMV Max ads are doing, and which videos are worth a creative boost. Read only for now: nothing here changes your ads." />
      <BoostBoard data={data} filters={f} connected={conn.connected} />
    </div>
  );
}
