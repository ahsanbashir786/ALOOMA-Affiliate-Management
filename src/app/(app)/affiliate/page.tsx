import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Users } from "lucide-react";
import { gate } from "@/lib/gate";
import { hasSyncedData } from "@/lib/creators/load";
import { loadDashboard } from "@/lib/affiliate/dashboard";
import { parseRange } from "@/lib/creators/params";
import type { StageKey } from "@/lib/affiliate/stages";
import { fmtDayLabel, fmtFullDay, todayKL } from "@/lib/time";
import { one, type SP } from "@/lib/url";
import { Badge, buttonClasses, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/primitives";
import { DatesPicker } from "@/components/ui/range-picker";
import { AgeStack, Funnel, KpiCard, SalesVideosChart, type FunnelRow } from "@/components/affiliate/charts";
import { cn, fmtCompact, fmtRM } from "@/lib/utils";

export const metadata: Metadata = { title: "Affiliate Command" };

const STATUS = {
  good: { text: "Good", cls: "bg-good-soft text-good", dot: "bg-good" },
  watch: { text: "Watch", cls: "bg-warn-soft text-warn", dot: "bg-warn" },
  problem: { text: "Problem", cls: "bg-critical-soft text-critical", dot: "bg-critical" },
} as const;

export default async function CommandPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { denied } = await gate("creators", "Affiliate Command");
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
  const d = await loadDashboard(range);
  if (!d) return null;
  const { now, before, weeks, window: w, guard: g, hint } = d;
  const series = (f: (x: (typeof weeks)[number]) => number) => weeks.map(f);
  const st = (k: StageKey) => d.stages[k];
  const funnel: FunnelRow[] = [
    { key: "suggested", label: "Suggested To Invite", count: hint ? hint.eligible : null, href: "/affiliate/outreach", tone: "brand", help: "New creators from TikTok's Creator Marketplace that meet your rules (level 5 or higher, your categories), including creators who never asked for a sample.", sub: hint ? (hint.own ? `+${hint.own} of yours for more samples` : "meet your rules") : "open Outreach to load" },
    { key: "requested", label: "Sample Requested", count: st("requested").creators, href: "/affiliate/outreach?stage=requested", tone: "brand", help: "Asked for a sample and waiting for your decision.", sub: "waiting for you" },
    { key: "way", label: "Sample On The Way", count: st("way").creators, href: "/affiliate/outreach?stage=shipped", tone: "neutral", help: "Approved and not delivered yet.", sub: st("way").avgDays != null ? `${st("way").avgDays} days on average` : "" },
    { key: "notposted", label: "Delivered, Not Posted", count: st("notposted").creators, href: "/creators?stage=notposted", tone: "critical", help: "The sample arrived, the posting window passed, nothing posted and no sales.", sub: st("notposted").avgDays != null ? `${st("notposted").avgDays} days on average` : "" },
    { key: "nosale", label: "Posted, No Sale", count: st("nosale").creators, href: "/creators?stage=nosale", tone: "warn", help: "Posted for the sample but no sales yet.", sub: st("nosale").avgDays != null ? `${st("nosale").avgDays} days on average` : "" },
    { key: "selling", label: "Selling", count: st("selling").creators, href: "/creators?stage=selling", tone: "good", help: "Sold in the last 28 days.", sub: st("selling").sales28 > 0 ? `RM ${fmtCompact(st("selling").sales28)} in 28 days` : "" },
    { key: "star", label: "Star", count: st("star").creators, href: "/creators?stage=star", tone: "good", help: "Among the top sellers of the last 28 days.", sub: st("star").sales28 > 0 ? `RM ${fmtCompact(st("star").sales28)} in 28 days` : "" },
    { key: "quiet", label: "Went Quiet", count: st("quiet").creators, href: "/creators?stage=quiet", tone: "warn", help: "Sold before, nothing in the last 28 days.", sub: st("quiet").avgDays != null ? `${st("quiet").avgDays} days since last sale` : "" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Affiliate Command"
        description="How your affiliate sales are doing, why, and where to act. Charts show the last 12 weeks; the numbers and health checks use the dates you choose, compared with the same number of days just before. Creator stages and Sample Status are as of today."
        actions={<DatesPicker from={range?.start ?? ""} to={range?.end ?? ""} today={todayKL()} emptyLabel="Last 28 Days" />}
      />
      <p className="-mt-3 text-[13px] text-ink-3" data-testid="date-line">
        <b className="font-semibold text-ink-2">{fmtDayLabel(w.start)} – {fmtFullDay(w.end)}</b> · {w.days} day{w.days === 1 ? "" : "s"} · vs {fmtDayLabel(w.prevStart)} – {fmtDayLabel(w.prevEnd)}
        {w.moved && <span> · data ends {fmtDayLabel(w.end)}</span>}
      </p>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="kpis">
        <KpiCard testId="kpi-sales" label="Affiliate Sales" value={fmtRM(now.sales)} now={now.sales} before={before.sales} values={series((x) => x.sales)} money />
        <KpiCard testId="kpi-creators" label="Active Creators" value={now.creators.toLocaleString("en-MY")} now={now.creators} before={before.creators} values={series((x) => x.creators)} />
        <KpiCard testId="kpi-videos" label="New Videos Posted" value={now.videos.toLocaleString("en-MY")} now={now.videos} before={before.videos} values={series((x) => x.videos)} />
        <KpiCard testId="kpi-perVideo" label="Sales Per Video" value={fmtRM(now.videos ? now.sales / now.videos : 0)} now={now.videos ? now.sales / now.videos : 0} before={before.videos ? before.sales / before.videos : 0} values={series((x) => (x.videos ? x.sales / x.videos : 0))} money />
      </div>

      <Card>
        <CardHeader title="Sales And New Videos, Week By Week" description="The line is sales each week. The bars are the videos and LIVE sessions creators posted that week. If the bars shrink while the line stays up, sales are living off older videos." />
        <div className="px-5 pb-5"><SalesVideosChart weeks={weeks} shaded={Math.min(12, Math.ceil(w.days / 7))} /></div>
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Where Sales Come From" description="Each bar is one week of sales, split by how old the video was when it sold. A growing dark or orange part means sales lean on old videos. Same ages as Product Analysis." />
          <div className="px-5 pb-5"><AgeStack weeks={weeks} /></div>
        </Card>
        <Card>
          <CardHeader title="Creators By Stage" description="From suggested to star. Click a stage to open the creators: the first three go to Outreach, the rest to Affiliate Data. Bars use a square-root scale so small stages stay visible." action={<Link href="/creators" className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand hover:underline">Open Affiliate Data <ArrowRight className="size-3.5" /></Link>} />
          <div className="px-3 pb-4"><Funnel rows={funnel} /></div>
        </Card>
      </div>

      <Card data-testid="health">
        <div className="px-5 pt-4 pb-3"><p className="text-[13px] font-medium text-ink-3">Health Check</p><p className="mt-0.5 text-[17px] font-semibold tracking-tight text-ink" data-testid="headline">{d.headline}</p></div>
        <div className="grid grid-cols-1 gap-3 px-5 pb-5 md:grid-cols-2 xl:grid-cols-4">
          {d.checks.map((c) => (
            <div key={c.key} className="flex flex-col rounded-xl border border-line px-4 py-3.5" data-testid={`check-${c.key}`} data-status={c.status}>
              <p className="flex items-center justify-between gap-2"><span className="text-[13.5px] font-semibold text-ink">{c.question}</span><span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-semibold", STATUS[c.status].cls)}><span className={cn("size-1.5 rounded-full", STATUS[c.status].dot)} />{STATUS[c.status].text}</span></p>
              <p className="mt-1.5 flex-1 text-[13px] leading-snug text-ink-2">{c.answer}</p>
              {c.button && <Link href={c.button.href} className="mt-3 inline-flex h-8 items-center justify-center self-start rounded-full border border-brand bg-brand/10 px-3 text-[13px] font-semibold text-brand hover:bg-brand hover:text-white">{c.button.label}</Link>}
            </div>
          ))}
        </div>
      </Card>

      <Card data-testid="guard" className={cn(g.high && "border-warn/60")}>
        <CardHeader title="Sample Status" description="Samples already sent that are not paying off. Chase these before paying for new creators: the shipping and product are already spent. Counts are creator-and-product pairs, as of today. Click a number to see the creators." action={g.high ? <Badge tone="warn">Chase Idle Samples First</Badge> : <Badge tone="good">Healthy</Badge>} />
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
      </Card>
    </div>
  );
}
