"use client";

import { useMemo, useState } from "react";
import { niceTicks, useWidth } from "@/components/viz/bar-chart";
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
  const [box, W] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<Pt | null>(null);
  if (!pts.length) return null;
  const H = 300, L = 58, R = 18, T = 12, B = 40, pw = W - L - R, ph = H - T - B;
  const lg = (v: number) => Math.log10(Math.max(v, 1e-6));
  const xs = pts.map((p) => lg(p.x)), x0 = Math.floor(Math.min(...xs) * 2) / 2, x1 = Math.ceil(Math.max(...xs) * 2) / 2 || x0 + 1;
  const yLog = mode !== "ads";
  const ys = pts.map((p) => (yLog ? lg(p.y) : p.y));
  const y0 = yLog ? Math.floor(Math.min(...ys) * 2) / 2 : 0;
  const yTicks = yLog ? null : niceTicks(0, Math.max(1, ...ys));
  const y1 = yLog ? Math.ceil(Math.max(...ys) * 2) / 2 || y0 + 1 : yTicks![yTicks!.length - 1];
  const sx = (v: number) => L + ((lg(v) - x0) / (x1 - x0 || 1)) * pw;
  const sy = (v: number) => T + ph * (1 - ((yLog ? lg(v) : v) - y0) / (y1 - y0 || 1));
  const zMax = Math.max(...pts.map((p) => p.z)), rr = (z: number) => Math.sqrt(40 + (Math.max(0, z) / (zMax || 1)) * 480) / 1.8;
  const xTickVals = Array.from({ length: Math.floor(x1 - x0) + 1 }, (_, i) => 10 ** (x0 + i)).filter((v) => lg(v) % 1 === 0 || x1 - x0 <= 2);
  const yTickVals = yLog ? Array.from({ length: Math.floor(y1 - y0) + 1 }, (_, i) => 10 ** (y0 + i)) : yTicks!;
  const fx = (v: number) => (mode === "ads" ? `RM ${v < 10 ? v.toFixed(1) : Math.round(v)}` : `${Math.round(v).toLocaleString("en-MY")}`);
  const fy = (v: number) => (mode === "ads" ? `${v}×` : `RM ${Math.round(v)}`);
  return (
    <div ref={box} className="relative h-[300px] w-full min-w-0 overflow-hidden" data-testid="ads-map" role="img" aria-label="Bubble map of the videos: money across, ROI up, size by orders" onMouseLeave={() => setHover(null)}>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block">
        {yTickVals.map((v) => <g key={`y${v}`}><line x1={L} x2={W - R} y1={sy(v)} y2={sy(v)} stroke="var(--line)" strokeDasharray="3 3" /><text x={L - 6} y={sy(v) + 4} textAnchor="end" fontSize={11} fill="var(--ink-3)">{fy(v)}</text></g>)}
        {xTickVals.map((v) => <g key={`x${v}`}><line x1={sx(v)} x2={sx(v)} y1={T} y2={T + ph} stroke="var(--line)" strokeDasharray="3 3" /><text x={sx(v)} y={T + ph + 16} textAnchor="middle" fontSize={11} fill="var(--ink-3)">{fx(v)}</text></g>)}
        <text x={L + pw / 2} y={H - 4} textAnchor="middle" fontSize={12} fill="var(--ink-3)">{mode === "ads" ? "Money it got (RM)" : "Views"}</text>
        <text x={14} y={T + ph / 2} textAnchor="middle" fontSize={12} fill="var(--ink-3)" transform={`rotate(-90 14 ${T + ph / 2})`}>{mode === "ads" ? "ROI" : "Sales without ads"}</text>
        {pts.map((p) => {
          const sel = picked.has(p.key), tone = COLOR[GROUP[p.row.group as GroupKey].tone];
          return <circle key={p.key} cx={sx(p.x)} cy={sy(p.y)} r={rr(p.z)} fill={tone} fillOpacity={sel ? 0.95 : p.boostable ? 0.55 : 0.2} stroke={sel ? "var(--ink)" : tone} strokeWidth={sel ? 2.5 : 1}
            className="cursor-pointer" onMouseEnter={() => setHover(p)} onClick={() => { if (p.boostable) onToggle(p.row); }} />;
        })}
      </svg>
      {hover && (() => {
        const r = hover.row, left = sx(hover.x), right = left > W / 2;
        return (
          <div className="pointer-events-none absolute z-10 max-w-[260px] rounded-xl border border-line bg-surface p-3 text-[12.5px] shadow-pop" style={{ left, top: Math.max(0, sy(hover.y) - 20), transform: right ? "translateX(calc(-100% - 14px))" : "translateX(14px)" }}>
            <p className="line-clamp-2 font-semibold text-ink">{r.title || `Video ${r.creativeId.slice(-8)}`}</p>
            <p className="text-ink-3">{r.creator ? `@${r.creator}` : ""}</p>
            <p className="mt-1.5 text-ink-2">{mode === "ads" ? `${rm(r.cost)} spent · ${r.orders} orders · ROI ${roiFmt(r.roi)}` : `${Math.round(r.views).toLocaleString("en-MY")} views · ${rm(r.organicGmv)} sales without ads`}</p>
            <p className="mt-1 font-medium text-brand-strong">{GROUP[r.group].label}</p>
            <p className="mt-1 text-[11.5px] text-ink-3">{hover.boostable ? (picked.has(r.key) ? "Click to remove from the batch" : "Click to add to the batch") : "Cannot be boosted now"}</p>
          </div>
        );
      })()}
    </div>
  );
}
