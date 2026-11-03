import { C, type ToneKey } from "./colors";

/** Weekday × week grid. Colour intensity = value; hovering shows the exact number. Good for spotting patterns and odd days. */
export function Heatmap({ rows, cols, cells, tone = "brand", unit }: { rows: string[]; cols: string[]; cells: (number | null)[][]; tone?: ToneKey; unit: string }) {
  const max = Math.max(1, ...cells.flat().map((v) => v ?? 0));
  return (
    <div className="overflow-x-auto">
      <div className="inline-grid gap-1" style={{ gridTemplateColumns: `auto repeat(${cols.length}, minmax(22px, 1fr))` }} role="img" aria-label={`Heatmap of ${unit}`}>
        <span />
        {cols.map((c) => <span key={c} className="text-center text-[11.5px] text-ink-3">{c}</span>)}
        {rows.map((r, ri) => (
          <div key={r} className="contents">
            <span className="pr-2 text-right text-[12.5px] leading-6 text-ink-3">{r}</span>
            {cols.map((c, ci) => {
              const v = cells[ri]?.[ci] ?? null;
              return <span key={c} title={v == null ? `${r}, week of ${c}: no data` : `${r}, week of ${c}: ${v} ${unit}`} className="h-6 rounded-[5px]" style={{ background: v == null ? "var(--surface-2)" : C[tone], opacity: v == null ? 1 : 0.12 + 0.88 * (v / max) }} />;
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
