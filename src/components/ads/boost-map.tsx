"use client";

import { useMemo } from "react";
import { CartesianGrid, Cell, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { GROUP, type GroupKey } from "@/lib/ads/groups";
import type { PickRow } from "./picks-board";
import { rm, roiFmt } from "./ui";

const COLOR: Record<string, string> = { good: "var(--good)", brand: "var(--brand)", warn: "var(--warn)", critical: "var(--critical)", muted: "var(--ink-3)" };
type Pt = { key: string; x: number; y: number; z: number; row: PickRow; boostable: boolean };

/**
 * Every video as a bubble. Across: how much money it got (log scale). Up: ROI. Size: orders. The golden corner is top left: a lot of ROI from little money.
 * For videos never used in ads the map shows what is visible instead: views across, sales without ads up.
 */
export function BoostMap({ rows, picked, onToggle, mode }: { rows: PickRow[]; picked: Set<string>; onToggle: (r: PickRow) => void; mode: "ads" | "organic" }) {
  const pts = useMemo<Pt[]>(() => rows.filter((r) => (mode === "ads" ? r.cost > 0 : r.views > 0 || r.organicGmv > 0)).slice(0, 150).map((r) => ({
    key: r.key, row: r, boostable: GROUP[r.group].boost && !r.boostedNow,
    x: mode === "ads" ? Math.max(0.3, r.cost) : Math.max(1, r.views), y: mode === "ads" ? Math.min(60, r.roi ?? 0) : Math.max(0.5, r.organicGmv), z: mode === "ads" ? Math.max(1, r.orders) : 20,
  })), [rows, mode]);
  if (!pts.length) return null;
  return (
    <div className="h-[300px] w-full" data-testid="ads-map" role="img" aria-label="Bubble map of the videos: money across, ROI up, size by orders">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 12, right: 18, bottom: 28, left: 6 }}>
          <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" />
          <XAxis type="number" dataKey="x" scale="log" domain={["auto", "auto"]} tick={{ fontSize: 11, fill: "var(--ink-3)" }} tickFormatter={(v: number) => (mode === "ads" ? `RM ${v < 10 ? v.toFixed(1) : Math.round(v)}` : `${Math.round(v)}`)} label={{ value: mode === "ads" ? "Money it got (RM)" : "Views", position: "insideBottom", offset: -14, fontSize: 12, fill: "var(--ink-3)" }} allowDataOverflow />
          <YAxis type="number" dataKey="y" scale={mode === "ads" ? "linear" : "log"} domain={mode === "ads" ? [0, "auto"] : ["auto", "auto"]} tick={{ fontSize: 11, fill: "var(--ink-3)" }} tickFormatter={(v: number) => (mode === "ads" ? `${v}×` : `RM ${Math.round(v)}`)} width={48} label={{ value: mode === "ads" ? "ROI" : "Sales without ads", angle: -90, position: "insideLeft", fontSize: 12, fill: "var(--ink-3)" }} />
          <ZAxis type="number" dataKey="z" range={[40, 520]} />
          <Tooltip cursor={{ strokeDasharray: "3 3" }} content={({ active, payload }) => {
            const p = active && payload?.[0]?.payload as Pt | undefined; if (!p) return null;
            const r = p.row;
            return (
              <div className="max-w-[260px] rounded-xl border border-line bg-surface p-3 text-[12.5px] shadow-pop">
                <p className="line-clamp-2 font-semibold text-ink">{r.title || `Video ${r.creativeId.slice(-8)}`}</p>
                <p className="text-ink-3">{r.creator ? `@${r.creator}` : ""}</p>
                <p className="mt-1.5 text-ink-2">{mode === "ads" ? `${rm(r.cost)} spent · ${r.orders} orders · ROI ${roiFmt(r.roi)}` : `${Math.round(r.views).toLocaleString("en-MY")} views · ${rm(r.organicGmv)} sales without ads`}</p>
                <p className="mt-1 font-medium text-brand-strong">{GROUP[r.group].label}</p>
                <p className="mt-1 text-[11.5px] text-ink-3">{p.boostable ? (picked.has(r.key) ? "Click to remove from the batch" : "Click to add to the batch") : "Cannot be boosted now"}</p>
              </div>
            );
          }} />
          <Scatter data={pts} onClick={(d: unknown) => { const p = (d as { payload?: Pt }).payload ?? (d as Pt); if (p?.boostable) onToggle(p.row); }} cursor="pointer" isAnimationActive animationDuration={600}>
            {pts.map((p) => {
              const sel = picked.has(p.key), tone = COLOR[GROUP[p.row.group as GroupKey].tone];
              return <Cell key={p.key} fill={tone} fillOpacity={sel ? 0.95 : p.boostable ? 0.55 : 0.2} stroke={sel ? "var(--ink)" : tone} strokeWidth={sel ? 2.5 : 1} />;
            })}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
