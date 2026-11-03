import Link from "next/link";
import { Sparkline } from "./sparkline";
import { C, type ToneKey } from "./colors";
import { cn } from "@/lib/utils";

/** One headline number with its trend. The delta is a plain comparison with the previous equal period (null = not comparable). */
export function StatTile({ label, value, sub, delta, goodWhenUp = true, spark, tone = "brand", href }: { label: string; value: string; sub?: string; delta?: number | null; goodWhenUp?: boolean; spark?: number[]; tone?: ToneKey; href?: string }) {
  const up = (delta ?? 0) > 0;
  const good = delta == null || delta === 0 ? null : up === goodWhenUp;
  const body = (
    <div className="rounded-2xl border border-line bg-surface p-5 transition-colors hover:bg-surface-2">
      <p className="text-[14px] font-medium text-ink-3">{label}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <p className="tnum text-[30px] font-semibold leading-tight tracking-tight text-ink">{value}</p>
        {delta != null && delta !== 0 && (
          <span className={cn("tnum text-[13.5px] font-semibold", good ? "text-good" : "text-critical")} style={{ color: good ? C.good : C.critical }}>{up ? "▲" : "▼"} {Math.abs(Math.round(delta))}%</span>
        )}
      </div>
      {sub && <p className="text-[13px] text-ink-3">{sub}</p>}
      {spark && spark.length > 1 && <div className="mt-3"><Sparkline values={spark} tone={tone} label={`${label} trend`} /></div>}
    </div>
  );
  return href ? <Link href={href} className="block">{body}</Link> : body;
}
