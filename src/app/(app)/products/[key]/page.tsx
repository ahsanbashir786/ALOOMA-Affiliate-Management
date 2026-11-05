import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, ExternalLink, Info, TrendingDown, TrendingUp } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { productName } from "@/lib/products/catalog";
import { analyseProducts, type Funnel, type NewContent, type ProductAnalysis } from "@/lib/products/analysis";
import { parseRange } from "@/lib/creators/params";
import { BUCKETS, HIT_ORDERS, HIT_WINDOW, type Bucket } from "@/lib/products/diagnose";
import { fmtDayLabel, fmtFullDay, todayKL } from "@/lib/time";
import { href, one, type SP } from "@/lib/url";
import { Section } from "@/components/viz/section";
import { Badge } from "@/components/ui/primitives";
import { PeriodPicker } from "@/components/products/period-picker";
import { AgeChart, WeeklyMixChart } from "@/components/products/charts";
import { BUCKET_COLOR, Delta, HealthChip, Legend, MixBar, TagBadge, bucketHint, bucketLabel } from "@/components/products/ui";
import { cn, fmtCompact, fmtRM } from "@/lib/utils";

export async function generateMetadata({ params }: PageProps<"/products/[key]">): Promise<Metadata> {
  const { key } = await params;
  return { title: productName(key) || "Product" };
}

const ORDER: Bucket[] = ["new", "recent", "old", "veryold", "live", "other"];
const pct = (n: number | null) => (n == null ? "–" : `${Math.round(n)}%`);

function Tile({ label, value, sub, hint }: { label: string; value: React.ReactNode; sub?: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3" title={hint}>
      <p className="text-[12.5px] font-medium text-ink-3">{label}</p>
      <p className="tnum text-[22px] leading-tight font-semibold text-ink">{value}</p>
      {sub && <div className="text-[12.5px] text-ink-3">{sub}</div>}
    </div>
  );
}

function WhyMoved({ p }: { p: ProductAnalysis }) {
  const rows = ORDER.map((b) => ({ b, now: p.metrics.buckets.now[b], prev: p.metrics.buckets.prev[b] }));
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.now - r.prev)));
  return (
    <ul className="space-y-3" data-testid="why-moved">
      {rows.map((r) => {
        const d = r.now - r.prev, w = (Math.abs(d) / max) * 50;
        return (
          <li key={r.b} className="grid grid-cols-[minmax(110px,150px)_1fr_minmax(120px,170px)] items-center gap-3 text-[13.5px]" title={bucketHint(r.b)}>
            <span className="flex items-center gap-2 text-ink-2"><span className="size-2.5 shrink-0 rounded-sm" style={{ background: BUCKET_COLOR[r.b] }} />{bucketLabel(r.b)}</span>
            <span className="relative h-5 rounded bg-surface-2">
              <span className="absolute top-0 bottom-0 left-1/2 w-px bg-line-strong" />
              {d !== 0 && <span className={cn("absolute top-1 bottom-1 rounded-sm", d > 0 ? "bg-good" : "bg-critical")} style={d > 0 ? { left: "50%", width: `${w}%` } : { right: "50%", width: `${w}%` }} />}
            </span>
            <span className="tnum text-right"><b className={cn("font-semibold", d > 0 ? "text-good" : d < 0 ? "text-critical" : "text-ink-3")}>{d === 0 ? "no change" : `${d > 0 ? "+" : "−"}${fmtRM(Math.abs(d))}`}</b><span className="block text-[12px] text-ink-3">{fmtRM(r.now)} now · {fmtRM(r.prev)} before</span></span>
          </li>
        );
      })}
    </ul>
  );
}

