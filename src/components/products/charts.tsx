"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BUCKET_COLOR, bucketLabel } from "./ui";
import type { Bucket } from "@/lib/products/diagnose";

const AXIS = { fontSize: 12, fill: "var(--ink-3)" } as const;
const TIP = { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10, fontSize: 13 } as const;
const k = (v: number) => (v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(v));
const ORDER: Bucket[] = ["new", "recent", "old", "veryold", "live", "other"];

export type WeekPoint = { label: string } & Record<Bucket, number>;

/** Weekly sales for the last 12 weeks, stacked by where each sale came from. */
export function WeeklyMixChart({ data, height = 260 }: { data: WeekPoint[]; height?: number }) {
  return (
    <div className="min-w-0 w-full" style={{ height }} role="img" aria-label="Weekly sales by content age, last 12 weeks">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
          <CartesianGrid stroke="var(--line)" vertical={false} />
          <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: "var(--line)" }} interval="preserveStartEnd" minTickGap={18} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} tickFormatter={k} />
          <Tooltip formatter={(v, name) => [`RM ${Math.round(Number(v)).toLocaleString("en-MY")}`, name]} contentStyle={TIP} cursor={{ fill: "var(--surface-2)" }} />
          {ORDER.map((b, i) => <Bar key={b} dataKey={b} name={bucketLabel(b)} stackId="s" fill={BUCKET_COLOR[b]} radius={i === ORDER.length - 1 ? [3, 3, 0, 0] : 0} isAnimationActive={false} />)}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const AGE_COLORS = ["var(--brand)", "var(--brand)", "var(--s1)", "var(--s4)", "var(--s4)", "var(--s4)"];
/** Sales by how old the video was when the sale happened: shows how fast videos fade. */
export function AgeChart({ data, height = 260 }: { data: { band: string; sales: number; contents: number }[]; height?: number }) {
  return (
    <div className="min-w-0 w-full" style={{ height }} role="img" aria-label="Sales by the age of the video">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
          <CartesianGrid stroke="var(--line)" vertical={false} />
          <XAxis dataKey="band" tick={AXIS} tickLine={false} axisLine={{ stroke: "var(--line)" }} interval={0} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} tickFormatter={k} />
          <Tooltip formatter={(v, _n, p) => [`RM ${Math.round(Number(v)).toLocaleString("en-MY")} from ${(p.payload as { contents: number }).contents} video${(p.payload as { contents: number }).contents === 1 ? "" : "s"}`, "Sales"]} contentStyle={TIP} cursor={{ fill: "var(--surface-2)" }} />
          <Bar dataKey="sales" radius={[4, 4, 0, 0]} isAnimationActive={false}>{data.map((_, i) => <Cell key={i} fill={AGE_COLORS[i]} />)}</Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
