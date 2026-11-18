import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Users } from "lucide-react";
import { gate } from "@/lib/gate";
import { hasSyncedData } from "@/lib/creators/load";
import { syncFreshness } from "@/lib/creators/meta";
import { loadCommand } from "@/lib/affiliate/command";
import { STAGES, type StageKey } from "@/lib/affiliate/stages";
import { fmtDayLabel } from "@/lib/time";
import { Badge, buttonClasses, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/primitives";
import { TargetForm } from "@/components/affiliate/target-form";
import { cn, fmtCompact, fmtRM } from "@/lib/utils";

export const metadata: Metadata = { title: "Affiliate Command" };

const pctChange = (now: number, before: number) => (before > 0 ? Math.round((now / before - 1) * 100) : null);
const sign = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "");
const TONE: Record<StageKey, "neutral" | "brand" | "warn" | "good" | "critical"> = { found: "neutral", requested: "brand", way: "neutral", notposted: "critical", nosale: "warn", selling: "good", star: "good", quiet: "warn" };

function Lever({ label, now, before, fmt, help }: { label: string; now: number; before: number; fmt: (n: number) => string; help: string }) {
  const p = pctChange(now, before);
  return (
    <div className="rounded-2xl border border-line bg-surface px-4 py-3.5" title={help}>
      <p className="text-[13px] font-medium text-ink-3">{label}</p>
      <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
        <span className="tnum text-[26px] leading-tight font-semibold tracking-tight text-ink">{fmt(now)}</span>
        {p != null && p !== 0 && <span className={cn("tnum text-[12.5px] font-semibold", p > 0 ? "text-good" : "text-critical")}>{p > 0 ? "▲" : "▼"} {Math.abs(p)}%</span>}
      </p>
      <p className="text-[12.5px] text-ink-3">before: {fmt(before)}</p>
    </div>
  );
}

