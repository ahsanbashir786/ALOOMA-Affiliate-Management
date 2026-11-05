import type { Metadata } from "next";
import Link from "next/link";
import { Package, Users, Video } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { analyseProducts, type ProductAnalysis } from "@/lib/products/analysis";
import { hasSyncedData } from "@/lib/creators/load";
import { parseRange } from "@/lib/creators/params";
import { BUCKETS } from "@/lib/products/diagnose";
import { fmtDayLabel, fmtFullDay, todayKL } from "@/lib/time";
import { href, one, type SP } from "@/lib/url";
import { Card, EmptyState, PageHeader, buttonClasses } from "@/components/ui/primitives";
import { Sparkline } from "@/components/viz/sparkline";
import { PeriodPicker } from "@/components/products/period-picker";
import { Delta, HealthChip, Legend, MixBar, TagBadge } from "@/components/products/ui";
import { cn, fmtRM } from "@/lib/utils";

export const metadata: Metadata = { title: "Products" };

const TAGS = ["Growing", "Steady", "Slipping", "Dying"] as const;
const SORTS = [
  { key: "order", label: "Your Order" },
  { key: "sales", label: "Biggest Sales" },
  { key: "drop", label: "Biggest Drop" },
  { key: "growth", label: "Biggest Growth" },
] as const;
const pct = (p: ProductAnalysis) => p.diagnosis.changePct ?? (p.metrics.sales.now > 0 ? 1e9 : 0);

function Card13({ p, q }: { p: ProductAnalysis; q: Record<string, string> }) {
  const m = p.metrics;
  const spark = p.weekly.map((w) => w.b.new + w.b.recent + w.b.old + w.b.live + w.b.other);
  const tone = p.diagnosis.tag === "Growing" ? "good" : p.diagnosis.tag === "Steady" ? "brand" : p.diagnosis.tag === "Slipping" ? "warn" : p.diagnosis.tag === "Dying" ? "critical" : "brand";
  const r = p.diagnosis.reasons[0];
  const hit = p.newContent.now.rate;
  return (
    <Link href={href(`/products/${p.key}`, q)} data-testid={`product-${p.key}`} className="group flex min-w-0 flex-col rounded-2xl border border-line bg-surface p-5 transition-all hover:-translate-y-0.5 hover:border-line-strong hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 text-[16.5px] leading-snug font-semibold text-ink group-hover:text-brand">{p.name}</h3>
        <TagBadge tag={p.diagnosis.tag} />
      </div>
      {p.diagnosis.tag === "No Sales" ? (
        <p className="mt-6 mb-2 text-[14px] text-ink-3">No sales in this period or the one before.</p>
      ) : (
        <>
          <div className="mt-3 flex items-end justify-between gap-3">
            <div>
              <p className="tnum text-[28px] leading-tight font-semibold tracking-tight text-ink">{fmtRM(m.sales.now)}</p>
              <Delta now={m.sales.now} prev={m.sales.prev} />
            </div>
            <div className="w-28 shrink-0"><Sparkline values={spark} tone={tone} label="Weekly sales, last 12 weeks" /></div>
          </div>
          <div className="mt-3 flex items-center gap-2"><MixBar b={m.buckets.now} /></div>
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <HealthChip fragile={p.diagnosis.fragile} oldPct={p.diagnosis.oldShare != null ? p.diagnosis.oldShare * 100 : null} />
            <span className="tnum text-[12.5px] text-ink-3">{p.orders.now.toLocaleString("en-MY")} orders</span>
          </div>
          <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-3 text-[12.5px]">
            <div><dt className="flex items-center gap-1 text-ink-3"><Users className="size-3.5" />Creators</dt><dd className="tnum mt-0.5 text-[15px] font-semibold text-ink">{m.creators.now}<span className={cn("ml-1 text-[12px] font-medium", m.creators.now >= m.creators.prev ? "text-good" : "text-critical")}>{m.creators.now === m.creators.prev ? "" : `${m.creators.now > m.creators.prev ? "+" : "−"}${Math.abs(m.creators.now - m.creators.prev)}`}</span></dd></div>
            <div><dt className="flex items-center gap-1 text-ink-3"><Video className="size-3.5" />New Videos</dt><dd className="tnum mt-0.5 text-[15px] font-semibold text-ink">{m.videosPosted.now ?? "–"}{m.videosPosted.now != null && m.videosPosted.prev != null && m.videosPosted.now !== m.videosPosted.prev && <span className={cn("ml-1 text-[12px] font-medium", m.videosPosted.now >= m.videosPosted.prev ? "text-good" : "text-critical")}>{m.videosPosted.now > m.videosPosted.prev ? "+" : "−"}{Math.abs(m.videosPosted.now - m.videosPosted.prev)}</span>}</dd></div>
            <div title={`Share of new videos that made 3 or more orders within 14 days`}><dt className="text-ink-3">Converting</dt><dd className="tnum mt-0.5 text-[15px] font-semibold text-ink">{hit != null ? `${Math.round(hit)}%` : "–"}</dd></div>
          </dl>
          {r && <p className="mt-3 flex items-start gap-2 text-[13.5px] leading-snug text-ink-2"><span className={cn("mt-1.5 size-2 shrink-0 rounded-full", r.tone === "good" ? "bg-good" : r.tone === "bad" ? "bg-critical" : r.tone === "warn" ? "bg-warn" : "bg-ink-3")} />{r.text}</p>}
        </>
      )}
    </Link>
  );
}