function NewContentCard({ p, covered }: { p: ProductAnalysis; covered: boolean }) {
  const n = p.newContent.now, o = p.newContent.prev;
  if (!covered) return <p className="text-[14px] text-ink-3">TikTok&apos;s video list does not reach back to this period, so new-video conversion cannot be judged. The sales split by content age above still works, from the order data.</p>;
  const col = (c: NewContent, label: string, main: boolean) => (
    <div className={cn("rounded-xl p-4", main ? "bg-surface-2" : "border border-line")}>
      <p className="text-[12.5px] font-medium text-ink-3">{label}</p>
      <p className="tnum text-[34px] leading-none font-semibold text-ink">{pct(c.rate)}</p>
      <p className="mt-1 text-[13px] text-ink-3">{c.matured > 0 ? `${c.converting} of ${c.matured} new videos made ${HIT_ORDERS}+ orders in ${HIT_WINDOW} days` : "No new video old enough to judge"}</p>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-[12.5px]">
        <div><dt className="text-ink-3">Sales / video</dt><dd className="tnum font-semibold text-ink">{c.salesPerVideo != null ? fmtRM(c.salesPerVideo) : "–"}</dd></div>
        <div><dt className="text-ink-3">Views / video</dt><dd className="tnum font-semibold text-ink">{c.views != null ? fmtCompact(c.views) : "–"}</dd></div>
        <div><dt className="text-ink-3">Click rate</dt><dd className="tnum font-semibold text-ink">{c.ctr != null ? `${c.ctr.toFixed(1)}%` : "–"}</dd></div>
      </dl>
    </div>
  );
  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2" data-testid="new-content">{col(n, "This Period", true)}{col(o, "Before", false)}</div>
      <p className="mt-3 text-[12.5px] text-ink-3">Only videos posted at least {HIT_WINDOW} days before the period ends are judged, so each has had a fair chance. A new video &quot;converts&quot; with {HIT_ORDERS} or more orders of this product within {HIT_WINDOW} days of posting.</p>
    </div>
  );
}

