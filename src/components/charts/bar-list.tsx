import { cn } from "@/lib/utils";

export type BarItem = { label: string; value: number; sub?: string; display: string; highlight?: boolean };

/** Horizontal bars with the value printed – readable without hover, works for any magnitude measure. */
export function BarList({ items, color = "var(--brand)", emptyText = "No data" }: { items: BarItem[]; color?: string; emptyText?: string }) {
  const max = Math.max(1e-9, ...items.map((i) => i.value));
  if (!items.length) return <p className="py-6 text-center text-[13px] text-ink-3">{emptyText}</p>;
  return (
    <ul className="space-y-2.5">
      {items.map((i) => (
        <li key={i.label} className="grid grid-cols-[minmax(90px,150px)_1fr_auto] items-center gap-3 text-[13.5px]">
          <span className={cn("truncate text-ink-2", i.highlight && "font-semibold text-ink")} title={i.label}>{i.label}</span>
          <div className="h-2.5 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full" style={{ width: `${Math.max(2, (i.value / max) * 100)}%`, background: color, opacity: i.highlight ? 1 : 0.72 }} />
          </div>
          <span className="tnum text-right text-ink">
            <span className="font-medium">{i.display}</span>
            {i.sub && <span className="ml-1.5 text-[12px] text-ink-3">{i.sub}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}
