import { C, type ToneKey } from "./colors";

/** Tiny trend line with an area fill and a dot on the latest value. Pure SVG – renders on the server. */
export function Sparkline({ values, tone = "brand", height = 36, label }: { values: number[]; tone?: ToneKey; height?: number; label?: string }) {
  const w = 120;
  const pad = 3;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const pts = values.map((v, i) => [pad + (i / Math.max(1, values.length - 1)) * (w - pad * 2), height - pad - ((v - min) / span) * (height - pad * 2)] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${pts[pts.length - 1]?.[0] ?? w},${height} L${pts[0]?.[0] ?? 0},${height} Z`;
  const last = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="h-9 w-full" role="img" aria-label={label ?? "Trend"} preserveAspectRatio="none">
      {pts.length > 1 && <path d={area} fill={C[tone]} opacity={0.12} />}
      {pts.length > 1 && <path d={line} fill="none" stroke={C[tone]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
      {last && <circle cx={last[0]} cy={last[1]} r={3} fill={C[tone]} />}
    </svg>
  );
}
