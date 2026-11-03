import { C, type ToneKey } from "./colors";

/** Ring gauge for a 0–100 value (or "–" when unknown). The tone is chosen by the caller from real thresholds. */
export function Gauge({ value, tone = "brand", label, sub, size = 132 }: { value: number | null; tone?: ToneKey; label: string; sub?: string; size?: number }) {
  const r = 52;
  const circ = 2 * Math.PI * r;
  const v = value == null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <figure className="flex flex-col items-center text-center">
      <svg viewBox="0 0 132 132" width={size} height={size} role="img" aria-label={`${label}: ${value == null ? "not available" : `${Math.round(v)} percent`}`}>
        <circle cx="66" cy="66" r={r} fill="none" stroke="var(--line)" strokeWidth="12" />
        {value != null && v >= 1 && <circle cx="66" cy="66" r={r} fill="none" stroke={C[tone]} strokeWidth="12" strokeLinecap="round" strokeDasharray={`${(v / 100) * circ} ${circ}`} transform="rotate(-90 66 66)" />}
        <text x="66" y="72" textAnchor="middle" className="fill-[var(--ink)]" style={{ font: "600 26px var(--font-sans, system-ui)" }}>{value == null ? "–" : `${Math.round(v)}%`}</text>
      </svg>
      <figcaption className="mt-1 text-[14.5px] font-medium text-ink">{label}</figcaption>
      {sub && <span className="text-[13px] text-ink-3">{sub}</span>}
    </figure>
  );
}
