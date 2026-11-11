import Link from "next/link";
import { AlertTriangle, ArrowRight, CircleAlert, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sparkline } from "@/components/viz/sparkline";
import { HEALTH_LABEL, LOG_WINDOW, type CampaignRow, type CreatorRow, type Health, type LogBatch, type ProductRow, type TodayData, type Kpi } from "@/lib/ads/insights";
import type { Range } from "@/lib/ads/range";
import { LogDelete } from "./log-delete";
import { Delta, Empty, GroupPill, Pill, SpendSalesBars, Tile, VideoCell, day, nfmt, rm, rm2, roiFmt, th, thr, td, tdr } from "./ui";

const card = "overflow-hidden rounded-2xl border border-line bg-surface";
const head = "border-y border-line bg-surface-2/60";

function KpiTiles({ now, before, label, compare = true }: { now: Kpi; before: Kpi; label: string; compare?: boolean }) {
  const delta = (n: number | null, b: number | null, neutral?: boolean) => (compare ? <Delta now={n} before={b} neutral={neutral} /> : <span className="text-[12.5px] text-ink-3">no earlier period</span>);
  return (
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label={label}>
      <Tile label="Ad Spend" value={rm(now.cost)} sub={delta(now.cost, before.cost, true)} testId="ads-kpi-spend" />
      <Tile label="Sales From Ads" value={rm(now.revenue)} sub={delta(now.revenue, before.revenue)} />
      <Tile label="Orders" value={nfmt(now.orders)} sub={delta(now.orders, before.orders)} />
      <Tile label="ROI" value={roiFmt(now.roi)} sub={delta(now.roi, before.roi)} />
    </section>
  );
}

// ───────────────────────────── 1. Ads Today ─────────────────────────────
export function TodaySection({ d }: { d: TodayData }) {
  const icon = { critical: <CircleAlert className="size-4.5 text-critical" />, warn: <AlertTriangle className="size-4.5 text-warn" />, info: <Info className="size-4.5 text-brand" /> };
  return (
    <div className="space-y-5" data-testid="ads-today">
      <div>
        <h2 className="mb-2 text-[13px] font-semibold tracking-wide text-ink-3 uppercase">Latest Day{d.latestDay ? ` · ${day(d.latestDay)}` : ""} <span className="font-normal normal-case">compared with the day before</span></h2>
        <KpiTiles now={d.latest} before={d.dayBefore} label="Latest day" />
      </div>
      <div>
        <h2 className="mb-2 text-[13px] font-semibold tracking-wide text-ink-3 uppercase">{d.range.label} <span className="font-normal normal-case">{d.hasPrev ? `compared with the ${d.range.days} day${d.range.days === 1 ? "" : "s"} before` : "nothing to compare with"}</span></h2>
        <KpiTiles now={d.rangeKpi} before={d.rangePrev} label="Selected dates" compare={d.hasPrev} />
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section className={cn(card, "p-5")} aria-label="Selected dates">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[16px] font-semibold text-ink">{d.range.label}</h2>
            <p className="text-[13px] text-ink-3">Spend {rm(d.rangeKpi.cost)} · Sales {rm(d.rangeKpi.revenue)} · ROI {roiFmt(d.rangeKpi.roi)}{d.seriesCapped ? " · chart shows the last 120 days" : ""}</p>
          </div>
          <SpendSalesBars series={d.series} />
        </section>
        <section className={cn(card, "p-5")} aria-label="Alerts" data-testid="ads-alerts">
          <h2 className="text-[16px] font-semibold text-ink">Needs Your Attention</h2>
          {d.alerts.length === 0 ? <p className="mt-3 text-[14px] text-ink-3">Nothing needs attention. {d.activeCampaigns} campaign{d.activeCampaigns === 1 ? "" : "s"} spending in the last 7 days.</p> : (
            <ul className="mt-2 divide-y divide-line">
              {d.alerts.slice(0, 8).map((a, i) => (
                <li key={i} className="flex items-start gap-2.5 py-2.5" data-testid="ads-alert">
                  <span className="mt-0.5 shrink-0">{icon[a.level]}</span>
                  <span className="min-w-0 flex-1"><span className="block text-[14px] font-medium text-ink">{a.title}</span><span className="block text-[13px] text-ink-3">{a.detail}</span></span>
                  {a.href && <Link href={a.href} className="shrink-0 text-[13px] font-medium text-brand hover:underline">Open</Link>}
                </li>
              ))}
            </ul>
          )}
          {d.alerts.length > 8 && <p className="mt-2 text-[12.5px] text-ink-3">And {d.alerts.length - 8} more in Campaign Health.</p>}
        </section>
      </div>
      <section className={cn(card, "p-5")} aria-label="Videos worth boosting">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div><h2 className="text-[16px] font-semibold text-ink">Golden Videos Waiting</h2><p className="mt-0.5 text-[13px] text-ink-3">Every video is judged on all of its history. {d.activeBoosts} boost session{d.activeBoosts === 1 ? "" : "s"} running now.</p></div>
          <Link href="/ads?tab=picks" className="inline-flex items-center gap-1 text-[13.5px] font-medium text-brand hover:underline">Open Boost Picks<ArrowRight className="size-4" /></Link>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {d.opportunities.map((o) => <Link key={o.key} href={`/ads?tab=picks&group=${o.key}`} data-testid={`ads-opp-${o.key}`} className="rounded-xl border border-line px-3.5 py-2.5 hover:border-brand/50 hover:bg-brand-soft"><span className="block text-[12.5px] font-medium text-ink-2">{o.label}</span><span className="tnum block text-[22px] leading-tight font-semibold text-ink">{nfmt(o.count)}</span></Link>)}
        </div>
        {d.topPicks.length > 0 && (
          <ul className="mt-3 divide-y divide-line border-t border-line">
            {d.topPicks.map((v) => <li key={v.key} className="flex flex-wrap items-center gap-3 py-2.5"><span className="min-w-0 flex-1 basis-72"><VideoCell v={v} /></span><GroupPill group={v.group} /><span className="tnum w-24 text-right text-[13.5px] font-semibold text-good">{v.roi != null ? roiFmt(v.roi) : rm(v.organicGmv)}</span></li>)}
          </ul>
        )}
      </section>
    </div>
  );
}