function FunnelView({ f, o }: { f: Funnel; o: Funnel }) {
  const steps = [
    { l: "Samples Sent", v: f.sent, pv: o.sent },
    { l: "Delivered", v: f.delivered, pv: o.delivered },
    { l: "Posted A Video", v: f.posted, pv: o.posted, hint: "A video of the product after delivery, or sales of it" },
    { l: "Sold It", v: f.sold, pv: o.sold },
  ];
  if (f.sent === 0 && o.sent === 0) return <p className="text-[14px] text-ink-3">No samples of this product were sent in this period or the one before.</p>;
  return (
    <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]" data-testid="funnel">
      <ul className="space-y-2.5">
        {steps.map((s, i) => (
          <li key={s.l} title={s.hint}>
            <div className="mb-1 flex items-baseline justify-between text-[13.5px]"><span className="text-ink-2">{s.l}</span><span className="tnum"><b className="font-semibold text-ink">{s.v}</b>{i > 0 && steps[i - 1].v > 0 && <span className="ml-1.5 text-ink-3">{Math.round((s.v / steps[i - 1].v) * 100)}% of the step before</span>}<span className="ml-2 text-[12px] text-ink-3">(before: {s.pv})</span></span></div>
            <div className="h-3 rounded-full bg-surface-2"><div className="h-3 rounded-full" style={{ width: `${f.sent ? (s.v / f.sent) * 100 : 0}%`, background: i === 0 ? "var(--brand)" : i === 1 ? "var(--s1)" : i === 2 ? "var(--s3)" : "var(--good)" }} /></div>
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-2 content-start gap-3">
        <Tile label="Sales Per Sample" value={f.salesPerSample != null ? fmtRM(f.salesPerSample) : "–"} sub="within 45 days of delivery" hint="Sales of this product by the creator in the 45 days after the sample was delivered" />
        <Tile label="Days To First Sale" value={f.medianDays != null ? `${f.medianDays}` : "–"} sub="median, from delivery" />
        <Tile label="Never Posted" value={<span className={f.notPosted > 0 ? "text-critical" : ""}>{f.notPosted}</span>} sub="delivered 14+ days ago" />
        <Tile label="Samples Sold" value={f.delivered ? `${Math.round((f.sold / f.delivered) * 100)}%` : "–"} sub="of delivered" />
      </div>
    </div>
  );
}

export default async function ProductPage({ params, searchParams }: PageProps<"/products/[key]">) {
  await requireUser();
  const { key } = await params;
  const sp = (await searchParams) as SP;
  const raw = Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, one(v)]));
  const a = await analyseProducts(parseRange(raw));
  const shown = a.products.filter((x) => x.key !== "unmapped" || x.metrics.sales.now > 0 || x.metrics.sales.prev > 0);
  const i = shown.findIndex((x) => x.key === key);
  if (i < 0) notFound();
  const p = shown[i];
  const prev = shown[(i + shown.length - 1) % shown.length], next = shown[(i + 1) % shown.length];
  const q: Record<string, string> = { from: raw.from ?? "", to: raw.to ?? "" };
  const m = p.metrics, d = p.diagnosis, per = a.period;
  const covered = a.videoCoverFrom != null && per.start >= a.videoCoverFrom;
  const noSales = d.tag === "No Sales";
  const weekly = p.weekly.map((w) => ({ label: fmtDayLabel(w.start), ...w.b }));
  const cs = p.creatorStats;
  const split = { video: m.buckets.now.new + m.buckets.now.recent + m.buckets.now.old + m.buckets.now.veryold, live: m.buckets.now.live, other: m.buckets.now.other };
  const splitPrev = { video: m.buckets.prev.new + m.buckets.prev.recent + m.buckets.prev.old + m.buckets.prev.veryold, live: m.buckets.prev.live, other: m.buckets.prev.other };
  const total = split.video + split.live + split.other;
  const fresh = d.oldShare != null ? (1 - d.oldShare) * 100 : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 text-[14px]">
        <Link href={href("/products", q)} className="inline-flex items-center gap-1.5 text-ink-3 hover:text-ink"><ArrowLeft className="size-4" /> Product Analysis</Link>
        <span className="flex items-center gap-4 text-ink-3">
          <Link href={href(`/products/${prev.key}`, q)} className="inline-flex max-w-[200px] items-center gap-1 truncate hover:text-ink" title={prev.name}><ArrowLeft className="size-4 shrink-0" /><span className="truncate">{prev.name}</span></Link>
          <Link href={href(`/products/${next.key}`, q)} className="inline-flex max-w-[200px] items-center gap-1 truncate hover:text-ink" title={next.name}><span className="truncate">{next.name}</span><ArrowRight className="size-4 shrink-0" /></Link>
        </span>
      </div>

      <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6" data-testid="product-head">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-[26px] leading-tight font-semibold tracking-tight text-ink">{p.name}</h1>
            <p className="mt-1 text-[13.5px] text-ink-3"><span className="tnum">{fmtDayLabel(per.start)} – {fmtFullDay(per.end)}</span> compared with <span className="tnum">{fmtDayLabel(per.prevStart)} – {fmtFullDay(per.prevEnd)}</span></p>
            <p className="mt-3 flex flex-wrap items-center gap-2"><TagBadge tag={d.tag} size="lg" /><HealthChip fragile={d.fragile} oldPct={d.oldShare != null ? d.oldShare * 100 : null} /></p>
          </div>
          <PeriodPicker from={raw.from ?? ""} to={raw.to ?? ""} today={todayKL()} keep={{}} />
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Tile label="Sales" value={fmtRM(m.sales.now)} sub={<Delta now={m.sales.now} prev={m.sales.prev} />} />
          <Tile label="Orders" value={p.orders.now.toLocaleString("en-MY")} sub={<Delta now={p.orders.now} prev={p.orders.prev} money={false} />} />
          <Tile label="Active Creators" value={cs.active.now} sub={<Delta now={cs.active.now} prev={cs.active.prev} money={false} />} />
          <Tile label="New Videos" value={m.videosPosted.now ?? "–"} sub={m.videosPosted.now != null && m.videosPosted.prev != null ? <Delta now={m.videosPosted.now} prev={m.videosPosted.prev} money={false} /> : "not in TikTok's video list"} />
          <Tile label="Fresh Content Share" value={fresh != null ? `${Math.round(fresh)}%` : "–"} sub="sales from videos under 30 days and LIVE" hint="The rest comes from videos older than 30 days" />
        </div>
      </section>

      <Section title={noSales ? "Why No Sales?" : `Why Is It ${d.tag}?`} hint="Worked out from the numbers below. The biggest causes come first.">
        <ul className="grid gap-3 lg:grid-cols-3" data-testid="reasons">
          {d.reasons.map((r, idx) => (
            <li key={idx} className={cn("flex gap-3 rounded-xl border p-4", r.tone === "good" ? "border-good/30 bg-good-soft/40" : r.tone === "bad" ? "border-critical/30 bg-critical-soft/40" : r.tone === "warn" ? "border-warn/30 bg-warn-soft/50" : "border-line bg-surface-2")}>
              <span className="mt-0.5 shrink-0">{r.tone === "good" ? <TrendingUp className="size-5 text-good" /> : r.tone === "bad" ? <TrendingDown className="size-5 text-critical" /> : r.tone === "warn" ? <AlertTriangle className="size-5 text-warn" /> : <Info className="size-5 text-ink-3" />}</span>
              <p className="text-[14.5px] leading-snug text-ink">{r.text}</p>
            </li>
          ))}
        </ul>
        {d.fragile != null && (
          <p className={cn("mt-4 flex items-start gap-2 rounded-lg px-3.5 py-2.5 text-[13.5px]", d.fragile ? "bg-warn-soft text-warn" : "bg-good-soft text-good")}>
            {d.fragile ? <AlertTriangle className="mt-0.5 size-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0" />}
            {d.fragile ? `Fragile: ${pct((d.oldShare ?? 0) * 100)} of video and LIVE sales come from videos older than 30 days. Without new videos it will slip.` : `Healthy: only ${pct((d.oldShare ?? 0) * 100)} of video and LIVE sales depend on videos older than 30 days.`}
          </p>
        )}
      </Section>

      {!noSales && (
        <>
          <Section title="Where The Change Came From" hint="Sales this period minus the period before, by how old the content was when it sold">
            <WhyMoved p={p} />
            <div className="mt-5 grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
              <div><p className="mb-1 text-[12.5px] font-medium text-ink-3">This Period</p><MixBar b={m.buckets.now} height={14} /></div>
              <div><p className="mb-1 text-[12.5px] font-medium text-ink-3">Before</p><MixBar b={m.buckets.prev} height={14} /></div>
            </div>
            <Legend className="mt-3" />
          </Section>

          <Section title="Content Freshness" hint="Is new content replacing old content?">
            <div className="grid gap-5 lg:grid-cols-2">
              <div><p className="mb-2 text-[13.5px] font-medium text-ink-2">Weekly Sales, Last 12 Weeks</p><WeeklyMixChart data={weekly} /><Legend className="mt-2" /></div>
              <div><p className="mb-2 text-[13.5px] font-medium text-ink-2">Sales By The Age Of The Video</p><AgeChart data={p.ageCurve} /><p className="mt-2 text-[12.5px] text-ink-3">A steep drop after the first weeks means videos fade fast, so this product needs a steady flow of new videos.</p></div>
            </div>
          </Section>

          <Section title="Are New Videos Converting?" hint="Videos posted in this period that link this product">
            <NewContentCard p={p} covered={covered} />
          </Section>

          <Section title="Creators" hint="Who sells it, and how much it depends on a few of them">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Tile label="Active Creators" value={cs.active.now} sub={<Delta now={cs.active.now} prev={cs.active.prev} money={false} />} />
              <Tile label="Started Selling It" value={cs.fresh} sub="first sale of it in this period" />
              <Tile label="Nearly Stopped" value={<span className={cs.quiet > 0 ? "text-warn" : ""}>{cs.quiet}</span>} sub="sold before, almost nothing now" />
              <Tile label="Top 3 Creators" value={`${Math.round(cs.top3)}%`} sub={<span className={cs.top1 > 40 ? "font-medium text-warn" : ""}>top 1: {Math.round(cs.top1)}% · top 10: {Math.round(cs.top10)}%</span>} hint="Share of this period's sales from the biggest creators. High means it depends on a few people." />
            </div>
            {p.creators.length > 0 && (
              <div className="-mx-2 mt-4 overflow-x-auto">
                <table className="w-full min-w-[640px]" data-testid="creators-table">
                  <thead><tr className="border-b border-line text-left text-[12.5px] font-medium text-ink-3"><th className="px-2 py-2">Creator</th><th className="px-2 py-2 text-right">Sales</th><th className="px-2 py-2 text-right">Change</th><th className="px-2 py-2 text-right">Share</th><th className="w-40 px-2 py-2">Where It Came From</th></tr></thead>
                  <tbody className="divide-y divide-line">
                    {p.creators.map((c) => (
                      <tr key={c.name}>
                        <td className="px-2 py-2.5 text-[14px]"><Link href={`/creators/${encodeURIComponent(c.name)}`} className="font-medium text-ink hover:text-brand hover:underline">@{c.name}</Link>{c.isNew && <Badge tone="brand" className="ml-2">New</Badge>}</td>
                        <td className="tnum px-2 py-2.5 text-right text-[14px] font-semibold">{c.now > 0 ? fmtRM(c.now) : "–"}</td>
                        <td className="px-2 py-2.5 text-right"><Delta now={c.now} prev={c.prev} /></td>
                        <td className="tnum px-2 py-2.5 text-right text-[13.5px] text-ink-2">{c.now > 0 ? `${c.share.toFixed(1)}%` : "–"}</td>
                        <td className="px-2 py-2.5"><MixBar b={c.mix} height={8} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section title="Samples" hint="Samples of this product given in the period, and what came of them">
            <FunnelView f={p.samples.now} o={p.samples.prev} />
          </Section>

          <Section title="Video, LIVE Or Product Cards" hint="The type of content the sales came from">
            <ul className="grid gap-3 sm:grid-cols-3" data-testid="split">
              {([["Video", split.video, splitPrev.video, "var(--brand)"], ["LIVE", split.live, splitPrev.live, "var(--s3)"], ["Product Cards", split.other, splitPrev.other, "var(--line-strong)"]] as const).map(([l, now, prv, c]) => (
                <li key={l} className="rounded-xl border border-line p-4">
                  <p className="flex items-center gap-2 text-[13px] font-medium text-ink-3"><span className="size-2.5 rounded-sm" style={{ background: c }} />{l}</p>
                  <p className="tnum text-[22px] font-semibold text-ink">{fmtRM(now)} <span className="text-[13px] font-normal text-ink-3">{total > 0 ? `${Math.round((now / total) * 100)}%` : ""}</span></p>
                  <Delta now={now} prev={prv} />
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Quality" hint="Returned and cancelled orders of this product">
            <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
              <div className="grid grid-cols-2 gap-3">
                <Tile label="Returned Or Cancelled" value={m.returnRate.now != null ? `${m.returnRate.now.toFixed(1)}%` : "–"} sub={m.returnRate.prev != null ? `before: ${m.returnRate.prev.toFixed(1)}%` : undefined} />
                <Tile label="Order Lines" value={p.quality.lines.now} sub="returned or cancelled" />
              </div>
              {p.quality.reasons.length === 0 ? <p className="text-[14px] text-ink-3">No returns or cancellations in this period.</p> : (
                <ul className="space-y-2" data-testid="quality-reasons">
                  {p.quality.reasons.map((r) => (
                    <li key={r.reason} className="text-[13.5px]"><div className="flex justify-between gap-3"><span className="min-w-0 truncate text-ink-2" title={r.reason}>{r.reason}</span><span className="tnum font-semibold text-ink">{r.n}</span></div><div className="mt-1 h-1.5 rounded-full bg-surface-2"><div className="h-1.5 rounded-full bg-critical/70" style={{ width: `${(r.n / p.quality.reasons[0].n) * 100}%` }} /></div></li>
                  ))}
                </ul>
              )}
            </div>
          </Section>

          <Section title="Top Content" hint="The videos and LIVE sessions that sold the most in this period">
            {p.topContent.length === 0 ? <p className="text-[14px] text-ink-3">No video or LIVE sales in this period.</p> : (
              <div className="-mx-2 overflow-x-auto">
                <table className="w-full min-w-[720px]" data-testid="top-content">
                  <thead><tr className="border-b border-line text-left text-[12.5px] font-medium text-ink-3"><th className="px-2 py-2">Type</th><th className="px-2 py-2">Creator</th><th className="px-2 py-2">Posted</th><th className="px-2 py-2 text-right">Age At First Sale</th><th className="px-2 py-2 text-right">Orders</th><th className="px-2 py-2 text-right">Sales</th><th className="px-2 py-2" /></tr></thead>
                  <tbody className="divide-y divide-line">
                    {p.topContent.map((c) => (
                      <tr key={c.id}>
                        <td className="px-2 py-2.5"><Badge tone={c.kind === "live" ? "good" : "brand"}>{c.kind === "live" ? "LIVE" : "Video"}</Badge></td>
                        <td className="px-2 py-2.5 text-[14px]"><Link href={`/creators/${encodeURIComponent(c.creator)}`} className="font-medium text-ink hover:text-brand hover:underline">@{c.creator}</Link></td>
                        <td className="px-2 py-2.5 text-[13.5px] text-ink-2">{c.postDay ? fmtFullDay(c.postDay) : "–"}{c.estimated && c.postDay && <span className="ml-1.5 rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-ink-3" title="TikTok's video list does not have this video, so the date of its first sale is used">est.</span>}</td>
                        <td className="tnum px-2 py-2.5 text-right text-[13.5px] text-ink-2">{c.ageDays != null ? `${c.ageDays} days` : "–"}</td>
                        <td className="tnum px-2 py-2.5 text-right text-[14px]">{c.orders}</td>
                        <td className="tnum px-2 py-2.5 text-right text-[14px] font-semibold">{fmtRM(c.sales)}</td>
                        <td className="px-2 py-2.5 text-right">{c.url && <a href={c.url} target="_blank" rel="noopener noreferrer" className="inline-flex text-ink-3 hover:text-brand" aria-label="Open the video on TikTok"><ExternalLink className="size-4" /></a>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </>
      )}

      <details className="rounded-xl border border-line bg-surface">
        <summary className="cursor-pointer px-5 py-4 text-[15px] font-medium text-ink">How To Read This</summary>
        <div className="space-y-2 px-5 pb-5 text-[13.5px] text-ink-2">
          <ul className="space-y-0.5">{BUCKETS.map((b) => <li key={b.key}><b>{b.label}</b>: {b.hint}.</li>)}</ul>
          <p>Tags: Growing = sales up 15% or more; Steady = within ±15%; Slipping = down 15% or more; Dying = down 50% or more, or no new video while sales fall. Fragile = more than 70% of video and LIVE sales come from videos older than 30 days.</p>
          <p>A video&apos;s posting date comes from TikTok&apos;s video list. For videos missing from it the first sale date is used (marked &quot;est.&quot;){a.estimatedSharePct != null ? `; that is ${Math.round(a.estimatedSharePct)}% of all video and LIVE sales in this period` : ""}.</p>
        </div>
      </details>
    </div>
  );
}
