import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, Video } from "lucide-react";
import { gate } from "@/lib/gate";
import { hasSyncedData } from "@/lib/creators/load";
import { loadContent, type VideoRow } from "@/lib/affiliate/content-load";
import { CLASSES } from "@/lib/affiliate/content";
import { fmtDayLabel } from "@/lib/time";
import { href, one, type SP } from "@/lib/url";
import { Badge, buttonClasses, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/primitives";
import { OpenPanelButton } from "@/components/creators/open-panel-button";
import { cn, fmtCompact, fmtRM } from "@/lib/utils";

export const metadata: Metadata = { title: "Content" };
const TABS = [
  { key: "heating", label: "Heating Up", help: CLASSES[0].help },
  { key: "ready", label: "Ready For GMV Max", help: "Videos GMV Max itself calls worth boosting that are not boosted now, and that still sell (RM 50 or more in 28 days) or are proven (RM 300 or more sold in their life)." },
  { key: "fading", label: "Fading", help: CLASSES[1].help },
  { key: "stopped", label: "Stopped Selling", help: CLASSES[2].help },
] as const;
type Tab = (typeof TABS)[number]["key"];
const BAR = ["bg-brand", "bg-brand/75", "bg-brand/50", "bg-brand/30", "bg-ink-3/40"];

const pct = (now: number, before: number) => (before > 0 ? Math.round((now / before - 1) * 100) : null);

function Change({ now, before }: { now: number; before: number }) {
  const p = pct(now, before);
  if (p == null || p === 0) return null;
  return <span className={cn("tnum text-[12.5px] font-semibold", p > 0 ? "text-good" : "text-critical")}>{p > 0 ? "▲" : "▼"} {Math.abs(p)}%</span>;
}

function Act({ v, tab }: { v: VideoRow; tab: Tab }) {
  if ((tab === "heating" || tab === "ready") && v.ads?.group === "rescue") return <span className="text-[13px] text-ink-2">Ask the creator to authorize it again</span>;
  if (tab === "heating" || tab === "ready") return <Link href="/ads?tab=picks" className="inline-flex items-center rounded-full border border-brand bg-brand/10 px-2.5 py-0.5 text-[13px] font-semibold text-brand hover:bg-brand hover:text-white">Boost In GMV Max</Link>;
  return v.creator ? <OpenPanelButton username={v.creator} label="Ask For A Fresh Video" className="inline-flex items-center rounded-full border border-brand bg-brand/10 px-2.5 py-0.5 text-[13px] font-semibold text-brand hover:bg-brand hover:text-white" /> : null;
}

export default async function ContentPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { denied } = await gate("creators", "Content");
  if (denied) return denied;
  if (!(await hasSyncedData())) {
    return (
      <div className="space-y-6">
        <PageHeader title="Content" />
        <Card><EmptyState icon={<Video className="size-5" />} title="No TikTok data yet" description="Run Data Sync first. Videos appear here as soon as the first orders arrive." action={<Link href="/sync" className={buttonClasses({ variant: "primary" })}>Open Data Sync</Link>} /></Card>
      </div>
    );
  }
  const c = await loadContent();
  if (!c) return null;
  const sp = await searchParams;
  const tab = (TABS.find((t) => t.key === one(sp.tab))?.key ?? "heating") as Tab;
  const prod = one(sp.product) ?? "";
  const cr = one(sp.creator) ?? "";
  const list = c.lists[tab].filter((v) => (!prod || v.pk === prod) && (!cr || v.creator === cr));
  const old30 = c.mix.filter((m) => m.key === "d60" || m.key === "d90" || m.key === "old").reduce((n, m) => n + m.share, 0);
  const kpis = [
    { label: "Sales From Videos And LIVE", value: `RM ${fmtCompact(c.sales.now)}`, sub: "last 28 days", change: <Change now={c.sales.now} before={c.sales.before} /> },
    { label: "Videos Selling Now", value: c.videosSelling.toLocaleString("en-MY"), sub: "sold in the last 14 days" },
    { label: "Heating Up", value: c.counts.heating.toLocaleString("en-MY"), sub: "catching on: boost now" },
    { label: "Fading", value: c.counts.fading.toLocaleString("en-MY"), sub: "ask for fresh videos" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Content" description={`Which videos are catching on, fading or finished, judged on their own sales: the last 14 days against the 14 days before, ending ${fmtDayLabel(c.ref)}. Videos GMV Max rates as worth boosting are matched here, so this screen and GMV Max agree.`} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="content-kpis">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-2xl border border-line bg-surface px-4 py-3.5">
            <p className="text-[13px] font-medium text-ink-3">{k.label}</p>
            <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2"><span className="tnum text-[26px] leading-tight font-semibold tracking-tight text-ink">{k.value}</span>{k.change}</p>
            <p className="text-[12.5px] text-ink-3">{k.sub}</p>
          </div>
        ))}
      </div>

      <Card data-testid="age-mix">
        <CardHeader title="How Old Are The Videos That Sell?" description="Sales of the last 28 days by how old the video is. If most sales come from old videos, sales will fall as they fade, unless new videos replace them." />
        <div className="px-5 pb-5">
          <div className="flex h-4 overflow-hidden rounded-full bg-surface-2" role="img" aria-label="Sales by video age">
            {c.mix.map((m, i) => m.share > 0 && <div key={m.key} className={BAR[i]} style={{ width: `${m.share * 100}%` }} title={`${m.label}: ${Math.round(m.share * 100)}%`} />)}
          </div>
          <ul className="mt-3 grid grid-cols-2 gap-2 text-[13px] sm:grid-cols-5">
            {c.mix.map((m, i) => <li key={m.key} className="flex items-start gap-2"><span className={cn("mt-1 size-2.5 shrink-0 rounded-sm", BAR[i])} /><span><span className="text-ink-2">{m.label}</span><br /><b className="tnum text-ink">{Math.round(m.share * 100)}%</b> <span className="text-ink-3">· RM {fmtCompact(m.sales)}</span></span></li>)}
          </ul>
          <p className="mt-3 border-t border-line pt-3 text-[13.5px] text-ink-2">{Math.round(old30 * 100)}% of video sales come from videos older than 30 days. Video sales RM {fmtCompact(c.split.video.now)} <Change now={c.split.video.now} before={c.split.video.before} /> · LIVE sales RM {fmtCompact(c.split.live.now)} <Change now={c.split.live.now} before={c.split.live.before} /></p>
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
          <nav aria-label="Video lists" className="flex flex-wrap gap-2" data-testid="content-tabs">
            {TABS.map((t) => (
              <Link key={t.key} href={href("/affiliate/content", { tab: t.key === "heating" ? undefined : t.key, product: prod || undefined, creator: cr || undefined })} scroll={false} title={t.help} aria-current={t.key === tab ? "page" : undefined}
                className={cn("inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-[13.5px] font-medium", t.key === tab ? "border-brand/40 bg-brand-soft text-brand" : "border-line bg-surface text-ink-2 hover:bg-surface-2")}>
                {t.label}<span className="tnum text-[12.5px] text-ink-3">{c.counts[t.key].toLocaleString("en-MY")}</span>
              </Link>
            ))}
          </nav>
          <p className="text-[12.5px] text-ink-3">{prod ? <>Showing one product. <Link href={href("/affiliate/content", { tab: tab === "heating" ? undefined : tab, creator: cr || undefined })} className="font-semibold text-brand hover:underline">Show all products</Link>. </> : null}{cr ? <>Showing @{cr} only. <Link href={href("/affiliate/content", { tab: tab === "heating" ? undefined : tab, product: prod || undefined })} className="font-semibold text-brand hover:underline">Show all creators</Link>. </> : null}{TABS.find((t) => t.key === tab)!.help}</p>
        </div>
        {list.length === 0 ? <p className="px-5 py-12 text-center text-[14px] text-ink-3">No videos here right now.</p> : (
          <ul data-testid="content-rows">
            {list.map((v) => (
              <li key={v.id} className="grid grid-cols-1 gap-x-4 gap-y-1.5 border-b border-line px-5 py-3.5 last:border-b-0 lg:grid-cols-[minmax(220px,1.6fr)_minmax(110px,0.8fr)_130px_minmax(150px,1fr)_minmax(150px,1fr)] lg:items-start">
                <div className="min-w-0">
                  <p className="line-clamp-2 text-[13.5px] font-medium text-ink" title={v.title ?? ""}>{v.title || "Untitled video"}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12.5px] text-ink-3">
                    {v.creator ? <OpenPanelButton username={v.creator} className="font-semibold text-brand hover:underline" /> : "unknown creator"}
                    <span>{v.postedOn ? `posted ${fmtDayLabel(v.postedOn)}${v.ageDays != null ? ` (${v.ageDays} days)` : ""}` : "date unknown"}</span>
                    {v.creator && <a href={`https://www.tiktok.com/@${v.creator}/video/${v.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 hover:text-ink" aria-label="Open the video on TikTok"><ExternalLink className="size-3" /></a>}
                  </p>
                </div>
                <p className="text-[13px] text-ink-2">{v.pk && v.product ? <Link href={`/products/${v.pk}`} className="hover:text-brand hover:underline">{v.product}</Link> : v.product || "–"}</p>
                <div className="tnum text-[13px]"><p className="font-semibold text-ink">{fmtRM(v.s14)} <Change now={v.s14} before={v.p14} /></p><p className="text-ink-3">last 14 days · before {fmtRM(v.p14)}</p></div>
                <div className="text-[13px]">{v.ads ? <><Badge tone={v.ads.boostNow ? "brand" : v.ads.boosted ? "good" : "neutral"}>{v.ads.boosted ? "Boosting Now" : v.ads.label}</Badge><p className="mt-0.5 text-[12px] leading-snug text-ink-3">{v.ads.why}</p></> : <span className="text-ink-3">Not in GMV Max</span>}</div>
                <div><Act v={v} tab={tab} /></div>
              </li>
            ))}
          </ul>
        )}
        <p className="px-5 py-3 text-[12.5px] text-ink-3">{list.length >= 60 ? "Showing the top 60. " : ""}Sales shown are affiliate video sales that were not returned or cancelled.</p>
      </Card>
    </div>
  );
}
