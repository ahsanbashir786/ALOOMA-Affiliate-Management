import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Users } from "lucide-react";
import { gate } from "@/lib/gate";
import { hasSyncedData } from "@/lib/creators/load";
import { getSuggestedHint, loadCommand } from "@/lib/affiliate/command";
import { parseRange } from "@/lib/creators/params";
import { type StageKey } from "@/lib/affiliate/stages";
import { fmtDayLabel, todayKL } from "@/lib/time";
import { one, type SP } from "@/lib/url";
import { Badge, buttonClasses, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/primitives";
import { TargetForm } from "@/components/affiliate/target-form";
import { Waterfall } from "@/components/affiliate/waterfall";
import { DatesPicker } from "@/components/ui/range-picker";
import { cn, fmtCompact, fmtRM } from "@/lib/utils";

export const metadata: Metadata = { title: "Affiliate Command" };

const pctChange = (now: number, before: number) => (before > 0 ? Math.round((now / before - 1) * 100) : null);
const sign = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "");
const TONE: Record<StageKey | "suggested", "neutral" | "brand" | "warn" | "good" | "critical"> = { suggested: "brand", found: "neutral", requested: "brand", way: "neutral", notposted: "critical", nosale: "warn", selling: "good", star: "good", quiet: "warn" };

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

