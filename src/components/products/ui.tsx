import { AlertTriangle, CheckCircle2, TrendingDown, TrendingUp, Minus, Skull, CircleSlash } from "lucide-react";
import { BUCKETS, type Bucket, type Tag } from "@/lib/products/diagnose";
import { cn, fmtRM } from "@/lib/utils";

/** One colour per kind of sale, used by every Products chart so the screen reads as one system. */
export const BUCKET_COLOR: Record<Bucket, string> = { new: "var(--brand)", recent: "var(--s1)", old: "var(--s4)", veryold: "var(--s2)", live: "var(--s3)", other: "var(--line-strong)" };
export const bucketLabel = (b: Bucket) => BUCKETS.find((x) => x.key === b)!.label;
export const bucketHint = (b: Bucket) => BUCKETS.find((x) => x.key === b)!.hint;

const TAG: Record<Tag, { cls: string; Icon: typeof TrendingUp }> = {
  Growing: { cls: "bg-good-soft text-good", Icon: TrendingUp },
  Steady: { cls: "bg-brand-soft text-brand-strong", Icon: Minus },
  Slipping: { cls: "bg-warn-soft text-warn", Icon: TrendingDown },
  Dying: { cls: "bg-critical-soft text-critical", Icon: Skull },
  "No Sales": { cls: "bg-surface-2 text-ink-3", Icon: CircleSlash },
};
export function TagBadge({ tag, size = "md" }: { tag: Tag; size?: "md" | "lg" }) {
  const { cls, Icon } = TAG[tag];
  return <span data-testid="tag" data-tag={tag} className={cn("inline-flex items-center gap-1.5 rounded-full font-semibold whitespace-nowrap", size === "lg" ? "px-3.5 py-1.5 text-[15px]" : "px-2.5 py-1 text-[13px]", cls)}><Icon className={size === "lg" ? "size-4.5" : "size-3.5"} />{tag}</span>;
}

/** Fragile = most sales come from videos older than 30 days; Healthy = fresh content is carrying it. */
export function HealthChip({ fragile, oldPct }: { fragile: boolean | null; oldPct?: number | null }) {
  if (fragile == null) return null;
  return (
    <span data-testid="health" data-health={fragile ? "fragile" : "healthy"} title={oldPct != null ? `${Math.round(oldPct)}% of video and LIVE sales come from videos older than 30 days` : undefined}
      className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[12.5px] font-medium whitespace-nowrap", fragile ? "border-warn/40 text-warn" : "border-good/40 text-good")}>
      {fragile ? <AlertTriangle className="size-3.5" /> : <CheckCircle2 className="size-3.5" />}{fragile ? "Fragile" : "Healthy"}
    </span>
  );
}

/** "▲ 12% (+RM 1,200)": the change against the previous period. */
export function Delta({ now, prev, money = true, goodWhenUp = true, className }: { now: number; prev: number; money?: boolean; goodWhenUp?: boolean; className?: string }) {
  const diff = now - prev;
  if (prev <= 0 && now <= 0) return <span className={cn("text-[13px] text-ink-3", className)}>no change</span>;
  const pct = prev > 0 ? Math.round((diff / prev) * 100) : null;
  if (diff === 0) return <span className={cn("text-[13px] text-ink-3", className)}>no change</span>;
  const good = diff > 0 === goodWhenUp;
  const amount = money ? fmtRM(Math.abs(diff)) : Math.abs(diff).toLocaleString("en-MY");
  return <span className={cn("tnum text-[13px] font-semibold", good ? "text-good" : "text-critical", className)}>{diff > 0 ? "▲" : "▼"} {pct != null ? `${Math.abs(pct)}% ` : "new "}({diff > 0 ? "+" : "−"}{money ? "" : ""}{amount})</span>;
}

/** One stacked bar showing where the sales came from. */
export function MixBar({ b, height = 10, className }: { b: Record<Bucket, number>; height?: number; className?: string }) {
  const total = b.new + b.recent + b.old + b.veryold + b.live + b.other;
  return (
    <div className={cn("flex w-full overflow-hidden rounded-full bg-surface-2", className)} style={{ height }} role="img" aria-label="Where the sales came from">
      {total > 0 && (Object.keys(BUCKET_COLOR) as Bucket[]).map((k) => (b[k] > 0 ? <span key={k} title={`${bucketLabel(k)}: ${fmtRM(b[k])} (${Math.round((b[k] / total) * 100)}%)`} style={{ width: `${(b[k] / total) * 100}%`, background: BUCKET_COLOR[k] }} /> : null))}
    </div>
  );
}

export function Legend({ keys = ["new", "recent", "old", "veryold", "live", "other"] as Bucket[], className }: { keys?: Bucket[]; className?: string }) {
  return (
    <ul className={cn("flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-ink-3", className)}>
      {keys.map((k) => <li key={k} className="inline-flex items-center gap-1.5" title={bucketHint(k)}><span className="size-2.5 rounded-sm" style={{ background: BUCKET_COLOR[k] }} />{bucketLabel(k)}</li>)}
    </ul>
  );
}
