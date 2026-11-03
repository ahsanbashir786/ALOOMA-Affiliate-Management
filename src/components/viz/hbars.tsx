import { C, type ToneKey } from "./colors";

export type HBar = { label: string; value: number; display?: string; tone?: ToneKey; sub?: string };

/** Horizontal bars for rankings (reasons, couriers, products). The bar length is the value; the number is always printed. */
export function HBars({ items, max }: { items: HBar[]; max?: number }) {
  const m = max ?? Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="space-y-3">
      {items.map((i) => (
        <li key={i.label}>
          <div className="flex items-baseline justify-between gap-3 text-[14px]">
            <span className="min-w-0 truncate text-ink" title={i.label}>{i.label}</span>
            <span className="tnum shrink-0 font-semibold text-ink">{i.display ?? i.value}</span>
          </div>
          <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full" style={{ width: `${Math.max(2, (i.value / m) * 100)}%`, background: C[i.tone ?? "brand"] }} /></div>
          {i.sub && <p className="mt-0.5 text-[12.5px] text-ink-3">{i.sub}</p>}
        </li>
      ))}
    </ul>
  );
}
