"use client";

import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtRMCompact } from "@/lib/utils";
import { rm } from "@/lib/profit/format";

/** Net profit of each month, oldest to newest. Green above zero, red below. */
export function MonthlyChart({ data }: { data: { month: string; net: number }[] }) {
  return (
    <div className="h-64 w-full px-3 pb-3" role="img" aria-label="Net profit by month">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: "var(--ink-3)", fontSize: 12 }} />
          <YAxis tickLine={false} axisLine={false} width={64} tick={{ fill: "var(--ink-3)", fontSize: 12 }} tickFormatter={(v: number) => fmtRMCompact(v)} />
          <ReferenceLine y={0} stroke="var(--line-strong)" />
          <Tooltip cursor={{ fill: "var(--surface-2)" }} formatter={(v) => [rm(Number(v)), "Net Profit"]} contentStyle={{ background: "var(--surface)", border: "1px solid var(--line-strong)", borderRadius: 8, fontSize: 13 }} />
          <Bar dataKey="net" radius={[4, 4, 0, 0]} maxBarSize={44}>{data.map((d) => <Cell key={d.month} fill={d.net < 0 ? "var(--critical)" : "var(--s3)"} />)}</Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
