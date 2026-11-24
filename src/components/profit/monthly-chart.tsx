"use client";

import { fmtRMCompact } from "@/lib/utils";
import { rm } from "@/lib/profit/format";
import { BarChart } from "@/components/viz/bar-chart";

/** Net profit of each month, oldest to newest. Green above zero, red below. */
export function MonthlyChart({ data }: { data: { month: string; net: number }[] }) {
  return (
    <div className="w-full px-3 pb-3">
      <BarChart data={data} x={(d) => d.month} height={256} label="Net profit by month" yFmt={(v) => fmtRMCompact(v)}
        series={[{ key: "net", name: "Net Profit", color: (d) => (d.net < 0 ? "var(--critical)" : "var(--s3)") }]}
        tip={(d) => <p className="flex justify-between gap-3"><span className="text-ink-3">Net Profit</span><b className="tnum text-ink">{rm(d.net)}</b></p>} />
    </div>
  );
}
