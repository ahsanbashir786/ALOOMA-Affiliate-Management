"use client";

import { BarChart } from "@/components/viz/bar-chart";

export type WeekPoint = { label: string; video: number; live: number };
const rmw = (v: number) => `RM ${Math.round(v).toLocaleString("en-MY")}`;

/** Weekly sales in RM, split into what came from videos and from LIVE. */
export function SalesChart({ data, height = 240 }: { data: WeekPoint[]; height?: number }) {
  return (
    <BarChart data={data} x={(d) => d.label} height={height} stacked legend label="Weekly sales from videos and LIVE"
      yFmt={(v) => (v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(v))}
      series={[{ key: "video", name: "Videos", color: "var(--brand)" }, { key: "live", name: "LIVE", color: "var(--s2, #2f7d6d)" }]}
      tip={(d) => <><p className="flex justify-between gap-3"><span className="text-ink-3">Videos</span><b className="tnum text-ink">{rmw(d.video)}</b></p><p className="flex justify-between gap-3"><span className="text-ink-3">LIVE</span><b className="tnum text-ink">{rmw(d.live)}</b></p></>} />
  );
}
