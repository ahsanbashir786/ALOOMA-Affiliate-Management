"use client";

import { useLayoutEffect, useRef, useState } from "react";

/**
 * One small bar chart for every screen (single or stacked bars, values below zero allowed, hover box, optional legend).
 * Plain SVG: nothing extra to download, and it looks the same as the other charts in the app.
 */
export type BarSeries<T> = { key: string; name: string; color: string | ((row: T, i: number) => string); opacity?: (row: T, i: number) => number };

export function useWidth<E extends HTMLElement>(initial = 640) {
  const ref = useRef<E>(null);
  const [w, setW] = useState(initial);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const set = () => setW(Math.max(160, Math.round(el.getBoundingClientRect().width)));
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** Round axis steps (1, 2, 2.5, 5 × 10ⁿ) so the scale reads naturally. */
export function niceTicks(lo: number, hi: number, count = 4): number[] {
  if (hi === lo) hi = lo + 1;
  const raw = (hi - lo) / count, mag = 10 ** Math.floor(Math.log10(raw)), step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.floor(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6);
  if (out[out.length - 1] < hi) out.push(out[out.length - 1] + step);
  return out;
}

export function BarChart<T extends Record<string, unknown>>({ data, x, series, stacked, height = 240, yFmt = String, tip, legend, label, maxBar = 44, dashed, testId }: {
  data: T[]; x: (row: T) => string; series: BarSeries<T>[]; stacked?: boolean; height?: number; yFmt?: (v: number) => string;
  tip?: (row: T) => React.ReactNode; legend?: boolean; label: string; maxBar?: number; dashed?: boolean; testId?: string;
}) {
  const [box, W] = useWidth<HTMLDivElement>();
  const [hi, setHi] = useState<number | null>(null);
  const val = (r: T, k: string) => Number(r[k] ?? 0) || 0;
  const tops = data.map((r) => (stacked ? series.reduce((n, s) => n + Math.max(0, val(r, s.key)), 0) : Math.max(...series.map((s) => val(r, s.key)), 0)));
  const bots = data.map((r) => (stacked ? series.reduce((n, s) => n + Math.min(0, val(r, s.key)), 0) : Math.min(...series.map((s) => val(r, s.key)), 0)));
  const ticks = niceTicks(Math.min(0, ...bots), Math.max(0, ...tops, 1));
  const lo = ticks[0], top = ticks[ticks.length - 1];
  const L = 52, R = 8, T = 10, B = 26, pw = W - L - R, ph = height - T - B;
  const y = (v: number) => T + ph * (1 - (v - lo) / (top - lo || 1));
  const n = Math.max(1, data.length), slot = pw / n, bw = Math.min(maxBar, slot * 0.66);
  const every = Math.max(1, Math.ceil(64 / slot));
  const h = hi == null ? null : data[hi];
  return (
    <div className="w-full min-w-0" data-testid={testId}>
      <div ref={box} className="relative w-full min-w-0 overflow-hidden" onMouseLeave={() => setHi(null)}>
        <svg width="100%" height={height} viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" role="img" aria-label={label} className="block">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--line-strong)" : "var(--line)"} strokeDasharray={dashed && t !== 0 ? "3 3" : undefined} />
              <text x={L - 6} y={y(t) + 4} textAnchor="end" fontSize={11.5} fill="var(--ink-3)">{yFmt(t)}</text>
            </g>
          ))}
          {hi != null && <rect x={L + slot * hi} y={T} width={slot} height={ph} fill="var(--surface-2)" />}
          {data.map((r, i) => {
            const cx = L + slot * i + slot / 2;
            let up = 0, down = 0;
            const parts = series.map((s, k) => {
              const v = val(r, s.key);
              if (!v) return null;
              const base = stacked ? (v >= 0 ? up : down) : 0;
              if (stacked) { if (v >= 0) up += v; else down += v; }
              const y1 = y(base + v), y0 = y(base);
              const color = typeof s.color === "function" ? s.color(r, i) : s.color;
              return <rect key={k} x={cx - bw / 2} y={Math.min(y0, y1)} width={bw} height={Math.max(1, Math.abs(y0 - y1))} rx={2.5} fill={color} fillOpacity={s.opacity ? s.opacity(r, i) : 1} />;
            });
            return <g key={i}>{parts}{(i % every === 0 || i === n - 1) && <text x={cx} y={height - 8} textAnchor="middle" fontSize={11.5} fill="var(--ink-3)">{x(r)}</text>}</g>;
          })}
          {data.map((_, i) => <rect key={`h${i}`} x={L + slot * i} y={T} width={slot} height={ph} fill="transparent" onMouseEnter={() => setHi(i)} onMouseMove={() => setHi(i)} />)}
        </svg>
        {h && tip && (
          <div role="tooltip" className="pointer-events-none absolute top-2 z-10 w-max max-w-[260px] rounded-xl border border-line bg-surface px-3 py-2 text-[12.5px] shadow-lg"
            style={{ left: L + slot * hi! + slot / 2, transform: hi! > n / 2 ? "translateX(calc(-100% - 10px))" : "translateX(10px)" }}>
            <p className="font-semibold text-ink">{x(h)}</p>
            {tip(h)}
          </div>
        )}
      </div>
      {legend && (
        <ul className="mt-1.5 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[12.5px] text-ink-2">
          {series.map((s) => <li key={s.key} className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: typeof s.color === "string" ? s.color : "var(--brand)" }} />{s.name}</li>)}
        </ul>
      )}
    </div>
  );
}
