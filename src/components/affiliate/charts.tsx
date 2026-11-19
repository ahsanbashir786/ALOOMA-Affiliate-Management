import Link from "next/link";
import { Sparkline } from "@/components/viz/sparkline";
import { BUCKET_COLOR, bucketLabel } from "@/components/products/ui";
import type { Bucket } from "@/lib/products/diagnose";
import type { Week } from "@/lib/affiliate/dashboard";
import { cn, fmtCompact } from "@/lib/utils";

const compact = (n: number) => fmtCompact(n);

/** A headline number with its change against the last period and a 12-week trend line. */
export function KpiCard({ label, value, now, before, values, money, testId }: { label: string; value: string; now: number; before: number; values: number[]; money?: boolean; testId?: string }) {
  const p = before > 0 ? (now - before) / before : null;
  const up = p != null && p > 0, flat = p == null || Math.abs(p) < 0.005;
  return (
    <div className="rounded-2xl border border-line bg-surface px-4 pt-3.5 pb-2.5" data-testid={testId}>
      <p className="text-[13px] font-medium text-ink-3">{label}</p>
      <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
        <span className="tnum text-[26px] leading-tight font-semibold tracking-tight text-ink">{value}</span>
        {!flat && <span className={cn("tnum text-[12.5px] font-semibold", up ? "text-good" : "text-critical")}>{up ? "▲" : "▼"} {Math.abs(Math.round(p! * 100))}%</span>}
        {flat && p != null && <span className="text-[12.5px] text-ink-3">no change</span>}
      </p>
      <p className="tnum text-[12px] text-ink-3">before: {money ? `RM ${compact(before)}` : Math.round(before).toLocaleString("en-MY")}</p>
      <div className="mt-1.5"><Sparkline values={values} tone={flat ? "brand" : up ? "good" : "critical"} label={`${label}, last 12 weeks`} /></div>
    </div>
  );
}

/** Weekly sales (area line) with new videos and LIVE sessions (bars) on the same weeks. The chosen dates are shaded. */
export function SalesVideosChart({ weeks, shaded }: { weeks: Week[]; shaded: number }) {
  const W = 900, H = 310, L = 58, R = 46, T = 26, B = 40;
  const pw = W - L - R, ph = H - T - B, n = weeks.length, slot = pw / n, bw = Math.min(34, slot * 0.5);
  const maxS = Math.max(...weeks.map((w) => w.sales), 1) * 1.1, maxV = Math.max(...weeks.map((w) => w.videos), 1);
  const cx = (i: number) => L + slot * i + slot / 2;
  const ys = (v: number) => T + ph * (1 - v / maxS);
  const yv = (v: number) => T + ph - (v / maxV) * ph * 0.38;
  const line = weeks.map((w, i) => `${i ? "L" : "M"}${cx(i).toFixed(1)},${ys(w.sales).toFixed(1)}`).join(" ");
  const area = `${line} L${cx(n - 1).toFixed(1)},${T + ph} L${cx(0).toFixed(1)},${T + ph} Z`;
  const grid = [0, 0.25, 0.5, 0.75, 1];
  const from = Math.max(0, n - Math.max(1, shaded));
  return (
    <figure className="w-full" data-testid="sales-videos-chart">
      <div className="mb-1 flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-ink-2">
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-5 rounded bg-brand" /> Sales each week (left scale)</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: "var(--s2)" }} /> New videos and LIVE sessions posted each week (right scale)</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-brand-soft ring-1 ring-brand/30" /> Your chosen dates</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Weekly sales and new videos posted">
        <rect x={L + slot * from} y={T} width={slot * (n - from)} height={ph} className="fill-brand-soft" opacity={0.7} rx={6} />
        {grid.map((g) => (
          <g key={g}>
            <line x1={L} x2={W - R} y1={T + ph * (1 - g)} y2={T + ph * (1 - g)} className="stroke-line" strokeWidth={1} strokeDasharray={g === 0 ? undefined : "3 4"} />
            <text x={L - 8} y={T + ph * (1 - g) + 4} textAnchor="end" className="fill-ink-3" fontSize={11}>{g === 0 ? "0" : `RM ${compact(maxS * g)}`}</text>
          </g>
        ))}
        {[0, 0.5, 1].map((g) => <text key={g} x={W - R + 8} y={yv(maxV * g) + 4} className="fill-ink-3" fontSize={11}>{Math.round(maxV * g)}</text>)}
        {weeks.map((w, i) => <rect key={w.start} x={cx(i) - bw / 2} y={yv(w.videos)} width={bw} height={Math.max(1, T + ph - yv(w.videos))} rx={4} style={{ fill: "var(--s2)" }} opacity={0.85}><title>{`${w.label}: ${w.videos} new videos and LIVE sessions`}</title></rect>)}
        <path d={area} className="fill-brand" opacity={0.12} />
        <path d={line} fill="none" className="stroke-brand" strokeWidth={2.6} strokeLinejoin="round" strokeLinecap="round" />
        {weeks.map((w, i) => <circle key={w.start} cx={cx(i)} cy={ys(w.sales)} r={3.4} className="fill-brand stroke-surface" strokeWidth={1.5}><title>{`${w.label}: RM ${Math.round(w.sales).toLocaleString("en-MY")} sales`}</title></circle>)}
        {weeks.map((w, i) => (i % 2 === (n - 1) % 2 ? <text key={w.start} x={cx(i)} y={H - 14} textAnchor="middle" className="fill-ink-3" fontSize={11}>{w.label}</text> : null))}
      </svg>
    </figure>
  );
}

