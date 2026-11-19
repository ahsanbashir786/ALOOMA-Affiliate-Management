import type { Metadata } from "next";
import Link from "next/link";
import { Package, Users, Video } from "lucide-react";
import { gate } from "@/lib/gate";
import { hasSyncedData } from "@/lib/creators/load";
import { parseRange } from "@/lib/creators/params";
import { analyseProducts } from "@/lib/products/analysis";
import { fewCreators, judgeProduct } from "@/lib/affiliate/product-levers";
import { fmtDayLabel, fmtFullDay, todayKL } from "@/lib/time";
import { href, one, type SP } from "@/lib/url";
import { Badge, buttonClasses, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { OpenProductButton } from "@/components/creators/open-panel-button";
import { PeriodPicker } from "@/components/products/period-picker";
import { Delta, HealthChip, Legend, MixBar, TagBadge } from "@/components/products/ui";
import { Sparkline } from "@/components/viz/sparkline";
import { InfoTip } from "@/components/ui/info-tip";
import { BUCKETS } from "@/lib/products/diagnose";
import { cn, fmtRM } from "@/lib/utils";

export const metadata: Metadata = { title: "Products" };
const TAGS = ["Growing", "Steady", "Slipping", "Dying"] as const;
const SORTS = [{ key: "order", label: "Your Order" }, { key: "sales", label: "Biggest Sales" }, { key: "drop", label: "Biggest Drop" }, { key: "growth", label: "Biggest Growth" }] as const;
const sign = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "");
const rmShort = (n: number) => `${sign(n)}RM ${Math.abs(Math.round(n)).toLocaleString("en-MY")}`;
const pctOf = (now: number, prev: number) => (prev > 0 ? (now - prev) / prev : now > 0 ? 9 : 0);

