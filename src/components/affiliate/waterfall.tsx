export type Step = { label: string; effect: number; detail?: string };

const rm = (n: number) => `RM ${Math.round(Math.abs(n)).toLocaleString("en-MY")}`;
const compact = (n: number) => (Math.abs(n) >= 1000 ? `${(Math.abs(n) / 1000).toFixed(Math.abs(n) >= 10000 ? 0 : 1)}k` : String(Math.round(Math.abs(n))));

/**
 * A waterfall: last period's sales, the three things that changed them, and this period's sales.
 * Each step starts where the one before ended, so the eye follows the money. The scale does not start at zero (said under the chart), so small changes stay visible.
 */
export function Waterfall({ startLabel, endLabel, start, end, steps }: { startLabel: string; endLabel: string; start: number; end: number; steps: Step[] }) {
  const W = 880, H = 300, L = 12, R = 12, T = 34, B = 62;
  const cols = steps.length + 2, slot = (W - L - R) / cols, bw = Math.min(110, slot * 0.62);
  // running totals
  const tops: { y0: number; y1: number }[] = [];
  let run = start;
  for (const s of steps) { tops.push({ y0: run, y1: run + s.effect }); run += s.effect; }
  const all = [start, end, ...tops.flatMap((t) => [t.y0, t.y1])];
  const lo = Math.min(...all), hi = Math.max(...all), span = Math.max(hi - lo, hi * 0.05, 1);
  const min = Math.max(0, lo - span * 0.55), max = hi + span * 0.2;
  const Y = (v: number) => T + (H - T - B) * (1 - (v - min) / (max - min));
  const x = (i: number) => L + slot * i + (slot - bw) / 2;
  const baseY = H - B;

  const total = (i: number, v: number, label: string) => (
    <g key={label}>
      <rect x={x(i)} y={Y(v)} width={bw} height={Math.max(1, baseY - Y(v))} rx={6} fill="var(--brand)" opacity={0.9} />
      <text x={x(i) + bw / 2} y={Y(v) - 9} textAnchor="middle" className="fill-ink" fontSize={14} fontWeight={700}>{rm(v)}</text>
      <text x={x(i) + bw / 2} y={baseY + 22} textAnchor="middle" className="fill-ink-2" fontSize={13} fontWeight={600}>{label}</text>
    </g>
  );

  return (
    <figure className="w-full" data-testid="waterfall">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Sales went from ${rm(start)} to ${rm(end)}. ${steps.map((s) => `${s.label} ${s.effect >= 0 ? "added" : "lost"} ${rm(s.effect)}`).join(". ")}.`} className="h-auto w-full">
        <line x1={L} x2={W - R} y1={baseY} y2={baseY} className="stroke-line" strokeWidth={1} />
        {total(0, start, startLabel)}
        {steps.map((s, i) => {
          const c = i + 1, t = tops[i], up = s.effect >= 0;
          const yTop = Y(Math.max(t.y0, t.y1)), yBot = Y(Math.min(t.y0, t.y1));
          return (
            <g key={s.label}>
              {/* connector from the previous bar */}
              <line x1={x(c - 1) + bw} x2={x(c)} y1={Y(t.y0)} y2={Y(t.y0)} className="stroke-ink-3" strokeWidth={1} strokeDasharray="3 3" />
              <rect x={x(c)} y={yTop} width={bw} height={Math.max(3, yBot - yTop)} rx={6} fill={up ? "var(--good)" : "var(--critical)"} opacity={0.85} />
              <text x={x(c) + bw / 2} y={yTop - 9} textAnchor="middle" fontSize={14} fontWeight={700} fill={up ? "var(--good)" : "var(--critical)"}>{up ? "+" : "−"}{compact(s.effect)}</text>
              <text x={x(c) + bw / 2} y={baseY + 22} textAnchor="middle" className="fill-ink-2" fontSize={13} fontWeight={600}>{s.label}</text>
              {s.detail && <text x={x(c) + bw / 2} y={baseY + 40} textAnchor="middle" className="fill-ink-3" fontSize={11.5}>{s.detail}</text>}
            </g>
          );
        })}
        <line x1={x(cols - 2) + bw} x2={x(cols - 1)} y1={Y(run)} y2={Y(run)} className="stroke-ink-3" strokeWidth={1} strokeDasharray="3 3" />
        {total(cols - 1, end, endLabel)}
      </svg>
    </figure>
  );
}
