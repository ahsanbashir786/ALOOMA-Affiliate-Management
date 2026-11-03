import Link from "next/link";
import { C, type ToneKey } from "./colors";

export type FunnelStage = { label: string; value: number; href?: string; tone?: ToneKey };

/** Stages narrowing left to right, with the conversion from the previous stage. Each stage can link to its records. */
export function Funnel({ stages }: { stages: FunnelStage[] }) {
  const max = Math.max(1, ...stages.map((s) => s.value));
  return (
    <ol className="space-y-3" aria-label="Funnel">
      {stages.map((s, i) => {
        const prev = i ? stages[i - 1].value : null;
        const conv = prev ? Math.round((s.value / prev) * 100) : null;
        const bar = (
          <div className="flex items-center gap-3">
            <span className="w-28 shrink-0 text-[14px] text-ink-2 sm:w-36">{s.label}</span>
            <div className="h-7 flex-1 rounded-md bg-surface-2">
              <div className="flex h-full items-center rounded-md px-2 text-[13px] font-semibold text-white" style={{ width: `${Math.max(4, (s.value / max) * 100)}%`, background: C[s.tone ?? "brand"] }}>
                <span className="tnum">{s.value}</span>
              </div>
            </div>
            <span className="tnum w-12 shrink-0 text-right text-[13px] text-ink-3">{conv == null ? "" : `${conv}%`}</span>
          </div>
        );
        return <li key={s.label}>{s.href ? <Link href={s.href} className="block rounded-md hover:bg-surface-2">{bar}</Link> : bar}</li>;
      })}
    </ol>
  );
}
