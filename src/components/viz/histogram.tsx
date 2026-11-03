import { C, type ToneKey } from "./colors";

/** Distribution as bars (e.g. days from delivery to posting). Pure SVG, with the exact count in each bar's tooltip. */
export function Histogram({ bins, tone = "brand", xLabel }: { bins: { label: string; value: number }[]; tone?: ToneKey; xLabel?: string }) {
  const max = Math.max(1, ...bins.map((b) => b.value));
  return (
    <figure>
      <div className="flex h-32 items-end gap-1.5" role="img" aria-label={xLabel ?? "Distribution"}>
        {bins.map((b) => (
          <div key={b.label} className="flex h-full flex-1 flex-col items-center justify-end" title={`${b.label}: ${b.value}`}>
            <span className="tnum mb-1 text-[12px] text-ink-3">{b.value || ""}</span>
            <span className="w-full rounded-t" style={{ height: `${Math.max(b.value ? 6 : 2, (b.value / max) * 100)}%`, background: C[tone], opacity: b.value ? 1 : 0.2 }} />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1.5">{bins.map((b) => <span key={b.label} className="flex-1 text-center text-[11.5px] text-ink-3">{b.label}</span>)}</div>
      {xLabel && <figcaption className="mt-1 text-center text-[12.5px] text-ink-3">{xLabel}</figcaption>}
    </figure>
  );
}