export default async function ProductsPage({ searchParams }: PageProps<"/products">) {
  await requireUser();
  const sp = (await searchParams) as SP;
  const raw = Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, one(v)]));
  if (!(await hasSyncedData())) {
    return (
      <div className="space-y-6">
        <PageHeader title="Products" />
        <Card><EmptyState icon={<Package className="size-5" />} title="No TikTok data yet" description="Connect TikTok Shop and run Data Sync. Your products appear here as soon as the first orders arrive." action={<Link href="/sync" className={buttonClasses({ variant: "primary" })}>Open Data Sync</Link>} /></Card>
      </div>
    );
  }
  const range = parseRange(raw);
  const a = await analyseProducts(range);
  const { period } = a;
  const tag = TAGS.find((t) => t === raw.tag) ?? (raw.tag === "Fragile" ? "Fragile" : "");
  const sort = (SORTS.find((s) => s.key === raw.sort)?.key ?? "order") as (typeof SORTS)[number]["key"];
  const q: Record<string, string> = { from: raw.from ?? "", to: raw.to ?? "" };
  const all = a.products.filter((p) => p.key !== "unmapped" || p.metrics.sales.now > 0 || p.metrics.sales.prev > 0);
  const count = (t: string) => all.filter((p) => (t === "Fragile" ? p.diagnosis.fragile === true : p.diagnosis.tag === t)).length;
  let list = all.filter((p) => !tag || (tag === "Fragile" ? p.diagnosis.fragile === true : p.diagnosis.tag === tag));
  if (sort === "sales") list = [...list].sort((x, y) => y.metrics.sales.now - x.metrics.sales.now);
  if (sort === "drop") list = [...list].sort((x, y) => x.diagnosis.change - y.diagnosis.change);
  if (sort === "growth") list = [...list].sort((x, y) => pct(y) - pct(x) || y.diagnosis.change - x.diagnosis.change);
  const total = { now: all.reduce((n, p) => n + p.metrics.sales.now, 0), prev: all.reduce((n, p) => n + p.metrics.sales.prev, 0) };
  const chip = (on: boolean) => cn("inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13.5px] font-medium transition-colors", on ? "border-brand bg-brand text-white" : "border-line-strong bg-surface text-ink-2 hover:bg-surface-2");
  const hrefFor = (patch: Record<string, string>) => href("/products", { ...q, tag: tag, sort: sort === "order" ? "" : sort, ...patch });
  const slipping = count("Slipping") + count("Dying");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Products"
        description={<span>Where each product is growing or lagging, and why · <span className="tnum">{fmtDayLabel(period.start)} – {fmtFullDay(period.end)}</span> compared with <span className="tnum">{fmtDayLabel(period.prevStart)} – {fmtFullDay(period.prevEnd)}</span></span>}
        actions={<PeriodPicker from={raw.from ?? ""} to={raw.to ?? ""} today={todayKL()} keep={{ tag: tag, sort: sort === "order" ? "" : sort }} />}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Products at a glance" data-testid="product-kpis">
        {[
          { l: "Total Sales", v: fmtRM(total.now), sub: <Delta now={total.now} prev={total.prev} />, to: hrefFor({ tag: "" }) },
          { l: "Growing", v: String(count("Growing")), sub: <span className="text-[12.5px] text-ink-3">selling 15% more or better</span>, to: hrefFor({ tag: "Growing" }), tone: "text-good" },
          { l: "Slipping Or Dying", v: String(slipping), sub: <span className="text-[12.5px] text-ink-3">need your attention</span>, to: hrefFor({ tag: slipping && count("Dying") ? "Dying" : "Slipping" }), tone: slipping ? "text-critical" : "" },
          { l: "Fragile", v: String(count("Fragile")), sub: <span className="text-[12.5px] text-ink-3">depend on videos over 30 days old</span>, to: hrefFor({ tag: "Fragile" }), tone: count("Fragile") ? "text-warn" : "" },
        ].map((k) => (
          <Link key={k.l} href={k.to} className="rounded-2xl border border-line bg-surface px-4 py-3.5 transition-colors hover:bg-surface-2">
            <p className="text-[13px] font-medium text-ink-3">{k.l}</p>
            <p className={cn("tnum text-[26px] leading-tight font-semibold tracking-tight text-ink", k.tone)}>{k.v}</p>
            <p>{k.sub}</p>
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Show">
          <Link href={hrefFor({ tag: "" })} className={chip(!tag)} aria-current={!tag ? "page" : undefined}>All <span className="tnum opacity-80">{all.length}</span></Link>
          {[...TAGS, "Fragile" as const].map((t) => <Link key={t} href={hrefFor({ tag: t })} className={chip(tag === t)} aria-current={tag === t ? "page" : undefined}>{t} <span className="tnum opacity-80">{count(t)}</span></Link>)}
        </div>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Sort">
          <span className="text-[13px] text-ink-3">Sort</span>
          {SORTS.map((s) => <Link key={s.key} href={hrefFor({ sort: s.key === "order" ? "" : s.key })} className={chip(sort === s.key)} aria-current={sort === s.key ? "page" : undefined}>{s.label}</Link>)}
        </div>
      </div>

      {list.length === 0 ? (
        <Card><EmptyState title="No Products Here" description="Choose another filter to see more." /></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" data-testid="product-grid">{list.map((p) => <Card13 key={p.key} p={p} q={q} />)}</div>
      )}

      <details className="rounded-xl border border-line bg-surface">
        <summary className="cursor-pointer px-5 py-4 text-[15px] font-medium text-ink">How To Read This</summary>
        <div className="space-y-4 px-5 pb-5 text-[14px] text-ink-2">
          <div><p className="mb-1.5 font-semibold text-ink">The coloured bar: where the sales came from</p><Legend /><ul className="mt-2 space-y-0.5 text-[13px] text-ink-3">{BUCKETS.map((b) => <li key={b.key}><b className="text-ink-2">{b.label}</b>: {b.hint}</li>)}</ul></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><p className="mb-1 font-semibold text-ink">Tags (this period against the one before)</p><ul className="space-y-0.5 text-[13px]"><li><b>Growing</b>: sales up 15% or more</li><li><b>Steady</b>: between −15% and +15%</li><li><b>Slipping</b>: down 15% or more</li><li><b>Dying</b>: down 50% or more, or no new video while sales fall</li></ul></div>
            <div><p className="mb-1 font-semibold text-ink">Fragile or Healthy</p><p className="text-[13px]">Fragile means more than 70% of video and LIVE sales come from videos older than 30 days: it lives on old content. Healthy means fresh content is carrying it.</p><p className="mt-2 mb-1 font-semibold text-ink">Converting</p><p className="text-[13px]">The share of new videos that made 3 or more orders within 14 days of being posted.</p></div>
          </div>
          <p className="text-[13px] text-ink-3">Posting dates come from TikTok&apos;s video list. For videos missing from it, the first sale date is used and the number is an estimate{a.estimatedSharePct != null ? ` (${Math.round(a.estimatedSharePct)}% of this period’s video and LIVE sales)` : ""}.</p>
        </div>
      </details>
    </div>
  );
}
