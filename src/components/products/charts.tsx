"use client";

import { BarChart } from "@/components/viz/bar-chart";
import { BUCKET_COLOR, bucketLabel } from "./ui";
import type { Bucket } from "@/lib/products/diagnose";

const rmw = (v: number) => `RM ${Math.round(v).toLocaleString("en-MY")}`;
const k = (v: number) => (v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(v));
const ORDER: Bucket[] = ["new", "recent", "old", "veryold", "live", "other"];

export type WeekPoint = { label: string } & Record<Bucket, number>;

/** Weekly sales for the last 12 weeks, stacked by where each sale came from. */
export function WeeklyMixChart({ data, height = 260 }: { data: WeekPoint[]; height?: number }) {
  return (
    <BarChart data={data} x={(d) => d.label} height={height} stacked label="Weekly sales by content age, last 12 weeks" yFmt={k}
      series={ORDER.map((b) => ({ key: b, name: bucketLabel(b), color: BUCKET_COLOR[b] }))}
      tip={(d) => <>{ORDER.filter((b) => d[b] > 0).map((b) => <p key={b} className="flex items-center justify-between gap-3"><span className="inline-flex items-center gap-1.5 text-ink-3"><span className="size-2 rounded-sm" style={{ background: BUCKET_COLOR[b] }} />{bucketLabel(b)}</span><b className="tnum text-ink">{rmw(d[b])}</b></p>)}</>} />
  );
}

// Same colours as the weekly chart: new, recent, old (31-60 days), very old (over 60 days).
const AGE_COLORS = ["var(--brand)", "var(--brand)", "var(--s1)", "var(--s4)", "var(--s2)", "var(--s2)"];
/** Sales by how old the video was when the sale happened: shows how fast videos fade. */
export function AgeChart({ data, height = 260 }: { data: { band: string; sales: number; contents: number }[]; height?: number }) {
  return (
    <BarChart data={data} x={(d) => d.band} height={height} label="Sales by the age of the video" yFmt={k}
      series={[{ key: "sales", name: "Sales", color: (_d, i) => AGE_COLORS[i] }]}
      tip={(d) => <p className="text-ink-2">{rmw(d.sales)} from {d.contents} video{d.contents === 1 ? "" : "s"}</p>} />
  );
}
