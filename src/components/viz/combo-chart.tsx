"use client";

import { Bar, CartesianGrid, ComposedChart, Line, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type ComboPoint = { label: string; bars: number; line?: number | null; flag?: boolean };

/** Bars (volume) with a line (a rate on the right axis); flagged days get a red marker. */
export function ComboChart({ data, barLabel, lineLabel, height = 260 }: { data: ComboPoint[]; barLabel: string; lineLabel: string; height?: number }) {
  return (
    <div className="min-w-0 w-full" style={{ height }} role="img" aria-label={`${barLabel} with ${lineLabel}`}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
          <CartesianGrid stroke="var(--line)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 12, fill: "var(--ink-3)" }} tickLine={false} axisLine={{ stroke: "var(--line)" }} interval="preserveStartEnd" minTickGap={24} />
          <YAxis yAxisId="l" tick={{ fontSize: 12, fill: "var(--ink-3)" }} tickLine={false} axisLine={false} width={52} />
          <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 12, fill: "var(--ink-3)" }} tickLine={false} axisLine={false} width={40} unit="%" />
          <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10, fontSize: 13 }} />
          <Bar yAxisId="l" dataKey="bars" name={barLabel} fill="var(--brand)" fillOpacity={0.35} radius={[3, 3, 0, 0]} isAnimationActive={false} />
          <Line yAxisId="r" dataKey="line" name={lineLabel} stroke="var(--critical)" strokeWidth={2.5} dot={false} connectNulls isAnimationActive={false} />
          {data.filter((d) => d.flag && d.line != null).map((d) => <ReferenceDot key={d.label} yAxisId="r" x={d.label} y={d.line as number} r={5} fill="var(--critical)" stroke="var(--surface)" strokeWidth={2} />)}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
