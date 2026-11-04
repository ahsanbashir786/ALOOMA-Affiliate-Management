"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type WeekPoint = { label: string; video: number; live: number };

/** Weekly sales in RM, split into what came from videos and from LIVE. */
export function SalesChart({ data, height = 240 }: { data: WeekPoint[]; height?: number }) {
  return (
    <div className="min-w-0 w-full" style={{ height }} role="img" aria-label="Weekly sales from videos and LIVE">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
          <CartesianGrid stroke="var(--line)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 12, fill: "var(--ink-3)" }} tickLine={false} axisLine={{ stroke: "var(--line)" }} interval="preserveStartEnd" minTickGap={28} />
          <YAxis tick={{ fontSize: 12, fill: "var(--ink-3)" }} tickLine={false} axisLine={false} width={48} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(v))} />
          <Tooltip formatter={(v) => `RM ${Math.round(Number(v)).toLocaleString("en-MY")}`} contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10, fontSize: 13 }} cursor={{ fill: "var(--surface-2)" }} />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 13 }} />
          <Bar dataKey="video" name="Videos" stackId="s" fill="var(--brand)" isAnimationActive={false} />
          <Bar dataKey="live" name="LIVE" stackId="s" fill="var(--s2, #2f7d6d)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
