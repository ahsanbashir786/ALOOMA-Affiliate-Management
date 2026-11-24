import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDownUp, ChevronRight, Package, UsersRound, Wallet, Wrench } from "lucide-react";
import { ChangePill, StatTile } from "@/components/ui/stat-tile";
import { TAG_ICON } from "@/components/ui/icon-set";
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
import { cn, fmtCompact, fmtRM } from "@/lib/utils";

export const metadata: Metadata = { title: "Products" };
const GRID = "lg:grid-cols-[minmax(220px,1.6fr)_minmax(120px,0.9fr)_120px_90px_100px_90px_100px]";
const TAGS = ["Growing", "Steady", "Slipping", "Dying"] as const;
const SORTS = [{ key: "order", label: "Your Order" }, { key: "sales", label: "Biggest Sales" }, { key: "drop", label: "Biggest Drop" }, { key: "growth", label: "Biggest Growth" }] as const;
const sign = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "");
const rmShort = (n: number) => `${sign(n)}RM ${Math.abs(Math.round(n)).toLocaleString("en-MY")}`;
const pctOf = (now: number, prev: number) => (prev > 0 ? (now - prev) / prev : now > 0 ? 9 : 0);

export default async function AffiliateProductsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { denied } = await gate(["creators", "products"], "Products");
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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" data-testid="prod-kpis">
        <StatTile icon={Wallet} tone="good" label="Affiliate Sales" value={`RM ${fmtCompact(total.now)}`} change={<ChangePill now={total.now} before={total.prev} />} note="this period" />
        <StatTile icon={Wrench} tone="critical" valueTone={need ? "critical" : undefined} label="Products Needing Work" value={need} note="sales fell, cause known" />
        <StatTile icon={UsersRound} tone="warn" label="Short Of Creators" value={rows.filter((r) => fewCreators(r.p.metrics.creators.now, sellersAll)).length} note="far fewer sellers" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Show" data-testid="prod-tags">
          <Link href={hrefFor({ tag: undefined })} className={chip(!tag)} aria-current={!tag ? "page" : undefined}>All <span className="tnum ml-1.5 opacity-80">{rows.length}</span></Link>
          {[...TAGS, "Fragile" as const].map((t) => { const I = TAG_ICON[t]; return <Link key={t} href={hrefFor({ tag: t })} className={chip(tag === t)} aria-current={tag === t ? "page" : undefined}>{I && <I className="mr-1 size-3.5" aria-hidden />}{t} <span className="tnum ml-1.5 opacity-80">{countTag(t)}</span></Link>; })}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]" role="group" aria-label="Sort">
          <span className="inline-flex items-center gap-1 text-ink-3"><ArrowDownUp className="size-3.5" />Sort</span>
          {SORTS.map((x) => <Link key={x.key} href={hrefFor({ sort: x.key === "order" ? undefined : x.key })} aria-current={sort === x.key ? "page" : undefined} className={sort === x.key ? "font-semibold text-brand" : "text-ink-2 hover:text-brand"}>{x.label}</Link>)}
        </div>
      </div>

      <Card>
        {list.length === 0 && <EmptyState title="No Products Here" description="Choose another filter to see more." />}
        {list.length > 0 && (
          <div className={cn("hidden gap-x-4 border-b border-line px-5 py-2.5 text-[12.5px] font-medium text-ink-3 lg:grid", GRID)} data-testid="prod-head">
            <span>Product</span><span>Sales</span><span>12 Weeks</span><span>Creators</span><span>New Videos</span><span title="Share of new videos with 3+ orders in 14 days">Converting</span><span />
          </div>
        )}
        <ul data-testid="prod-rows">
          {list.map(({ p, v }) => {
            const m = p.metrics;
            const few = fewCreators(m.creators.now, sellersAll);
            const dMax = v.moves ? Math.max(1, ...v.moves.map((x) => Math.abs(x.effect))) : 1;
            const top = v.moves ? [...v.moves].sort((x, y) => Math.abs(y.effect) - Math.abs(x.effect))[0] : null;
            const diff = (now: number | null, prev: number | null) => (now == null || prev == null || now === prev ? null : <span className={cn("ml-1 text-[12px] font-medium", now > prev ? "text-good" : "text-critical")}>{now > prev ? "+" : "−"}{Math.abs(now - prev)}</span>);
            return (
              <li key={p.key} data-testid="prod-row" className="border-b border-line last:border-b-0">
                <div className={cn("grid grid-cols-2 items-center gap-x-4 gap-y-2 px-5 pt-3.5 lg:grid", GRID)}>
                  <div className="col-span-2 min-w-0 lg:col-span-1">
                    <p className="truncate text-[15px] font-semibold text-ink"><OpenProductButton pkey={p.key} label={p.name} className="text-left hover:text-brand" /></p>
                    <p className="mt-1 flex flex-wrap items-center gap-1.5"><TagBadge tag={p.diagnosis.tag} /><HealthChip fragile={p.diagnosis.fragile} oldPct={p.diagnosis.oldShare} />{few && <Badge tone="warn">Short Of Creators</Badge>}</p>
                  </div>
                  <div className="tnum"><p className="text-[16px] font-semibold text-ink">{fmtRM(m.sales.now)}</p><p className="text-[12px]"><Delta now={m.sales.now} prev={m.sales.prev} /> <span className="text-ink-3">· {p.orders.now.toLocaleString("en-MY")} orders</span></p></div>
                  <div className="w-full max-w-[120px]">{p.diagnosis.tag !== "No Sales" && <Sparkline values={p.weekly.map((w) => w.b.new + w.b.recent + w.b.old + w.b.veryold + w.b.live + w.b.other)} tone={p.diagnosis.tag === "Growing" ? "good" : p.diagnosis.tag === "Slipping" ? "warn" : p.diagnosis.tag === "Dying" ? "critical" : "brand"} label="Weekly sales, last 12 weeks" />}</div>
                  <p className="tnum text-[14px] font-semibold text-ink"><span className="mr-1 text-[12px] font-normal text-ink-3 lg:hidden">Creators</span>{m.creators.now}{diff(m.creators.now, m.creators.prev)}</p>
                  <p className="tnum text-[14px] font-semibold text-ink"><span className="mr-1 text-[12px] font-normal text-ink-3 lg:hidden">New Videos</span>{m.videosPosted.now ?? "–"}{diff(m.videosPosted.now, m.videosPosted.prev)}</p>
                  <p className="tnum text-[14px] font-semibold text-ink"><span className="mr-1 text-[12px] font-normal text-ink-3 lg:hidden">Converting</span>{p.newContent.now.rate == null ? "–" : p.newContent.now.rate > 0 && p.newContent.now.rate < 1 ? "<1%" : `${Math.round(p.newContent.now.rate)}%`}</p>
                  <div className="col-span-2 lg:col-span-1 lg:text-right"><Link href={href("/affiliate/actions", { product: p.key, lever: v.lever ?? undefined })} className="inline-flex h-8 items-center rounded-lg border border-brand bg-brand/10 px-3 text-[13px] font-semibold text-brand hover:bg-brand hover:text-white">Actions</Link></div>
                </div>
                <details className="group px-5 pt-1.5 pb-3">
                  <summary className="flex cursor-pointer list-none items-center gap-2 text-[13px] text-ink-2 [&::-webkit-details-marker]:hidden">
                    <ChevronRight className="size-4 shrink-0 text-ink-3 transition-transform group-open:rotate-90" />
                    {top && <span className={cn("tnum shrink-0 rounded-full px-2 py-0.5 text-[12px] font-semibold", top.effect >= 0 ? "bg-good-soft text-good" : "bg-critical-soft text-critical")}>{top.label} {rmShort(top.effect)}</span>}
                    <span className="min-w-0 truncate" data-testid="prod-headline">{v.headline}</span>
                  </summary>
                  <div className="mt-3 grid grid-cols-1 gap-x-8 gap-y-4 rounded-xl bg-surface-2/60 p-4 lg:grid-cols-2">
                    <div>
                      <p className="mb-2 text-[12.5px] font-semibold text-ink-2">What moved sales</p>
                      {v.moves ? (
                        <ul className="space-y-1.5" aria-label="What moved sales">
                          {v.moves.map((x) => (
                            <li key={x.key} className="grid grid-cols-[120px_1fr_80px] items-center gap-2 text-[12.5px]">
                              <span className="text-ink-2">{x.label}</span>
                              <span className="relative h-3.5 rounded bg-surface"><span className={cn("absolute top-0 h-full rounded", x.effect >= 0 ? "bg-good/70" : "bg-critical/70")} style={{ width: `${(Math.abs(x.effect) / dMax) * 50}%`, [x.effect >= 0 ? "left" : "right"]: "50%" }} /><span className="absolute inset-y-0 left-1/2 w-px bg-line" /></span>
                              <span className={cn("tnum text-right font-semibold", x.effect >= 0 ? "text-good" : "text-critical")}>{rmShort(x.effect)}</span>
                            </li>
                          ))}
                        </ul>
                      ) : <p className="text-[12.5px] text-ink-3">Needs the video count for both periods, not available for these dates.</p>}
                    </div>
                    <div>
                      <p className="mb-2 text-[12.5px] font-semibold text-ink-2">Where sales came from (video age)</p>
                      {p.diagnosis.tag !== "No Sales" && <MixBar b={m.buckets.now} />}
                      {p.diagnosis.reasons[0] && <p className="mt-2 flex items-start gap-2 text-[13px] leading-snug text-ink-2"><span className={cn("mt-1.5 size-2 shrink-0 rounded-full", p.diagnosis.reasons[0].tone === "good" ? "bg-good" : p.diagnosis.reasons[0].tone === "bad" ? "bg-critical" : p.diagnosis.reasons[0].tone === "warn" ? "bg-warn" : "bg-ink-3")} />{p.diagnosis.reasons[0].text}</p>}
                      <p className="tnum mt-2 text-[12px] text-ink-3">{m.salesPerNewVideo.now != null ? `${fmtRM(m.salesPerNewVideo.now)} per new video` : ""}</p>
                      <p className="mt-3 flex flex-wrap gap-2 text-[13px]">
                        <Link href={href("/creators", { product: p.key })} className="inline-flex items-center rounded-full border border-line bg-surface px-2.5 py-0.5 font-medium text-ink-2 hover:text-brand">Its Creators</Link>
                        <Link href={href("/affiliate/content", { product: p.key })} className="inline-flex items-center rounded-full border border-line bg-surface px-2.5 py-0.5 font-medium text-ink-2 hover:text-brand">Its Videos</Link>
                        <Link href={href(`/products/${p.key}`, {})} className="inline-flex items-center rounded-full border border-line bg-surface px-2.5 py-0.5 font-medium text-ink-2 hover:text-brand">Full Analysis</Link>
                      </p>
                    </div>
                  </div>
                </details>
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
