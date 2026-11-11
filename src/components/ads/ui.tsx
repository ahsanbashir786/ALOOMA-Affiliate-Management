import Link from "next/link";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Person } from "@/components/execution/ui";
import { cn } from "@/lib/utils";
import { GROUP, type GroupKey } from "@/lib/ads/groups";

// Small shared pieces of the GMV Max screens. No hooks, so they work in server and client components.

export const rm = (n: number) => `RM ${Math.round(n).toLocaleString("en-MY")}`;
export const rm2 = (n: number) => `RM ${n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const nfmt = (n: number) => n.toLocaleString("en-MY");
export const roiFmt = (n: number | null | undefined) => (n == null ? "–" : `${n.toFixed(1)}×`);
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const day = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return `${d} ${MON[m - 1]} ${y}`; };
export const dayShort = (iso: string) => { const [, m, d] = iso.split("-").map(Number); return `${d} ${MON[m - 1]}`; };

export function Delta({ now, before, neutral, label = "vs before" }: { now: number | null; before: number | null; neutral?: boolean; label?: string }) {
  if (now == null || before == null || before === 0) return <span className="text-[12.5px] text-ink-3">nothing to compare</span>;
  const p = ((now - before) / before) * 100;
  const Icon = p >= 0 ? ArrowUp : ArrowDown;
  return <span className={cn("inline-flex items-center gap-0.5 text-[12.5px] font-medium", Math.abs(p) < 0.5 || neutral ? "text-ink-3" : p > 0 ? "text-good" : "text-critical")}><Icon className="size-3.5" />{Math.abs(p).toFixed(0)}% {label}</span>;
}

export function Tile({ label, value, sub, testId }: { label: string; value: string; sub?: React.ReactNode; testId?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4" data-testid={testId}>
      <p className="text-[12.5px] text-ink-3">{label}</p>
      <p className="tnum mt-0.5 text-[24px] leading-tight font-semibold text-ink">{value}</p>
      {sub && <p className="mt-1">{sub}</p>}
    </div>
  );
}

const TONE: Record<string, string> = { good: "bg-good-soft text-good", brand: "bg-brand-soft text-brand-strong", warn: "bg-warn-soft text-warn", critical: "bg-critical-soft text-critical", muted: "bg-surface-2 text-ink-2" };
export function Pill({ tone = "muted", children, title, testId }: { tone?: keyof typeof TONE | string; children: React.ReactNode; title?: string; testId?: string }) {
  return <span title={title} data-testid={testId} className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-medium whitespace-nowrap", TONE[tone] ?? TONE.muted)}>{children}</span>;
}
export const GroupPill = ({ group }: { group: GroupKey }) => <Pill tone={GROUP[group].tone} title={GROUP[group].about} testId="ads-group">{GROUP[group].label}</Pill>;
export function StatusPill({ status, label }: { status: string | null; label: string | null }) {
  return <Pill tone={status === "DELIVERING" ? "good" : status === "LEARNING" || status === "IN_QUEUE" ? "brand" : status && /AUTHOR|REJECT|EXCLUD|UNAVAIL/.test(status) ? "critical" : "muted"} testId="ads-status">{label ?? "Not given"}</Pill>;
}

export function VideoCell({ v, link = true }: { v: { creativeId: string; title: string | null; creator: string | null; postedOn: string | null; why?: string }; link?: boolean }) {
  const title = v.title || `Video ${v.creativeId.slice(-8)}`;
  return (
    <div className="flex min-w-0 items-start gap-2.5">
      {v.creator ? <Person name={v.creator} size={30} /> : <span className="size-[30px] shrink-0 rounded-full bg-surface-2" />}
      <div className="min-w-0">
        {link ? <Link href={`/ads/video/${encodeURIComponent(v.creativeId)}`} className="block truncate font-medium text-ink hover:text-brand hover:underline" title={title}>{title}</Link> : <p className="truncate font-medium text-ink" title={title}>{title}</p>}
        <p className="truncate text-[12.5px] text-ink-3">{v.creator ? `@${v.creator}` : "Creator not known"}{v.postedOn ? ` · posted ${day(v.postedOn)}` : ""}</p>
        {v.why && <p className="mt-0.5 text-[12.5px] text-ink-2">{v.why}</p>}
      </div>
    </div>
  );
}

/** Two bars per day: spend (grey-blue) and sales (green). Pure SVG. */
export function SpendSalesBars({ series, height = 150 }: { series: { day: string; cost: number; revenue: number }[]; height?: number }) {
  const max = Math.max(1, ...series.map((s) => Math.max(s.cost, s.revenue)));
  const n = series.length, w = 100 / n;
  const total = series.reduce((a, s) => a + s.cost + s.revenue, 0);
  if (!total) return <p className="py-8 text-center text-[13.5px] text-ink-3">No spend or sales in these days.</p>;
  return (
    <div>
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }} role="img" aria-label="Ad spend and sales from ads, by day">
        {[0.25, 0.5, 0.75].map((g) => <line key={g} x1={0} x2={100} y1={height * g} y2={height * g} stroke="var(--line)" strokeWidth={1} vectorEffect="non-scaling-stroke" />)}
        {series.map((s, i) => {
          const hr = (s.revenue / max) * (height - 4), hc = (s.cost / max) * (height - 4);
          return (
            <g key={s.day}>
              <rect x={i * w + w * 0.12} width={w * 0.38} y={height - hr} height={hr} fill="var(--good)" opacity={0.85}><title>{`${day(s.day)} · sales ${rm(s.revenue)}`}</title></rect>
              <rect x={i * w + w * 0.5} width={w * 0.38} y={height - hc} height={hc} fill="var(--brand)" opacity={0.75}><title>{`${day(s.day)} · spend ${rm(s.cost)}`}</title></rect>
            </g>
          );
        })}
      </svg>
      <div className="mt-1.5 flex items-center justify-between text-[12px] text-ink-3">
        <span>{dayShort(series[0].day)}</span>
        <span className="flex items-center gap-3"><span className="inline-flex items-center gap-1"><i className="inline-block size-2.5 rounded-sm bg-good" />Sales From Ads</span><span className="inline-flex items-center gap-1"><i className="inline-block size-2.5 rounded-sm bg-brand" />Ad Spend</span></span>
        <span>{dayShort(series[n - 1].day)}</span>
      </div>
    </div>
  );
}

export function Empty({ title, children, action }: { title: string; children: React.ReactNode; action?: { href: string; label: string }; }) {
  return (
    <div className="grid place-items-center rounded-2xl border border-line bg-surface px-6 py-16 text-center" data-testid="ads-empty-state">
      <h2 className="text-[20px] font-semibold text-ink">{title}</h2>
      <p className="mt-1 max-w-md text-[14.5px] text-ink-3">{children}</p>
      {action && <Link href={action.href} className="mt-5 inline-flex h-10 items-center rounded-lg bg-brand px-5 text-[14.5px] font-medium text-white hover:opacity-90">{action.label}</Link>}
    </div>
  );
}

export const th = "py-2.5 pr-3 text-left text-[12px] font-semibold tracking-wide text-ink-3 uppercase";
export const thr = cn(th, "text-right");
export const td = "py-3 pr-3 align-top";
export const tdr = cn(td, "tnum text-right");