/** Share of each week's sales by how old the video was when it sold. A growing "old" colour means sales lean on old videos. */
export function AgeStack({ weeks }: { weeks: Week[] }) {
  const W = 520, H = 250, L = 34, R = 8, T = 10, B = 30, pw = W - L - R, ph = H - T - B, n = weeks.length, slot = pw / n, bw = slot * 0.66;
  const order: Bucket[] = ["new", "recent", "old", "veryold", "live", "other"];
  const shown = order.filter((b) => weeks.some((w) => w.b[b] > 0));
  return (
    <figure data-testid="age-stack">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Share of weekly sales by video age">
        {[0, 0.5, 1].map((g) => <g key={g}><line x1={L} x2={W - R} y1={T + ph * (1 - g)} y2={T + ph * (1 - g)} className="stroke-line" strokeDasharray={g === 0 ? undefined : "3 4"} /><text x={L - 6} y={T + ph * (1 - g) + 4} textAnchor="end" className="fill-ink-3" fontSize={10.5}>{Math.round(g * 100)}%</text></g>)}
        {weeks.map((w, i) => {
          const tot = order.reduce((s, b) => s + w.b[b], 0);
          let y = T + ph;
          return (
            <g key={w.start}>
              {tot > 0 && order.map((b) => {
                const h = (w.b[b] / tot) * ph; y -= h;
                return h > 0 ? <rect key={b} x={L + slot * i + (slot - bw) / 2} y={y} width={bw} height={h} style={{ fill: BUCKET_COLOR[b] }}><title>{`${w.label} · ${bucketLabel(b)}: ${Math.round((w.b[b] / tot) * 100)}% (RM ${Math.round(w.b[b]).toLocaleString("en-MY")})`}</title></rect> : null;
              })}
              {i % 2 === (n - 1) % 2 && <text x={L + slot * i + slot / 2} y={H - 10} textAnchor="middle" className="fill-ink-3" fontSize={10.5}>{w.label}</text>}
            </g>
          );
        })}
      </svg>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-ink-2">{shown.map((b) => <li key={b} className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: BUCKET_COLOR[b] }} />{bucketLabel(b)}</li>)}</ul>
    </figure>
  );
}

export type FunnelRow = { key: string; label: string; count: number | null; href: string; sub: string; tone: "brand" | "warn" | "critical" | "good" | "neutral"; help: string };
const BAR: Record<FunnelRow["tone"], string> = { brand: "var(--brand)", warn: "var(--warn)", critical: "var(--critical)", good: "var(--good)", neutral: "var(--ink-3)" };

/** Creators by stage, from suggested to star. Bar length uses a square root so small stages stay visible. */
export function Funnel({ rows }: { rows: FunnelRow[] }) {
  const max = Math.max(...rows.map((r) => r.count ?? 0), 1);
  return (
    <ul className="space-y-0.5" data-testid="funnel">
      {rows.map((r) => (
        <li key={r.key}>
          <Link href={r.href} title={r.help} data-stage={r.key} className="group grid grid-cols-[190px_1fr_56px] items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-surface-2">
            <span className="min-w-0"><span className="block truncate text-[13px] font-medium text-ink">{r.label}</span><span className="block truncate text-[11.5px] text-ink-3">{r.sub || "\u00a0"}</span></span>
            <span className="h-3.5 rounded-full bg-surface-2 group-hover:bg-surface">
              <span className="block h-full rounded-full" style={{ width: `${r.count == null ? 0 : Math.max(2.5, Math.sqrt(r.count / max) * 100)}%`, background: BAR[r.tone], opacity: 0.9 }} />
            </span>
            <span className="tnum text-right text-[14px] font-semibold text-ink">{r.count == null ? "–" : r.count.toLocaleString("en-MY")}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