export default async function CommandPage() {
  const { user, denied } = await gate("creators", "Affiliate Command");
  if (denied) return denied;
  if (!(await hasSyncedData())) {
    return (
      <div className="space-y-6">
        <PageHeader title="Affiliate Command" />
        <Card><EmptyState icon={<Users className="size-5" />} title="No TikTok data yet" description="Connect TikTok Shop and run Data Sync. This screen fills in as soon as the first orders arrive." action={<Link href="/sync" className={buttonClasses({ variant: "primary" })}>Open Data Sync</Link>} /></Card>
      </div>
    );
  }
  const [c, fresh] = await Promise.all([loadCommand(), syncFreshness()]);
  if (!c) return null;
  const { now, before } = c.levers;
  const goal = c.target.value;
  const done = goal > 0 ? Math.min(100, Math.round((now.sales / goal) * 100)) : 0;
  const gap = goal - now.sales;
  const max = Math.max(1, ...(c.change?.effects.map((e) => Math.abs(e.effect)) ?? [1]));
  const canEdit = !user.readOnly;
  const stage = new Map(c.stages.map((s) => [s.key, s]));
  const g = c.guard;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Affiliate Command"
        description={`Affiliate sales are three things multiplied: creators who sell × posts per seller × sales per post. This screen shows which one moved sales, where creators are stuck, and where samples are not turning into sales. Periods are 28 days ending ${fmtDayLabel(c.ref)}, against the 28 days before.`}
        actions={<span className="inline-flex items-center gap-2 text-[13px] text-ink-3"><span className={cn("size-2 rounded-full", fresh.ok ? "bg-good" : "bg-warn")} />{fresh.label} from TikTok Shop</span>}
      />

      <Card data-testid="goal">
        <div className="px-5 py-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[13px] font-medium text-ink-3">Affiliate Sales, Last 28 Days</p>
              <p className="tnum mt-0.5 text-[30px] leading-tight font-semibold tracking-tight text-ink">{fmtRM(now.sales)}</p>
            </div>
            <div className="text-right">
              <p className="text-[13px] font-medium text-ink-3">28-Day Goal · {c.target.basis}</p>
              <p className="tnum text-[18px] font-semibold text-ink">{fmtRM(goal)}</p>
              <TargetForm current={goal} custom={c.target.custom} canEdit={canEdit} />
            </div>
          </div>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-surface-2"><div className={cn("h-full rounded-full", done >= 100 ? "bg-good" : "bg-brand")} style={{ width: `${done}%` }} /></div>
          <p className="mt-2 text-[13px] text-ink-2">{gap > 0 ? <><b>{fmtRM(gap)}</b> short of the goal ({done}% reached).</> : <>Goal reached: <b>{fmtRM(-gap)}</b> above it.</>}{before.sales > 0 && <> Last period: {fmtRM(before.sales)}.</>}</p>
        </div>
      </Card>

      <section aria-label="What moved sales" className="space-y-3">
        <h2 className="flex items-center gap-1.5 text-[15px] font-semibold text-ink">What Moved Sales</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" data-testid="levers">
          <Lever label="Creators Who Sell" now={now.sellers} before={before.sellers} fmt={(n) => n.toLocaleString("en-MY")} help="Creators with sales in the 28 days." />
          <Lever label="Posts Per Seller" now={now.sellers ? now.posts / now.sellers : 0} before={before.sellers ? before.posts / before.sellers : 0} fmt={(n) => n.toFixed(1)} help="Videos and LIVE sessions posted in the 28 days by each creator who sold." />
          <Lever label="Sales Per Post" now={now.posts ? now.sales / now.posts : 0} before={before.posts ? before.sales / before.posts : 0} fmt={(n) => fmtRM(n)} help="Sales divided by posts: how well each video or LIVE sells." />
        </div>
        <Card>
          <CardHeader title="Which Lever Changed Sales" description="The change in sales, split between the three levers. The three bars add up to the total change. Sales from older videos count in 'Sales Per Post'." />
          <div className="px-5 pb-5">
            {c.change ? (
              <>
                <ul className="space-y-2.5" data-testid="waterfall">
                  {c.change.effects.map((e) => (
                    <li key={e.key} className="grid grid-cols-[150px_1fr_110px] items-center gap-3 text-[13.5px]">
                      <span className="text-ink-2">{e.label}</span>
                      <span className="relative h-5 rounded bg-surface-2"><span className={cn("absolute top-0 h-full rounded", e.effect >= 0 ? "bg-good/70" : "bg-critical/70")} style={{ width: `${(Math.abs(e.effect) / max) * 50}%`, [e.effect >= 0 ? "left" : "right"]: "50%" }} /><span className="absolute inset-y-0 left-1/2 w-px bg-line" /></span>
                      <span className={cn("tnum text-right font-semibold", e.effect >= 0 ? "text-good" : "text-critical")}>{sign(e.effect)}RM {Math.abs(Math.round(e.effect)).toLocaleString("en-MY")}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 border-t border-line pt-3 text-[13.5px] text-ink-2">Total change: <b className={c.change.total >= 0 ? "text-good" : "text-critical"}>{sign(c.change.total)}RM {Math.abs(Math.round(c.change.total)).toLocaleString("en-MY")}</b>. Biggest mover: <b>{[...c.change.effects].sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect))[0].label}</b>.</p>
              </>
            ) : <p className="text-[13.5px] text-ink-3">Not enough earlier data to compare yet.</p>}
          </div>
        </Card>
      </section>

      <Card data-testid="guard" className={cn(g.high && "border-warn/60")}>
        <CardHeader title="Sample Guard" description="Samples already sent that have not turned into sales. Fix these before paying for new creators: the shipping and product are already spent. Counts are creator-and-product pairs." action={g.high ? <Badge tone="warn">Fix Old Samples First</Badge> : <Badge tone="good">Healthy</Badge>} />
        <div className="grid grid-cols-2 gap-3 px-5 pb-5 lg:grid-cols-4">
          {[
            { n: g.notPosted, label: "Delivered, Not Posted", stage: "notposted" },
            { n: g.noSale, label: "Posted, No Sale", stage: "nosale" },
            { n: g.soldThenQuiet, label: "Sold Once, Then Quiet", stage: "quiet" },
            { n: g.requestsWaiting, label: "Requests Waiting For You", stage: "requested" },
          ].map((x) => (
            <Link key={x.label} href={`/affiliate/lifecycle?stage=${x.stage}`} className="rounded-xl border border-line px-3.5 py-3 transition-colors hover:bg-surface-2">
              <p className="tnum text-[22px] font-semibold text-ink">{x.n.toLocaleString("en-MY")}</p>
              <p className="text-[12.5px] text-ink-3">{x.label}</p>
            </Link>
          ))}
        </div>
        <p className="px-5 pb-4 text-[13px] text-ink-3">{g.creators.toLocaleString("en-MY")} creators hold samples that have not sold yet.</p>
      </Card>

      <section aria-label="Creator journey" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-ink">Creator Journey</h2>
          <Link href="/affiliate/lifecycle" className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand hover:underline">Open Lifecycle <ArrowRight className="size-3.5" /></Link>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="journey">
          {STAGES.map((s) => {
            const x = stage.get(s.key)!;
            return (
              <Link key={s.key} href={`/affiliate/lifecycle?stage=${s.key}`} title={s.help} className="rounded-2xl border border-line bg-surface px-4 py-3.5 transition-colors hover:bg-surface-2">
                <div className="flex items-center justify-between gap-2"><p className="text-[13px] font-medium text-ink-3">{s.label}</p><Badge tone={TONE[s.key]}>{x.creators.toLocaleString("en-MY")}</Badge></div>
                <p className="tnum mt-1 text-[18px] font-semibold text-ink">{x.sales28 > 0 ? `RM ${fmtCompact(x.sales28)}` : "–"}</p>
                <p className="text-[12.5px] text-ink-3">{x.avgDays != null ? `${x.avgDays} days on average in this stage` : "sales, 28 days"}</p>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
