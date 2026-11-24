import Link from "next/link";
import { cn } from "@/lib/utils";
import { Sparkline } from "@/components/viz/sparkline";
import { InfoTip } from "./info-tip";

const TONES = { brand: "bg-brand-soft text-brand", good: "bg-good-soft text-good", warn: "bg-warn-soft text-warn", critical: "bg-critical-soft text-critical", neutral: "bg-surface-2 text-ink-2" } as const;
export type Tone = keyof typeof TONES;

/** ▲ 12% in green or ▼ 5% in red, from two numbers. `good` says which way is good. */
export function ChangePill({ now, before, good = "up", unit = "", showAbs }: { now: number; before: number | null | undefined; good?: "up" | "down" | "neutral"; unit?: string; showAbs?: boolean }) {
  if (before == null) return null;
  const abs = now - before;
  if (Math.abs(abs) < 1e-9) return <span className="text-[12px] text-ink-3">no change</span>;
  const pct = before > 0 ? Math.round((abs / before) * 100) : null;
  const up = abs > 0;
  const tone = good === "neutral" ? "bg-surface-2 text-ink-2" : up === (good === "up") ? "bg-good-soft text-good" : "bg-critical-soft text-critical";
  const n = Math.abs(abs) >= 10000 ? `${(Math.abs(abs) / 1000).toFixed(1)}k` : Math.round(Math.abs(abs)).toLocaleString("en-MY");
  return (
    <span className={cn("tnum inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11.5px] font-semibold", tone)}>
      {up ? "▲" : "▼"} {pct != null ? `${Math.abs(pct)}%` : `${unit}${n}`}{showAbs && pct != null ? ` (${up ? "+" : "−"}${unit}${n})` : ""}
    </span>
  );
}

/**
 * One headline number: an icon, a short label, the number, an optional ▲▼ change and a tiny trend line.
 * Anything longer than a few words goes behind the ⓘ, so the tile reads at a glance. The same tile on every screen.
 */
export function StatTile({ icon: Icon, label, value, note, tone = "brand", className, change, href, spark, sparkTone, testId, valueTone }: {
  icon: React.ComponentType<{ className?: string }>; label: string; value: React.ReactNode; note?: React.ReactNode; tone?: Tone; className?: string;
  change?: React.ReactNode; href?: string; spark?: number[]; sparkTone?: "good" | "critical" | "brand" | "warn"; testId?: string; valueTone?: "good" | "warn" | "critical";
}) {
  const short = typeof note === "string" && note.length <= 34;
  const body = (
    <>
      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", TONES[tone])}><Icon className="size-5" /></span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1 text-[13px] font-medium text-ink-3">{label}{note && !short && <InfoTip label={`About ${label}`}>{note}</InfoTip>}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className={cn("tnum text-[24px] leading-7 font-semibold tracking-tight", valueTone === "good" ? "text-good" : valueTone === "warn" ? "text-warn" : valueTone === "critical" ? "text-critical" : "text-ink")}>{value}</span>
          {change}
        </p>
        {note && short && <p className="mt-0.5 line-clamp-2 text-[12px] text-ink-3">{note}</p>}
        {spark && spark.length > 1 && <div className="mt-1.5"><Sparkline values={spark} tone={sparkTone ?? "brand"} label={`${label}, trend`} /></div>}
      </div>
    </>
  );
  const cls = cn("flex items-start gap-3 rounded-2xl border border-line bg-surface p-4 shadow-xs", href && "transition-colors hover:border-line-strong hover:bg-surface-2", className);
  return href ? <Link href={href} className={cls} data-testid={testId}>{body}</Link> : <div className={cls} data-testid={testId}>{body}</div>;
}
