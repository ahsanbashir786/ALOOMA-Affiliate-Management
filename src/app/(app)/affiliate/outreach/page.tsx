import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Users } from "lucide-react";
import { gate } from "@/lib/gate";
import { can } from "@/lib/auth";
import { hasSyncedData } from "@/lib/creators/load";
import { loadOutreach, type SampleCard } from "@/lib/affiliate/outreach-load";
import { PIPELINE, type PipelineKey } from "@/lib/affiliate/outreach";
import { fmtDayLabel } from "@/lib/time";
import { href, one, type SP } from "@/lib/url";
import { Badge, buttonClasses, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/primitives";
import { OpenPanelButton } from "@/components/creators/open-panel-button";
import { Avatar } from "@/components/creators/avatar";
import { ReviewButtons } from "@/components/affiliate/review-buttons";
import { ReviewSwitch } from "@/components/affiliate/review-switch";
import { FindCreators } from "@/components/affiliate/find-creators";
import { cn, fmtCompact, fmtRM } from "@/lib/utils";

export const metadata: Metadata = { title: "Outreach" };
const KEYS = PIPELINE.map((p) => p.key) as string[];
const TONE = { good: "good", warn: "warn", bad: "critical", neutral: "neutral" } as const;

function Card1({ s, enabled, canReview }: { s: SampleCard; enabled: boolean; canReview: boolean }) {
  const h = s.history;
  return (
    <li className="grid grid-cols-1 gap-x-5 gap-y-2 border-t border-line px-5 py-4 lg:grid-cols-[minmax(200px,1fr)_minmax(220px,1.3fr)_minmax(230px,1fr)]" data-testid="sample-card">
      <div className="flex min-w-0 items-start gap-3">
        <Avatar name={s.creator} size={38} />
        <div className="min-w-0">
          <OpenPanelButton username={s.creator} className="truncate text-left text-[14.5px] font-semibold text-brand hover:underline" />
          <p className="text-[12px] text-ink-3">{s.followers != null ? `${fmtCompact(s.followers)} followers` : "followers not known"}</p>
          <p className="mt-1 text-[13px] text-ink">{s.product}{s.quantity != null ? ` · ${s.quantity} left` : ""}</p>
          <p className="text-[12px] text-ink-3">{s.stage === "requested" ? `asked ${s.requestedOn ? fmtDayLabel(s.requestedOn) : ""}` : s.stage === "delivered" || s.stage === "posted" ? `delivered ${s.deliveredOn ? fmtDayLabel(s.deliveredOn) : ""}` : s.shippedOn ? `shipped ${fmtDayLabel(s.shippedOn)}` : ""}{s.commission != null ? ` · commission ${Math.round(s.commission * 100) / 100}%` : ""}</p>
        </div>
      </div>
      <div>
        <Badge tone={TONE[h.tone]}>{h.tone === "good" ? "Proven" : h.tone === "bad" ? "Check First" : h.tone === "warn" ? "Unproven" : "New"}</Badge>
        <p className="mt-1 text-[13px] leading-snug text-ink-2">{h.verdict}</p>
        <p className="tnum mt-1 text-[12px] text-ink-3">{h.samples} samples before · {h.selling} selling · lifetime sales {fmtRM(h.sales)}</p>
      </div>
      <div>
        {s.stage === "requested" ? (
          <>
            {s.daysLeft != null && <p className={cn("mb-2 text-[12.5px] font-semibold", s.daysLeft <= 2 ? "text-critical" : "text-ink-3")}>{s.daysLeft <= 0 ? "Expires today" : `${s.daysLeft} days left to decide`}</p>}
            <ReviewButtons id={s.id} creator={s.creator} product={s.product} enabled={enabled} canReview={canReview} />
          </>
        ) : <p className="text-[13px] text-ink-3">{s.stage === "approved" ? "Waiting for the shipment." : s.stage === "shipped" ? "On the way to the creator." : s.stage === "delivered" ? "Delivered. Waiting for a post." : "Posted. Continues in Creator Lifecycle."}</p>}
      </div>
    </li>
  );
}

export default async function OutreachPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { user, denied } = await gate("creators", "Outreach");
  if (denied) return denied;
  if (!(await hasSyncedData())) {
    return (
      <div className="space-y-6">
        <PageHeader title="Outreach" />
        <Card><EmptyState icon={<Users className="size-5" />} title="No TikTok data yet" description="Run Data Sync first. Sample requests appear here as soon as they are synced." action={<Link href="/sync" className={buttonClasses({ variant: "primary" })}>Open Data Sync</Link>} /></Card>
      </div>
    );
  }
  const sp = await searchParams;
  const o = await loadOutreach();
  if (!o) return null;
  const stage = (KEYS.includes(one(sp.stage) ?? "") ? one(sp.stage) : "suggested") as PipelineKey;
  const canReview = can(user, "approve_samples");
  const isOwner = can(user, "settings") && !user.readOnly;
  const def = PIPELINE.find((p) => p.key === stage)!;
  const g = o.guard;

  return (
    <div className="space-y-6">
      <PageHeader title="Outreach" description="How creators come in: suggestions, a sample request, your decision, then shipping, delivery and the first post. After the first post they continue in Creator Lifecycle. Existing creators come first: fix samples that have not sold before paying for new ones." />

      <nav aria-label="Pipeline" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" data-testid="pipeline">
        {PIPELINE.map((p, i) => (
          <Link key={p.key} href={href("/affiliate/outreach", { stage: p.key === "suggested" ? undefined : p.key })} title={p.help} aria-current={p.key === stage ? "page" : undefined}
            className={cn("relative rounded-2xl border px-4 py-3 transition-colors", p.key === stage ? "border-brand/40 bg-brand-soft" : "border-line bg-surface hover:bg-surface-2")}>
            <p className="flex items-center justify-between text-[12.5px] font-medium text-ink-3">{p.label}{i < PIPELINE.length - 1 && <ArrowRight className="hidden size-3.5 lg:block" />}</p>
            <p className={cn("tnum text-[24px] leading-tight font-semibold", p.key === stage ? "text-brand" : "text-ink")}>{o.counts[p.key].toLocaleString("en-MY")}</p>
          </Link>
        ))}
      </nav>

      {g.high && (
        <div className="rounded-2xl border border-warn/50 bg-warn-soft px-4 py-3 text-[13.5px] text-ink" data-testid="guard-banner">
          <b>Fix old samples first.</b> {(g.notPosted + g.noSale).toLocaleString("en-MY")} samples already sent have not turned into sales. Think twice before approving many new ones. <Link href="/affiliate/lifecycle?stage=notposted" className="font-semibold text-brand hover:underline">See them</Link>
        </div>
      )}

      <Card data-testid="review-card">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
          <div>
            <p className="text-[14px] font-semibold text-ink">Approving And Rejecting On TikTok</p>
            <p className="text-[12.5px] text-ink-3" data-testid="review-status">
              {!o.flags.connected ? "TikTok Shop is not connected." : !o.flags.write ? "TikTok has not granted the approve permission yet (seller.affiliate_collaboration.write). Reconnect TikTok in Settings after switching it on in Partner Center." : o.flags.reviewOn ? "On. Approvals go to TikTok and cannot be undone." : "Off. The system only reads until the owner switches this on."}
            </p>
          </div>
          {isOwner ? <ReviewSwitch on={o.flags.reviewOn} /> : <Badge tone={o.flags.reviewOn ? "good" : "neutral"}>{o.flags.reviewOn ? "On" : "Off"}</Badge>}
        </div>
      </Card>

      {stage === "suggested" ? (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
          <div className="space-y-6">
            <Card data-testid="more-samples">
              <CardHeader title="Give More Samples" description="Your own creators who sell now and have nothing outstanding (no sample still unposted or on the way), best sellers first. The last column lists products you have never offered them." />
              {o.more.length === 0 ? <p className="px-5 pb-6 text-[13.5px] text-ink-3">Nobody qualifies right now.</p> : (
                <ul>
                  {o.more.slice(0, 15).map((m) => (
                    <li key={m.username} className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 border-t border-line px-5 py-3 text-[13.5px] sm:grid-cols-[minmax(150px,1fr)_110px_minmax(180px,1.3fr)]">
                      <div className="min-w-0"><OpenPanelButton username={m.username} className="truncate text-left font-semibold text-brand hover:underline" /><p className="text-[12px] text-ink-3">{m.followers != null ? `${fmtCompact(m.followers)} followers` : ""}</p></div>
                      <p className="tnum font-semibold text-ink">{fmtRM(m.sales28)}<span className="block text-[12px] font-normal text-ink-3">28 days</span></p>
                      <p className="col-span-2 text-[12.5px] leading-snug text-ink-3 sm:col-span-1">{m.neverSampled.length ? `Not offered yet: ${m.neverSampled.join(", ")}` : "Offered everything"}</p>
                    </li>
                  ))}
                </ul>
              )}
              {o.more.length > 15 && <p className="border-t border-line px-5 py-3 text-[12.5px] text-ink-3">Showing 15 of {o.more.length}. Open Actions for the full ranked list.</p>}
            </Card>
            <Card data-testid="tiktok-card">
              <CardHeader title="New Creators From TikTok" description="TikTok's own Creator Marketplace, with data for the last 30 days. We do not make this list: it is what TikTok returns. Search by keyword or sales range." action={<a href="https://seller-my.tiktok.com/" target="_blank" rel="noreferrer" className="text-[13px] font-semibold text-brand hover:underline">Open TikTok Seller Center</a>} />
              {o.tiktok.ok ? <FindCreators initial={o.tiktok.creators} fieldsSeen={o.tiktok.fieldsSeen} /> : (
                <p className="px-5 pb-6 text-[13.5px] text-ink-2" data-testid="tiktok-unavailable">TikTok&apos;s creator list is not available here yet: {o.tiktok.error} You can still use TikTok&apos;s own recommended creators in Seller Center with the link above.</p>
              )}
            </Card>
          </div>
          <Card data-testid="side-requests">
            <CardHeader title="Sample Requests Waiting" description="Requests that need your decision. The ones about to expire come first." action={<Link href="/affiliate/outreach?stage=requested" className="text-[13px] font-semibold text-brand hover:underline">See all {o.counts.requested}</Link>} />
            {o.samples.requested.length === 0 ? <p className="px-5 pb-6 text-[13.5px] text-ink-3">Nothing waiting for you.</p> : <ul>{o.samples.requested.slice(0, 4).map((s) => <Card1 key={s.id} s={s} enabled={o.flags.reviewOn && o.flags.write} canReview={canReview} />)}</ul>}
          </Card>
        </div>
      ) : (
        <Card>
          <div className="border-b border-line px-5 py-3.5"><h2 className="text-[15px] font-semibold text-ink">{def.label}</h2><p className="text-[13px] text-ink-3">{def.help}</p></div>
          {o.samples[stage as Exclude<PipelineKey, "suggested">].length === 0 ? <p className="px-5 py-10 text-center text-[14px] text-ink-3">Nobody is in this stage right now.</p> : (
            <ul data-testid="stage-list">{o.samples[stage as Exclude<PipelineKey, "suggested">].map((s) => <Card1 key={s.id} s={s} enabled={o.flags.reviewOn && o.flags.write} canReview={canReview} />)}</ul>
          )}
        </Card>
      )}
    </div>
  );
}
