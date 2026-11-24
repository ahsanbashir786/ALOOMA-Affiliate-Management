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

export const metadata: Metadata = { title: "Command" };

const STATUS = {
  good: { text: "Good", cls: "bg-good-soft text-good", dot: "bg-good" },
  watch: { text: "Watch", cls: "bg-warn-soft text-warn", dot: "bg-warn" },
  problem: { text: "Problem", cls: "bg-critical-soft text-critical", dot: "bg-critical" },
} as const;

export default async function CommandPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { denied } = await gate("creators", "Command");
  if (denied) return denied;
  if (!(await hasSyncedData())) {
    return (
      <div className="space-y-6">
        <PageHeader title="Command" />
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
        title="Command"
        description="How your affiliate sales are doing, why, and where to act. Charts show the last 12 weeks. The headline numbers use the dates you choose, compared with the same number of days just before. Creator stages are as of today."
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
        <CardHeader title="Sales vs Content Posted" description="The line is sales each week. The bars are the videos and LIVE sessions creators posted that week. If the bars shrink while the line stays up, sales are living off older videos." />
        <div className="px-5 pb-5"><SalesVideosChart weeks={weeks} shaded={Math.min(12, Math.ceil(w.days / 7))} /></div>
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Sales By Video Age" description="Each bar is one week of sales, split by how old the video was when it sold. A growing dark or orange part means sales lean on old videos." />
          <div className="px-5 pb-5"><AgeStack weeks={weeks} /></div>
        </Card>
        <Card>
          <CardHeader title="Creators By Stage" description="From suggested to star. Click a stage to open the creators: the first three go to Outreach, the rest to Creators. Bars use a square-root scale so small stages stay visible." />
          {g.high && (
            <p data-testid="guard" className="mx-5 mb-2 rounded-lg bg-warn/10 px-3 py-2 text-[13px] font-medium text-ink-2">
              <Badge tone="warn">Chase Idle Samples First</Badge> <span className="ml-1">{(g.notPosted + g.noSale).toLocaleString("en-MY")} samples already sent are not paying off. Chase them before paying for new creators.</span>
            </p>
          )}
          <div className="px-3 pb-4"><Funnel rows={funnel} /></div>
        </Card>
      </div>
    </div>
  );
}
