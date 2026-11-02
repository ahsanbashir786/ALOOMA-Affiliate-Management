import { Card } from "./primitives";
import { Delta } from "./delta";

export function KpiCard({
  label,
  value,
  delta,
  invert,
  sub,
  hint,
}: {
  label: string;
  value: string;
  delta?: number | null;
  invert?: boolean;
  sub?: string;
  hint?: string;
}) {
  return (
    <Card className="px-5 py-4" title={hint}>
      <p className="text-[13px] font-medium text-ink-2">{label}</p>
      <p className="tnum mt-2 text-[24px] leading-none whitespace-nowrap sm:text-[28px] font-semibold tracking-tight text-ink">{value}</p>
      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-ink-3">
        {delta !== undefined && <Delta value={delta} invert={invert} />}
        {sub && <span className="tnum">{sub}</span>}
      </div>
    </Card>
  );
}