export default async function AffiliateProductsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { denied } = await gate("creators", "Products");
  if (denied) return denied;
  const sp = await searchParams;
  const raw = Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, one(v)]));
  if (!(await hasSyncedData())) {
    return (
      <div className="space-y-6">
        <PageHeader title="Products" />
        <Card><EmptyState icon={<Package className="size-5" />} title="No TikTok data yet" description="Run Data Sync first. Your products appear here as soon as the first orders arrive." action={<Link href="/sync" className={buttonClasses({ variant: "primary" })}>Open Data Sync</Link>} /></Card>
      </div>
    );
  }
  const a = await analyseProducts(parseRange(raw));
  const { period } = a;
  const sort = (SORTS.find((s) => s.key === raw.sort)?.key ?? "order") as (typeof SORTS)[number]["key"];
  const all = a.products.filter((p) => p.key !== "unmapped" || p.metrics.sales.now > 0 || p.metrics.sales.prev > 0);
  const rows = all.map((p) => ({ p, v: judgeProduct({ sales: p.metrics.sales, sellers: p.metrics.creators, videos: p.metrics.videosPosted }) }));
  const sellersAll = all.map((p) => p.metrics.creators.now);
  const tag = TAGS.find((t) => t === raw.tag) ?? (raw.tag === "Fragile" ? "Fragile" : "");
  const countTag = (t: string) => rows.filter((r) => (t === "Fragile" ? r.p.diagnosis.fragile === true : r.p.diagnosis.tag === t)).length;
  const slipping = countTag("Slipping") + countTag("Dying");
  let list = rows.filter((r) => !tag || (tag === "Fragile" ? r.p.diagnosis.fragile === true : r.p.diagnosis.tag === tag));
  if (sort === "sales") list = [...list].sort((x, y) => y.p.metrics.sales.now - x.p.metrics.sales.now);
  if (sort === "drop") list = [...list].sort((x, y) => pctOf(x.p.metrics.sales.now, x.p.metrics.sales.prev) - pctOf(y.p.metrics.sales.now, y.p.metrics.sales.prev));
  if (sort === "growth") list = [...list].sort((x, y) => pctOf(y.p.metrics.sales.now, y.p.metrics.sales.prev) - pctOf(x.p.metrics.sales.now, x.p.metrics.sales.prev));
  const total = { now: rows.reduce((n, r) => n + r.p.metrics.sales.now, 0), prev: rows.reduce((n, r) => n + r.p.metrics.sales.prev, 0) };
  const need = rows.filter((r) => r.v.lever && r.p.metrics.sales.now < r.p.metrics.sales.prev).length;
  const q = { from: raw.from ?? "", to: raw.to ?? "" };
  const hrefFor = (patch: Record<string, string | undefined>) => href("/affiliate/products", { ...q, tag: tag || undefined, sort: sort === "order" ? undefined : sort, ...patch });
  const chip = (on: boolean) => cn("inline-flex h-8 items-center rounded-full border px-3 text-[13.5px] font-medium transition-colors", on ? "border-brand/40 bg-brand-soft text-brand" : "border-line-strong bg-surface text-ink-2 hover:bg-surface-2");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Products"
        description={<span>Each product: how it is doing, why, and what to do. Sales = active creators × videos × sales per video · <span className="tnum">{fmtDayLabel(period.start)} – {fmtFullDay(period.end)}</span> against <span className="tnum">{fmtDayLabel(period.prevStart)} – {fmtFullDay(period.prevEnd)}</span></span>}
        actions={<PeriodPicker from={raw.from ?? ""} to={raw.to ?? ""} today={todayKL()} keep={{ tag: tag, sort: sort === "order" ? "" : sort }} />}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6" data-testid="prod-kpis">
        <div className="rounded-2xl border border-line bg-surface px-4 py-3.5"><p className="text-[13px] font-medium text-ink-3">Affiliate Sales</p><p className="tnum text-[24px] leading-tight font-semibold tracking-tight text-ink">{fmtRM(total.now)}</p><p><Delta now={total.now} prev={total.prev} /></p></div>
        <Link href={hrefFor({ tag: "Growing" })} className="rounded-2xl border border-line bg-surface px-4 py-3.5 hover:bg-surface-2"><p className="text-[13px] font-medium text-ink-3">Growing</p><p className="tnum text-[24px] leading-tight font-semibold tracking-tight text-good">{countTag("Growing")}</p><p className="text-[12.5px] text-ink-3">selling 15% more or better</p></Link>
        <Link href={hrefFor({ tag: slipping && countTag("Dying") ? "Dying" : "Slipping" })} className="rounded-2xl border border-line bg-surface px-4 py-3.5 hover:bg-surface-2"><p className="text-[13px] font-medium text-ink-3">Slipping Or Dying</p><p className={cn("tnum text-[24px] leading-tight font-semibold tracking-tight", slipping ? "text-critical" : "text-ink")}>{slipping}</p><p className="text-[12.5px] text-ink-3">need your attention</p></Link>
        <Link href={hrefFor({ tag: "Fragile" })} className="rounded-2xl border border-line bg-surface px-4 py-3.5 hover:bg-surface-2"><p className="text-[13px] font-medium text-ink-3">Fragile</p><p className={cn("tnum text-[24px] leading-tight font-semibold tracking-tight", countTag("Fragile") ? "text-warn" : "text-ink")}>{countTag("Fragile")}</p><p className="text-[12.5px] text-ink-3">depend on videos over 30 days old</p></Link>
        <div className="rounded-2xl border border-line bg-surface px-4 py-3.5"><p className="text-[13px] font-medium text-ink-3">Products Needing Work</p><p className={cn("tnum text-[24px] leading-tight font-semibold tracking-tight", need ? "text-critical" : "text-ink")}>{need}</p><p className="text-[12.5px] text-ink-3">sales fell and one of the three explains why</p></div>
        <div className="rounded-2xl border border-line bg-surface px-4 py-3.5"><p className="text-[13px] font-medium text-ink-3">Short Of Creators</p><p className="tnum text-[24px] leading-tight font-semibold tracking-tight text-ink">{rows.filter((r) => fewCreators(r.p.metrics.creators.now, sellersAll)).length}</p><p className="text-[12.5px] text-ink-3">far fewer sellers than the rest</p></div>
      </div>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Show" data-testid="prod-tags">
        <Link href={hrefFor({ tag: undefined })} className={chip(!tag)} aria-current={!tag ? "page" : undefined}>All <span className="tnum ml-1.5 opacity-80">{rows.length}</span></Link>
        {[...TAGS, "Fragile" as const].map((t) => <Link key={t} href={hrefFor({ tag: t })} className={chip(tag === t)} aria-current={tag === t ? "page" : undefined}>{t} <span className="tnum ml-1.5 opacity-80">{countTag(t)}</span></Link>)}
      </div>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Sort">
        {SORTS.map((s) => <Link key={s.key} href={hrefFor({ sort: s.key === "order" ? undefined : s.key })} className={chip(sort === s.key)} aria-current={sort === s.key ? "page" : undefined}>{s.label}</Link>)}
      </div>

      <Card>
        {list.length === 0 && <EmptyState title="No Products Here" description="Choose another filter to see more." />}
        <ul data-testid="prod-rows">
          {list.map(({ p, v }) => {
            const m = p.metrics;
            const few = fewCreators(m.creators.now, sellersAll);
            const dMax = v.moves ? Math.max(1, ...v.moves.map((x) => Math.abs(x.effect))) : 1;
            return (
              <li key={p.key} data-testid="prod-row" className="grid grid-cols-1 gap-x-5 gap-y-3 border-b border-line px-5 py-4 last:border-b-0 lg:grid-cols-[minmax(200px,1.1fr)_minmax(250px,1.4fr)_minmax(230px,1.3fr)]">
                <div>
                  <p className="text-[15px] font-semibold text-ink"><OpenProductButton pkey={p.key} label={p.name} className="text-left hover:text-brand" /></p>
                  <p className="mt-1 flex flex-wrap items-center gap-2"><TagBadge tag={p.diagnosis.tag} /><HealthChip fragile={p.diagnosis.fragile} oldPct={p.diagnosis.oldShare} />{few && <Badge tone="warn">Short Of Creators</Badge>}</p>
                  <p className="tnum mt-2 text-[18px] font-semibold text-ink">{fmtRM(m.sales.now)} <Delta now={m.sales.now} prev={m.sales.prev} className="align-middle" /></p>
                  <p className="tnum text-[12.5px] text-ink-3">{m.creators.now} creators sold it{m.videosPosted.now != null ? ` · ${m.videosPosted.now} videos posted` : ""}{m.salesPerNewVideo.now != null ? ` · ${fmtRM(m.salesPerNewVideo.now)} per new video` : ""} · {p.orders.now.toLocaleString("en-MY")} orders</p>
                  {p.diagnosis.tag !== "No Sales" && (
                    <>
                      <div className="mt-2.5 flex items-center gap-3"><div className="min-w-0 flex-1"><MixBar b={m.buckets.now} /></div><div className="w-24 shrink-0"><Sparkline values={p.weekly.map((w) => w.b.new + w.b.recent + w.b.old + w.b.veryold + w.b.live + w.b.other)} tone={p.diagnosis.tag === "Growing" ? "good" : p.diagnosis.tag === "Slipping" ? "warn" : p.diagnosis.tag === "Dying" ? "critical" : "brand"} label="Weekly sales, last 12 weeks" /></div></div>
                      <dl className="mt-2.5 grid grid-cols-3 gap-2 text-[12.5px]">
                        <div><dt className="flex items-center gap-1 text-ink-3"><Users className="size-3.5" />Creators</dt><dd className="tnum text-[14px] font-semibold text-ink">{m.creators.now}<span className={cn("ml-1 text-[12px] font-medium", m.creators.now >= m.creators.prev ? "text-good" : "text-critical")}>{m.creators.now === m.creators.prev ? "" : `${m.creators.now > m.creators.prev ? "+" : "−"}${Math.abs(m.creators.now - m.creators.prev)}`}</span></dd></div>
                        <div><dt className="flex items-center gap-1 text-ink-3"><Video className="size-3.5" />New Videos</dt><dd className="tnum text-[14px] font-semibold text-ink">{m.videosPosted.now ?? "–"}{m.videosPosted.now != null && m.videosPosted.prev != null && m.videosPosted.now !== m.videosPosted.prev && <span className={cn("ml-1 text-[12px] font-medium", m.videosPosted.now >= m.videosPosted.prev ? "text-good" : "text-critical")}>{m.videosPosted.now > m.videosPosted.prev ? "+" : "−"}{Math.abs(m.videosPosted.now - m.videosPosted.prev)}</span>}</dd></div>
                        <div title="Share of new videos that made 3 or more orders within 14 days"><dt className="text-ink-3">Converting</dt><dd className="tnum text-[14px] font-semibold text-ink">{p.newContent.now.rate == null ? "–" : p.newContent.now.rate > 0 && p.newContent.now.rate < 1 ? "<1%" : `${Math.round(p.newContent.now.rate)}%`}</dd></div>
                      </dl>
                    </>
                  )}
                </div>
                <div>
                  {v.moves ? (
                    <ul className="space-y-1.5" aria-label="What moved sales">
                      {v.moves.map((x) => (
                        <li key={x.key} className="grid grid-cols-[120px_1fr_80px] items-center gap-2 text-[12.5px]">
                          <span className="text-ink-2">{x.label}</span>
                          <span className="relative h-3.5 rounded bg-surface-2"><span className={cn("absolute top-0 h-full rounded", x.effect >= 0 ? "bg-good/70" : "bg-critical/70")} style={{ width: `${(Math.abs(x.effect) / dMax) * 50}%`, [x.effect >= 0 ? "left" : "right"]: "50%" }} /><span className="absolute inset-y-0 left-1/2 w-px bg-line" /></span>
                          <span className={cn("tnum text-right font-semibold", x.effect >= 0 ? "text-good" : "text-critical")}>{rmShort(x.effect)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="text-[12.5px] text-ink-3">The split needs the video count for both periods, which is not available for these dates.</p>}
                </div>
                <div>
                  <p className="text-[13.5px] leading-snug text-ink" data-testid="prod-headline">{v.headline}</p>
                  {p.diagnosis.reasons[0] && <p className="mt-1.5 flex items-start gap-2 text-[13px] leading-snug text-ink-2"><span className={cn("mt-1.5 size-2 shrink-0 rounded-full", p.diagnosis.reasons[0].tone === "good" ? "bg-good" : p.diagnosis.reasons[0].tone === "bad" ? "bg-critical" : p.diagnosis.reasons[0].tone === "warn" ? "bg-warn" : "bg-ink-3")} />{p.diagnosis.reasons[0].text}</p>}
                  <p className="mt-2 flex flex-wrap gap-2 text-[13px]">
                    <Link href={href("/affiliate/actions", { product: p.key, lever: v.lever ?? undefined })} className="inline-flex items-center rounded-full border border-brand bg-brand/10 px-2.5 py-0.5 font-semibold text-brand hover:bg-brand hover:text-white">Actions For This Product</Link>
                    <Link href={href("/creators", { product: p.key })} className="inline-flex items-center rounded-full border border-line px-2.5 py-0.5 font-medium text-ink-2 hover:bg-surface-2">Its Creators</Link>
                    <Link href={href("/affiliate/content", { product: p.key })} className="inline-flex items-center rounded-full border border-line px-2.5 py-0.5 font-medium text-ink-2 hover:bg-surface-2">Its Videos</Link>
                    <Link href={href(`/products/${p.key}`, {})} className="inline-flex items-center rounded-full border border-line px-2.5 py-0.5 font-medium text-ink-2 hover:bg-surface-2">Full Analysis</Link>
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <div className="flex items-center gap-1.5 px-1 text-[15px] font-medium text-ink">How To Read This<InfoTip side="top" width={440} label="How To Read This"><div className="space-y-3 text-[13px] text-ink-2">
        <div><p className="mb-1.5 font-semibold text-ink">The coloured bar: where the sales came from</p><Legend /><ul className="mt-2 space-y-0.5 text-[13px] text-ink-3">{BUCKETS.map((b) => <li key={b.key}><b className="text-ink-2">{b.label}</b>: {b.hint}</li>)}</ul></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><p className="mb-1 font-semibold text-ink">Tags (this period against the one before)</p><ul className="space-y-0.5 text-[13px]"><li><b>Growing</b>: sales up 15% or more</li><li><b>Steady</b>: between −15% and +15%</li><li><b>Slipping</b>: down 15% or more</li><li><b>Dying</b>: down 50% or more, or no new video while sales fall</li></ul></div>
          <div><p className="mb-1 font-semibold text-ink">Fragile or Healthy</p><p className="text-[13px]">Fragile means more than 70% of video and LIVE sales come from videos older than 30 days. Healthy means fresh content is carrying it.</p><p className="mt-2 mb-1 font-semibold text-ink">The three bars</p><p className="text-[13px]">Active creators, videos per creator and sales per video: how much of the sales change each one explains.</p></div>
        </div>
      </div></InfoTip></div>
    </div>
  );
}