export default async function CommandPage({ searchParams }: { searchParams: Promise<SP> }) {
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
  const sp = Object.fromEntries(Object.entries(await searchParams).map(([k, v]) => [k, one(v)]));
  const range = parseRange(sp);
  const [c, hint] = await Promise.all([loadCommand(range), getSuggestedHint()]);
  if (!c) return null;
  const { now, before } = c.levers;
  const goal = c.target.value;
  const done = goal > 0 ? Math.min(100, Math.round((now.sales / goal) * 100)) : 0;
  const gap = goal - now.sales;
  const canEdit = !user.readOnly;
  const stage = new Map(c.stages.map((s) => [s.key, s]));
  const g = c.guard;
  const n = (k: StageKey) => stage.get(k)!;
  const days = (k: StageKey) => (n(k).avgDays != null ? `${n(k).avgDays} days on average since the sample` : "");
  const journey: { key: StageKey | "suggested"; label: string; count: number | null; href: string; help: string; big?: string; sub: string }[] = [
    { key: "suggested", label: "Suggested To Invite", count: hint ? hint.eligible : null, href: "/affiliate/outreach", help: "New creators from TikTok's Creator Marketplace that meet your rules (level 5 or higher, your categories), including creators who never asked for a sample.", sub: hint ? `meet your rules${hint.own ? ` · plus ${hint.own} of your own for more samples` : ""}` : "Open Outreach to load TikTok's list" },
    { key: "requested", label: "Sample Requested", count: n("requested").creators, href: "/affiliate/outreach?stage=requested", help: "Asked for a sample and waiting for your decision.", sub: "waiting for your decision" },
    { key: "way", label: "Sample On The Way", count: n("way").creators, href: "/affiliate/outreach?stage=shipped", help: "Approved and not delivered yet.", sub: n("way").avgDays != null ? `${n("way").avgDays} days on average since it was sent` : "on the way" },
    { key: "notposted", label: "Delivered, Not Posted", count: n("notposted").creators, href: "/creators?stage=notposted", help: "The sample arrived, the posting window passed, nothing posted and no sales.", sub: days("notposted") || "nothing posted yet" },
    { key: "nosale", label: "Posted, No Sale", count: n("nosale").creators, href: "/creators?stage=nosale", help: "Posted for the sample but no sales yet.", sub: days("nosale") || "no sales yet" },
    { key: "selling", label: "Selling", count: n("selling").creators, href: "/creators?stage=selling", help: "Sold in the last 28 days.", big: n("selling").sales28 > 0 ? `RM ${fmtCompact(n("selling").sales28)}` : undefined, sub: "sales in the last 28 days" },
    { key: "star", label: "Star", count: n("star").creators, href: "/creators?stage=star", help: "Among the top sellers of the last 28 days.", big: n("star").sales28 > 0 ? `RM ${fmtCompact(n("star").sales28)}` : undefined, sub: "sales in the last 28 days" },
    { key: "quiet", label: "Went Quiet", count: n("quiet").creators, href: "/creators?stage=quiet", help: "Sold before, nothing in the last 28 days.", sub: n("quiet").avgDays != null ? `${n("quiet").avgDays} days since the last sale, on average` : "no sales in the last 28 days" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Affiliate Command"
        description={`Affiliate sales come from three things: how many creators sell (Active Sellers), how many videos and LIVE sessions each one posts (Videos Per Seller), and how much each video sells (Sales Per Video). This screen shows which of them changed your sales. Dates: ${fmtDayLabel(c.from)} – ${fmtDayLabel(c.to)} (${c.days} days), compared with the ${c.days} days before. The creator stages and Sample Status below are as of today.`}
        actions={<DatesPicker from={range?.start ?? ""} to={range?.end ?? ""} today={todayKL()} emptyLabel="Last 28 Days" />}
      />

      <Card data-testid="goal">
        <div className="px-5 py-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[13px] font-medium text-ink-3">Affiliate Sales, {c.days} Days</p>
              <p className="tnum mt-0.5 text-[30px] leading-tight font-semibold tracking-tight text-ink">{fmtRM(now.sales)}</p>
            </div>
            <div className="text-right">
              <p className="text-[13px] font-medium text-ink-3">Goal For {c.days} Days · {c.target.basis}</p>
              <p className="tnum text-[18px] font-semibold text-ink">{fmtRM(goal)}</p>
              {c.days !== 28 && <p className="text-[12px] text-ink-3" data-testid="goal-scale">= your 28-day goal {fmtRM(c.target.per28)} × {c.days} ÷ 28</p>}
              <TargetForm current={goal} custom={c.target.custom} canEdit={canEdit} />
            </div>
          </div>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-surface-2"><div className={cn("h-full rounded-full", done >= 100 ? "bg-good" : "bg-brand")} style={{ width: `${done}%` }} /></div>
          <p className="mt-2 text-[13px] text-ink-2">{gap > 0 ? <><b>{fmtRM(gap)}</b> short of the goal ({done}% reached).</> : <>Goal reached: <b>{fmtRM(-gap)}</b> above it.</>}{before.sales > 0 && <> Last period: {fmtRM(before.sales)}.</>}</p>
        </div>
      </Card>

      <section aria-label="Why sales changed" className="space-y-3">
        <h2 className="flex items-center gap-1.5 text-[15px] font-semibold text-ink">Why Sales Changed</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" data-testid="levers">
          <Lever label="Active Sellers" now={now.sellers} before={before.sellers} fmt={(n) => n.toLocaleString("en-MY")} help="Creators who had sales in these dates." />
          <Lever label="Videos Per Seller" now={now.sellers ? now.posts / now.sellers : 0} before={before.sellers ? before.posts / before.sellers : 0} fmt={(n) => n.toFixed(2)} help="Videos and LIVE sessions posted in these dates by each creator who sold." />
          <Lever label="Sales Per Video" now={now.posts ? now.sales / now.posts : 0} before={before.posts ? before.sales / before.posts : 0} fmt={(n) => fmtRM(n)} help="Sales divided by videos and LIVE sessions posted: how well each one sells." />
        </div>
        <Card>
          <CardHeader title="From Last Period To This Period" description="Starts with last period's sales and ends with this period's. The three steps in between show what added or lost sales. They add up exactly to the change. Sales that come from older videos count in Sales Per Video." />
          <div className="px-5 pb-5">
            {c.change ? (
              <>
                <Waterfall startLabel="Last Period" endLabel="This Period" start={before.sales} end={now.sales} steps={c.change.effects.map((e) => ({ label: e.label, effect: e.effect, detail: `${e.key === "perPost" ? fmtRM(e.from) : e.from.toLocaleString("en-MY", { maximumFractionDigits: 2 })} → ${e.key === "perPost" ? fmtRM(e.to) : e.to.toLocaleString("en-MY", { maximumFractionDigits: 2 })}` }))} />
                <p className="mt-3 border-t border-line pt-3 text-[13.5px] text-ink-2">Total change: <b className={c.change.total >= 0 ? "text-good" : "text-critical"}>{sign(c.change.total)}RM {Math.abs(Math.round(c.change.total)).toLocaleString("en-MY")}</b>. Biggest mover: <b>{[...c.change.effects].sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect))[0].label}</b>.</p>
              </>
            ) : <p className="text-[13.5px] text-ink-3">Not enough earlier data to compare yet.</p>}
          </div>
        </Card>
      </section>

      <Card data-testid="guard" className={cn(g.high && "border-warn/60")}>
        <CardHeader title="Sample Status" description="Samples already sent that have not turned into sales. Fix these before paying for new creators: the shipping and product are already spent. Counts are creator-and-product pairs, as of today." action={g.high ? <Badge tone="warn">Fix Sent Samples First</Badge> : <Badge tone="good">Healthy</Badge>} />
        <div className="grid grid-cols-2 gap-3 px-5 pb-5 lg:grid-cols-4">
          {[
            { n: g.notPosted, label: "Delivered, Not Posted", to: "/creators?stage=notposted" },
            { n: g.noSale, label: "Posted, No Sale", to: "/creators?stage=nosale" },
            { n: g.soldThenQuiet, label: "Sold Once, Then Quiet", to: "/creators?stage=quiet" },
            { n: g.requestsWaiting, label: "Requests Waiting For You", to: "/affiliate/outreach?stage=requested" },
          ].map((x) => (
            <Link key={x.label} href={x.to} className="rounded-xl border border-line px-3.5 py-3 transition-colors hover:bg-surface-2">
              <p className="tnum text-[22px] font-semibold text-ink">{x.n.toLocaleString("en-MY")}</p>
              <p className="text-[12.5px] text-ink-3">{x.label}</p>
            </Link>
          ))}
        </div>
        <p className="px-5 pb-4 text-[13px] text-ink-3">{g.creators.toLocaleString("en-MY")} creators hold samples that are not selling now (not posted, no sale, or sold once and went quiet).</p>
      </Card>

      <section aria-label="Creator journey" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-ink">Creator Journey</h2>
          <Link href="/creators" className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand hover:underline">Open Affiliate Data <ArrowRight className="size-3.5" /></Link>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="journey">
          {journey.map((j) => (
            <Link key={j.key} href={j.href} title={j.help} data-stage={j.key} className="rounded-2xl border border-line bg-surface px-4 py-3.5 transition-colors hover:bg-surface-2">
              <div className="flex items-center justify-between gap-2"><p className="text-[13px] font-medium text-ink-3">{j.label}</p><Badge tone={TONE[j.key]}>{j.count == null ? "–" : j.count.toLocaleString("en-MY")}</Badge></div>
              {j.big && <p className="tnum mt-1 text-[18px] font-semibold text-ink">{j.big}</p>}
              <p className={cn("text-[12.5px] text-ink-3", !j.big && "mt-1")}>{j.sub}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
