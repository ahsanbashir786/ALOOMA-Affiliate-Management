import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { gate } from "@/lib/gate";
import { videoDetail } from "@/lib/ads/insights";
import { boostOptions, getBoostWriteSettings } from "@/lib/tiktok-ads/boost-write";
import { adsConnectionInfo } from "@/lib/tiktok-ads/client";
import { BoostPanel, StopBoostButton } from "@/components/ads/boost-panel";
import { can } from "@/lib/auth";
import { one, type SP } from "@/lib/url";
import { GROUP } from "@/lib/ads/groups";
import { Person } from "@/components/execution/ui";
import { EstPill, EvidenceDots, GroupPill, Pill, PotentialBar, SpendSalesBars, StatusPill, Tile, day, nfmt, rm, rm2, roiFmt, th, thr, td, tdr } from "@/components/ads/ui";
import { cn } from "@/lib/utils";
import { InfoTip } from "@/components/ui/info-tip";

export const metadata: Metadata = { title: "Video · GMV Max" };
export const dynamic = "force-dynamic";

export default async function AdsVideoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const { user, denied } = await gate("ads", "GMV Max");
  if (denied) return denied;
  const { id } = await params;
  const sp = await searchParams;
  const d = await videoDetail(decodeURIComponent(id));
  if (!d) notFound();
  const [opt, bw, conn] = await Promise.all([boostOptions(d.rows[0].creativeId), getBoostWriteSettings(), adsConnectionInfo()]);
  const wantBudget = Number(one(sp.budget));
  const v = d.rows[0];
  const cost = d.rows.reduce((a, r) => a + r.cost, 0), revenue = d.rows.reduce((a, r) => a + r.revenue, 0), orders = d.rows.reduce((a, r) => a + r.orders, 0);
  const cost7 = d.rows.reduce((a, r) => a + r.cost7, 0), rev7 = d.rows.reduce((a, r) => a + r.revenue7, 0);
  const g = GROUP[v.group];
  const card = "overflow-hidden rounded-2xl border border-line bg-surface";
  return (
    <div className="space-y-5" data-testid="ads-video">
      <Link href="/ads?tab=picks" className="inline-flex items-center gap-1 text-[13.5px] font-medium text-brand hover:underline"><ArrowLeft className="size-4" />Boost Picks</Link>
      <header className="flex flex-wrap items-start gap-4">
        {v.creator ? <Person name={v.creator} size={48} /> : <span className="size-12 shrink-0 rounded-full bg-surface-2" />}
        <div className="min-w-0 flex-1">
          <h1 className="text-[22px] leading-snug font-semibold tracking-tight text-ink">{v.title || `Video ${v.creativeId.slice(-8)}`}</h1>
          <p className="mt-1 text-[14px] text-ink-2">{v.creator ? <Link href={`/creators/${encodeURIComponent(v.creator)}`} className="text-brand hover:underline">@{v.creator}</Link> : "Creator not known"}{v.postedOn ? ` · posted ${day(v.postedOn)} (${v.ageDays} days ago)` : ""} · Video ID {v.creativeId}</p>
          <p className="mt-2 flex flex-wrap items-center gap-2"><GroupPill group={v.group} /><EstPill est={v.est} /><StatusPill status={v.status} label={v.statusLabel} />{v.statusDay && <span className="text-[12.5px] text-ink-3">TikTok API status as of {day(v.statusDay)}</span>}{v.boostedNow && <Pill tone="good">Boost Running Now</Pill>}</p>
        </div>
        <a href={`https://www.tiktok.com/@${v.creator ?? "_"}/video/${v.creativeId}`} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center rounded-lg border border-line-strong px-3 text-[13.5px] font-medium text-ink hover:bg-surface-2">Open On TikTok</a>
      </header>
      <section className={cn("rounded-2xl border p-4", g.boost ? "border-brand/30 bg-brand-soft" : "border-line bg-surface")} data-testid="ads-video-verdict">
        <p className="text-[14.5px] font-semibold text-ink">{g.boost ? (v.boostedNow ? "Worth Boosting, And A Boost Is Already Running" : "Worth Boosting") : v.group === "winning" ? "Leave It Running" : "Do Not Boost Now"}</p>
        <p className="mt-0.5 text-[13.5px] text-ink-2">{v.why}. {g.about}</p>
        <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-ink-2"><span className="inline-flex items-center gap-2">Potential <PotentialBar value={v.potential} /></span><span className="inline-flex items-center gap-2">Proof <EvidenceDots level={v.evidence} /></span>{g.boost && <span className="inline-flex items-center gap-2">Fair test <b className="rounded-full bg-brand-soft px-2 py-0.5 text-brand-strong">RM {v.testAmount} a day</b></span>}</div>
      </section>
      <section className="tile-grid" aria-label="All-time results">
        <Tile label="All-Time Ad Spend" value={rm(cost)} sub={<span className="text-[12.5px] text-ink-3">{v.firstSpend ? `first spend ${day(v.firstSpend)}` : "never spent"}</span>} />
        <Tile label="Sales From Ads" value={rm(revenue)} sub={<span className="text-[12.5px] text-ink-3">{nfmt(orders)} orders</span>} />
        <Tile label="All-Time ROI" value={roiFmt(cost > 0 ? revenue / cost : null)} sub={<span className="text-[12.5px] text-ink-3">{orders > 0 && cost > 0 ? `${rm2(cost / orders)} an order` : "no orders"}</span>} />
        <Tile label="Last 7 Days" value={rm(rev7)} sub={<span className="text-[12.5px] text-ink-3">spend {rm(cost7)} · ROI {roiFmt(cost7 > 0 ? rev7 / cost7 : null)}</span>} />
        <Tile label="Sales Without Ads" value={v.organicGmv > 0 ? rm(v.organicGmv) : "–"} sub={<span className="text-[12.5px] text-ink-3">{v.views ? `${nfmt(v.views)} views · ` : ""}from the Shop sync</span>} />
      </section>
      <section className={cn(card, "p-5")} aria-label="Last 60 days">
        <h2 className="mb-3 text-[16px] font-semibold text-ink">Last 60 Days{v.lastSpend ? <span className="ml-2 text-[13px] font-normal text-ink-3">last spend {day(v.lastSpend)}</span> : null}</h2>
        <SpendSalesBars series={d.series} />
      </section>
      {d.campaigns.length > 0 && (
        <section className={card} aria-label="By campaign">
          <h2 className="px-5 pt-4 pb-3 text-[16px] font-semibold text-ink">Where It Ran</h2>
          <div className="overflow-x-auto"><table className="w-full min-w-[720px] border-collapse text-[13.5px]">
            <thead><tr className="border-y border-line bg-surface-2/60"><th className={cn(th, "pl-5")}>Campaign</th><th className={th}>Product</th><th className={thr}>Spend</th><th className={thr}>Sales</th><th className={thr}>Orders</th><th className={thr}>ROI</th><th className={cn(thr, "pr-5")}>Last Spend</th></tr></thead>
            <tbody>{d.campaigns.map((c) => <tr key={c.campaignId + c.productLabel} className="border-b border-line"><td className={cn(td, "max-w-[280px] truncate pl-5 font-medium text-ink")}>{c.name}</td><td className={cn(td, "text-ink-2")}>{c.productLabel}</td><td className={tdr}>{rm(c.cost)}</td><td className={tdr}>{rm(c.revenue)}</td><td className={tdr}>{nfmt(c.orders)}</td><td className={cn(tdr, "font-semibold")}>{roiFmt(c.roi)}</td><td className={cn(tdr, "pr-5 text-ink-2")}>{c.lastSpend ? day(c.lastSpend) : "Never"}</td></tr>)}</tbody>
          </table></div>
        </section>
      )}
      {conn.connected && <BoostPanel itemId={v.creativeId} campaigns={opt.campaigns} blockers={opt.blockers} enabled={bw.enabled} canWrite={can(user, "settings")} maxBudget={bw.maxBudget} dailyCap={bw.dailyCap} committed={opt.committed} defaultBudget={Number.isFinite(wantBudget) && wantBudget > 0 ? wantBudget : 5} />}
      <section className={cn(card, "p-5")} aria-label="What TikTok sent" data-testid="ads-sent">
        <h2 className="flex items-center gap-1.5 text-[16px] font-semibold text-ink">What TikTok&apos;s API Sent For This Video<InfoTip>Nothing here is our guess. These are the newest rows we saved, field by field. TikTok&apos;s Exploration status (Explored, Performing, Underperforming) is only shown when TikTok&apos;s API sends it; an empty box below means it did not.</InfoTip></h2>
        {d.sent.length === 0 ? <p className="mt-3 text-[14px] text-ink-3">No result rows were saved for this video yet (it never appeared in the ads results).</p> : (
          <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[640px] border-collapse text-[13.5px]">
            <thead><tr className="border-y border-line bg-surface-2/60"><th className={cn(th, "pl-1")}>Result Day</th><th className={th}>Delivery Status</th><th className={th}>Exploration Status</th><th className={th}>Boost Status</th><th className={th}>Authorization</th></tr></thead>
            <tbody>{d.sent.map((r) => <tr key={r.day + r.productId} className="border-b border-line" data-testid="ads-sent-row"><td className={cn(td, "pl-1")}>{day(r.day)}</td><td className={td}><code>{r.delivery ?? "not sent"}</code></td><td className={td}><code>{r.exploration ?? "not sent"}</code></td><td className={td}><code>{r.boost ?? "not sent"}</code></td><td className={td}><code>{r.authorization ?? "not sent"}</code></td></tr>)}</tbody>
          </table></div>
        )}
        {d.sent[0] && <details className="mt-3"><summary className="cursor-pointer text-[13px] font-medium text-brand hover:underline">Show the newest row exactly as TikTok sent it</summary><pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-surface-2 p-3 text-[12px] leading-relaxed text-ink-2">{JSON.stringify(d.sent[0].json, null, 2)}</pre></details>}
        {d.post && <details className="mt-2"><summary className="cursor-pointer text-[13px] font-medium text-brand hover:underline">Show the post record from Own Account Posts{d.post.status ? ` (${d.post.status})` : ""}</summary><pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-surface-2 p-3 text-[12px] leading-relaxed text-ink-2">{JSON.stringify(d.post.json, null, 2)}</pre></details>}
      </section>
      <section className={cn(card, "p-5")} aria-label="Boost history">
        <h2 className="text-[16px] font-semibold text-ink">Boost History</h2>
        {d.logged.length === 0 && d.sessions.length === 0 ? <p className="mt-2 text-[14px] text-ink-3">This video has not been boosted, as far as the Boost Log and TikTok&apos;s running sessions show.</p> : (
          <ul className="mt-2 divide-y divide-line text-[14px]">
            {d.logged.map((l) => <li key={`l${l.id}`} className="flex flex-wrap items-center justify-between gap-2 py-2"><span className="text-ink">In your batch of {day(l.boostedOn)}</span><span className="text-ink-3">{rm2(l.budget)} a day · <Link href="/ads?tab=log" className="text-brand hover:underline">Boost Log</Link></span></li>)}
            {d.sessions.map((s) => <li key={`s${s.sessionId}`} className="flex flex-wrap items-center justify-between gap-2 py-2"><span className="text-ink">TikTok boost session{s.startsAt ? ` from ${day(s.startsAt)}` : ""}{s.endsAt ? ` to ${day(s.endsAt)}` : ""}</span><span className="flex items-center gap-2 text-ink-3">{s.budget != null ? `${rm2(s.budget)} budget` : ""}<Pill tone={s.active ? "good" : "muted"}>{s.active ? "Active Now" : "Ended"}</Pill>{s.active && can(user, "settings") && <StopBoostButton sessionId={s.sessionId} itemId={v.creativeId} />}</span></li>)}
          </ul>
        )}
      </section>
    </div>
  );
}
