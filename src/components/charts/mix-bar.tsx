import { fmtPct, fmtRM } from "@/lib/utils";
import { Delta } from "@/components/ui/delta";

export type MixItem = { key: string; label: string; color: string; value: number; prev?: number };

/** Single 100% bar + a legend table with value, share and change. */
export function MixBar({ items }: { items: MixItem[] }) {
  const total = items.reduce((a, i) => a + i.value, 0);
  const shown = items.filter((i) => i.value > 0);
  return (
    <div>
      <div
        className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full"
        role="img"
        aria-label={shown.map((i) => `${i.label} ${fmtPct(i.value / total, 0)}`).join(", ")}
      >
        {shown.map((i) => (
          <div key={i.key} style={{ width: `${(i.value / total) * 100}%`, background: i.color }} />
        ))}
      </div>
      <ul className="mt-4 divide-y divide-line">
        {items.map((i) => (
          <li key={i.key} className="flex items-center gap-3 py-2.5 text-[13.5px]">
            <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: i.color }} />
            <span className="min-w-0 flex-1 text-ink">{i.label}</span>
            <span className="tnum w-10 shrink-0 text-right text-ink-3">{total ? fmtPct(i.value / total, 0) : "–"}</span>
            <span className="tnum w-24 shrink-0 text-right font-medium whitespace-nowrap text-ink">{fmtRM(i.value)}</span>
            <span className="hidden w-16 justify-end sm:flex">
              {i.prev != null && (i.prev > 0 || i.value > 0) ? (
                <Delta value={i.prev > 0 ? (i.value - i.prev) / i.prev : null} />
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
