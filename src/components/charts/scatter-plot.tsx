"use client";

import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { SEGMENTS, type SegmentKey } from "@/lib/segments";
import { fmtRM, fmtRMCompact } from "@/lib/utils";

type P = { name: string; x: number; y: number; segment: SegmentKey | null };

const COLOR: Record<string, string> = {
  good: "var(--s3)",
  brand: "var(--s1)",
  neutral: "var(--ink-3)",
  warn: "var(--s4)",
  serious: "var(--s2)",
  critical: "var(--s8)",
};

function Tip({ active, payload }: { active?: boolean; payload?: { payload: P }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 shadow-pop">
      <p className="text-[13px] font-semibold text-ink">{p.name}</p>
      <p className="tnum text-[12.5px] text-ink-2">{fmtRM(p.y)} GMV</p>
      <p className="tnum text-[12.5px] text-ink-2">{p.x.toFixed(1)} new videos / week</p>
      <p className="text-[12px] text-ink-3">{p.segment ? SEGMENTS[p.segment].label : "Long tail"}</p>
    </div>
  );
}

export function ScatterPlot({ points }: { points: P[] }) {
  const groups = new Map<string, P[]>();
  for (const p of points) {
    const tone = p.segment ? SEGMENTS[p.segment].tone : "neutral";
    groups.set(tone, [...(groups.get(tone) ?? []), p]);
  }
  return (
    <div className="h-[320px]" role="img" aria-label="Scatter plot of new videos per week against GMV per creator">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 10, right: 16, bottom: 22, left: 4 }}>
          <CartesianGrid stroke="var(--grid)" />
          <XAxis
            type="number"
            dataKey="x"
            name="Videos per week"
            tick={{ fill: "var(--ink-3)", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            label={{ value: "New shoppable videos per week", position: "insideBottom", offset: -12, fill: "var(--ink-3)", fontSize: 12 }}
          />
          <YAxis
            type="number"
            dataKey="y"
            name="GMV"
            scale="sqrt"
            tickFormatter={(v) => fmtRMCompact(Number(v)).replace("RM ", "")}
            tick={{ fill: "var(--ink-3)", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={44}
          />
          <ZAxis range={[46, 46]} />
          <Tooltip content={<Tip />} cursor={{ strokeDasharray: "3 3" }} isAnimationActive={false} />
          {[...groups].map(([tone, pts]) => (
            <Scatter key={tone} data={pts} fill={COLOR[tone]} fillOpacity={0.85} stroke="var(--surface)" strokeWidth={1.5} isAnimationActive={false} />
          ))}
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
