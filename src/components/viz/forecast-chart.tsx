"use client";

import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type ForecastPoint = { label: string; actual?: number | null; forecast?: number | null; band?: [number, number] | null };

/** History as a solid line, the forecast as a dashed line with its likely range shaded. Hover for exact numbers. */
export function ForecastChart({ data, unit = "units", height = 260 }: { data: ForecastPoint[]; unit?: string; height?: number }) {
  return (
    <div className="min-w-0 w-full" style={{ height }} role="img" aria-label={`Weekly ${unit}: history and forecast with range`}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
          <CartesianGrid stroke="var(--line)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 12, fill: "var(--ink-3)" }} tickLine={false} axisLine={{ stroke: "var(--line)" }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 12, fill: "var(--ink-3)" }} tickLine={false} axisLine={false} width={52} />
          <Tooltip
            contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10, fontSize: 13 }}
            formatter={(v, n) => [Array.isArray(v) ? `${v[0]}–${v[1]}` : `${v}`, n === "band" ? "Likely range" : n === "forecast" ? "Forecast" : "Actual"]}
          />
          <Area dataKey="band" stroke="none" fill="var(--brand)" fillOpacity={0.14} isAnimationActive={false} />
          <Line dataKey="actual" stroke="var(--brand)" strokeWidth={2.5} dot={false} connectNulls={false} isAnimationActive={false} />
          <Line dataKey="forecast" stroke="var(--brand)" strokeWidth={2.5} strokeDasharray="6 5" dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