// ───────────────────────────── 4. Boost Log ─────────────────────────────
const VERDICT: Record<LogBatch["verdict"], { label: string; tone: string }> = { better: { label: "Sales Went Up", tone: "good" }, same: { label: "About The Same", tone: "muted" }, worse: { label: "Sales Went Down", tone: "critical" }, early: { label: "Too Early To Say", tone: "brand" } };
export function LogSection({ batches, saved, range }: { batches: LogBatch[]; saved: boolean; range: Range }) {
  if (!batches.length) return <Empty title={range.from ? "No Boosts Logged In These Dates" : "No Boosts Logged Yet"} action={{ href: "/ads?tab=picks", label: "Open Boost Picks" }}>When you boost a batch in TikTok, plan it here and press Mark As Boosted. The log then shows the results of those videos before and after.</Empty>;
  const perDay = (k: Kpi, days: number) => (days > 0 ? k.revenue / days : 0);
  return (
    <div className="space-y-4" data-testid="ads-log">
      {saved && <p className="rounded-xl border border-good/30 bg-good-soft px-4 py-2.5 text-[14px] text-good" data-testid="ads-log-saved">Saved. The results after the boost fill in as new days are synced.</p>}
      <p className="text-[13px] text-ink-3">Batches boosted in {range.label}. Each batch compares the {LOG_WINDOW} days before the boost with up to {LOG_WINDOW} days from the boost date. Sales a day is used so an unfinished period is compared fairly.</p>
      {batches.map((b) => (
        <section key={b.id} className={card} data-testid="ads-log-batch">
          <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4 pb-3">
            <div>
              <h2 className="text-[16px] font-semibold text-ink">{day(b.boostedOn)} · {b.videos.length} Video{b.videos.length === 1 ? "" : "s"} · {rm2(b.totalBudget)} A Day{b.days > 1 ? ` For ${b.days} Days` : ""}</h2>
              <p className="mt-0.5 text-[13px] text-ink-3">{b.note ? `${b.note} · ` : ""}{b.createdBy ? `Logged by ${b.createdBy}` : ""}</p>
            </div>
            <div className="flex items-center gap-2"><Pill tone={VERDICT[b.verdict].tone} testId="ads-log-verdict">{VERDICT[b.verdict].label}</Pill><LogDelete id={b.id} /></div>
          </div>
          <div className="grid gap-3 px-5 pb-4 sm:grid-cols-2 lg:grid-cols-4">
            <Tile label={`Sales A Day · Before`} value={rm(perDay(b.before, LOG_WINDOW))} sub={<span className="text-[12.5px] text-ink-3">{rm(b.before.revenue)} in {LOG_WINDOW} days</span>} />
            <Tile label={`Sales A Day · After`} value={b.afterDays ? rm(perDay(b.after, b.afterDays)) : "–"} sub={<span className="text-[12.5px] text-ink-3">{rm(b.after.revenue)} in {b.afterDays} day{b.afterDays === 1 ? "" : "s"}</span>} />
            <Tile label="ROI · Before → After" value={`${roiFmt(b.before.roi)} → ${roiFmt(b.after.roi)}`} />
            <Tile label="Orders · Before → After" value={`${nfmt(b.before.orders)} → ${nfmt(b.after.orders)}`} sub={<span className="text-[12.5px] text-ink-3">Spend {rm(b.before.cost)} → {rm(b.after.cost)}</span>} />
          </div>
          <details className="border-t border-line">
            <summary className="cursor-pointer px-5 py-2.5 text-[13.5px] font-medium text-brand hover:underline">Show Each Video</summary>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] border-collapse text-[13.5px]">
                <thead><tr className={head}><th className={cn(th, "pl-5")}>Video</th><th className={thr}>Budget A Day</th><th className={thr}>Sales Before</th><th className={thr}>Sales After</th><th className={thr}>ROI Before</th><th className={thr}>ROI After</th><th className={cn(thr, "pr-5")}>Orders After</th></tr></thead>
                <tbody>{b.videos.map((v) => <tr key={v.creativeId + v.productId} className="border-b border-line"><td className={cn(td, "max-w-[340px] pl-5")}><VideoCell v={{ ...v, postedOn: null }} /></td><td className={tdr}>{rm2(v.budget)}</td><td className={tdr}>{rm(v.before.revenue)}</td><td className={tdr}>{rm(v.after.revenue)}</td><td className={tdr}>{roiFmt(v.before.roi)}</td><td className={tdr}>{roiFmt(v.after.roi)}</td><td className={cn(tdr, "pr-5")}>{nfmt(v.after.orders)}</td></tr>)}</tbody>
              </table>
            </div>
          </details>
        </section>
      ))}
    </div>
  );
}

// ───────────────────────────── 5. Campaign Health ─────────────────────────────
const HEALTH_TONE: Record<Health, string> = { healthy: "good", watch: "warn", losing: "critical", nosales: "critical", stopped: "warn", idle: "muted" };
export function CampaignSection({ d }: { d: { range: Range; campaigns: CampaignRow[]; total: Kpi; totalBefore: Kpi; hasPrev: boolean } }) {
  if (!d.campaigns.length) return <Empty title="No Campaign Results Yet" action={{ href: "/sync?tab=ads", label: "Open Data Sync" }}>Press Sync Now in Data Sync → Ads Management.</Empty>;
  const shown = d.campaigns.filter((c) => c.health !== "idle"), idle = d.campaigns.length - shown.length;
  return (
    <div className="space-y-5" data-testid="ads-campaigns">
      <p className="text-[13px] text-ink-3">{d.range.label}{d.hasPrev ? `, compared with the ${d.range.days} day${d.range.days === 1 ? "" : "s"} before` : ""}. Health is judged at the end of the range (last 3 days, ROI against the period before).</p>
      <KpiTiles now={d.total} before={d.totalBefore} label="All campaigns" compare={d.hasPrev} />
      <section className={card}>
        <div className="px-5 pt-4 pb-3"><h2 className="text-[16px] font-semibold text-ink">Campaigns</h2><p className="mt-0.5 text-[13px] text-ink-3">{shown.length} with spend in this period or the one before{idle ? ` · ${idle} older campaign${idle === 1 ? "" : "s"} not running are hidden` : ""}.</p></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] border-collapse text-[13.5px]">
            <thead><tr className={head}><th className={cn(th, "pl-5")}>Campaign</th><th className={th}>Health</th><th className={thr}>Spend</th><th className={thr}>Sales</th><th className={thr}>Orders</th><th className={thr}>ROI</th><th className={thr}>ROI Before</th><th className={thr}>Daily Budget</th><th className={thr}>All-Time ROI</th><th className={cn(th, "w-[130px] pr-5")}>Sales, 14 Days</th></tr></thead>
            <tbody>
              {shown.map((c) => (
                <tr key={c.id} className="border-b border-line" data-testid="ads-campaign-row">
                  <td className={cn(td, "max-w-[280px] pl-5")}><p className="truncate font-medium text-ink" title={c.name}>{c.name}</p><p className="truncate text-[12.5px] text-ink-3">{[c.account, c.type === "LIVE_GMV_MAX" ? "LIVE" : c.type === "PRODUCT_GMV_MAX" ? "Product" : null, c.lastSpend ? `last spend ${day(c.lastSpend)}` : null].filter(Boolean).join(" · ")}</p></td>
                  <td className={td}><Pill tone={HEALTH_TONE[c.health]} testId="ads-health">{HEALTH_LABEL[c.health]}</Pill><p className="mt-0.5 max-w-[190px] text-[12.5px] text-ink-3">{c.note}</p></td>
                  <td className={tdr}>{rm(c.now.cost)}</td><td className={tdr}>{rm(c.now.revenue)}</td><td className={tdr}>{nfmt(c.now.orders)}</td>
                  <td className={cn(tdr, "font-semibold")}>{roiFmt(c.now.roi)}</td><td className={cn(tdr, "text-ink-2")}>{roiFmt(c.before.roi)}</td>
                  <td className={cn(tdr, "text-ink-2")}>{c.budget ? rm(c.budget) : "–"}</td><td className={cn(tdr, "text-ink-2")}>{roiFmt(c.all.roi)}</td>
                  <td className={cn(td, "pr-5")}><Sparkline values={c.trend} tone={c.health === "healthy" ? "good" : c.health === "watch" || c.health === "stopped" ? "warn" : "critical"} label={`Sales of ${c.name}, last 14 days`} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

// ───────────────────────────── 6. Product Performance ─────────────────────────────
const VERDICT_P: Record<ProductRow["verdict"], { label: string; tone: string }> = { push: { label: "Push More", tone: "good" }, hold: { label: "Hold", tone: "muted" }, fix: { label: "Fix Or Pause", tone: "critical" }, idle: { label: "No Spend", tone: "muted" } };
export function ProductSection({ d }: { d: { range: Range; products: ProductRow[]; accountRoi: number | null } }) {
  if (!d.products.length) return <Empty title="No Product Results In These Dates" action={{ href: "/sync?tab=ads", label: "Open Data Sync" }}>Choose other dates, or press Sync Now in Data Sync → Ads Management.</Empty>;
  return (
    <div className="space-y-5" data-testid="ads-products">
      <p className="text-[13px] text-ink-3">{d.range.label} · your ROI in these dates is {roiFmt(d.accountRoi)}</p>
      <section className={card}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] border-collapse text-[13.5px]">
            <thead><tr className={head}><th className={cn(th, "pl-5")}>Product</th><th className={th}>What To Do</th><th className={thr}>Spend</th><th className={thr}>Share Of Spend</th><th className={thr}>Sales</th><th className={thr}>Orders</th><th className={thr}>ROI</th><th className={thr}>ROI Before</th><th className={thr}>Cost / Order</th><th className={cn(thr, "pr-5")}>Golden Videos Unused</th></tr></thead>
            <tbody>
              {d.products.map((p) => (
                <tr key={p.key} className="border-b border-line" data-testid="ads-product-row">
                  <td className={cn(td, "max-w-[260px] pl-5")}><p className="truncate font-medium text-ink" title={p.label}>{p.label}</p><p className="text-[12.5px] text-ink-3">{p.videosWithSpend} video{p.videosWithSpend === 1 ? "" : "s"} spending in these dates</p></td>
                  <td className={td}><Pill tone={VERDICT_P[p.verdict].tone}>{VERDICT_P[p.verdict].label}</Pill><p className="mt-0.5 max-w-[200px] text-[12.5px] text-ink-3">{p.note}</p></td>
                  <td className={tdr}>{rm(p.now.cost)}</td><td className={cn(tdr, "text-ink-2")}>{(p.share * 100).toFixed(0)}%</td><td className={tdr}>{rm(p.now.revenue)}</td><td className={tdr}>{nfmt(p.now.orders)}</td>
                  <td className={cn(tdr, "font-semibold")}>{roiFmt(p.now.roi)}</td><td className={cn(tdr, "text-ink-2")}>{roiFmt(p.before.roi)}</td><td className={cn(tdr, "text-ink-2")}>{p.costPerOrder != null ? rm2(p.costPerOrder) : "–"}</td>
                  <td className={cn(tdr, "pr-5")}>{p.golden ? <Link href={`/ads?tab=picks&group=best${p.key.startsWith("id:") ? "" : `&product=${p.key}`}`} className="font-medium text-brand hover:underline">{p.golden}</Link> : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

// ───────────────────────────── 7. Creator Ad Scoreboard ─────────────────────────────
export function CreatorSection({ d }: { d: { range: Range; creators: CreatorRow[]; unknownVideos: number; accountRoi: number | null } }) {
  if (!d.creators.length) return <Empty title="No Creator Results Yet" action={{ href: "/sync", label: "Open Data Sync" }}>Creators appear when videos in the ads results match videos from the Shop sync.</Empty>;
  const list = d.creators.slice(0, 200);
  return (
    <div className="space-y-5" data-testid="ads-creators">
      <p className="text-[13px] text-ink-3">{d.range.label}. {nfmt(d.creators.length)} creators have videos in your ads{d.creators.length > list.length ? `; the top ${list.length} by sales are shown` : ""}. Your all-time ROI is {roiFmt(d.accountRoi)}. Golden Unused is always judged on all history.{d.unknownVideos ? ` ${nfmt(d.unknownVideos)} videos have no known creator (not in the Shop sync).` : ""}</p>
      <section className={card}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] border-collapse text-[13.5px]">
            <thead><tr className={head}><th className={cn(th, "w-12 pl-5")}>#</th><th className={th}>Creator</th><th className={thr}>Videos In Ads</th><th className={thr}>Videos That Sold</th><th className={thr}>Ad Spend</th><th className={thr}>Sales From Ads</th><th className={thr}>ROI</th><th className={thr}>Sales, Last 7 Days</th><th className={thr}>Golden Unused</th><th className={cn(th, "pr-5")}>Best Video</th></tr></thead>
            <tbody>
              {list.map((c, i) => (
                <tr key={c.creator} className="border-b border-line" data-testid="ads-creator-row">
                  <td className={cn(td, "tnum pl-5 text-ink-3")}>{i + 1}</td>
                  <td className={td}><Link href={`/creators/${encodeURIComponent(c.creator)}`} className="font-medium text-brand hover:underline">@{c.creator}</Link>{c.blocked > 0 && <p className="text-[12.5px] text-critical">{c.blocked} blocked</p>}</td>
                  <td className={tdr}>{nfmt(c.videos)}</td><td className={tdr}>{nfmt(c.sellers)}</td><td className={tdr}>{rm(c.all.cost)}</td><td className={tdr}>{rm(c.all.revenue)}</td>
                  <td className={cn(tdr, "font-semibold", c.all.roi != null && d.accountRoi != null && c.all.roi >= d.accountRoi ? "text-good" : "text-ink")}>{roiFmt(c.all.roi)}</td>
                  <td className={cn(tdr, "text-ink-2")}>{c.week.revenue ? rm(c.week.revenue) : "–"}</td>
                  <td className={tdr}>{c.golden ? <Link href={`/ads?tab=picks&group=best&q=${encodeURIComponent(c.creator)}`} className="font-medium text-brand hover:underline">{c.golden}</Link> : "–"}</td>
                  <td className={cn(td, "max-w-[240px] pr-5")}>{c.best ? <Link href={`/ads/video/${encodeURIComponent(c.best.creativeId)}`} className="block truncate text-ink-2 hover:text-brand hover:underline" title={c.best.title ?? undefined}>{c.best.title || `Video ${c.best.creativeId.slice(-8)}`}</Link> : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
