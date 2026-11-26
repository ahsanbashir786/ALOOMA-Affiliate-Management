import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BellRing, CheckCircle2, Clapperboard, ExternalLink, Gift, History, PackageOpen, Send, ShieldCheck, Sparkles, Star, Tag, Truck, UserCheck, Users } from "lucide-react";
import { gate } from "@/lib/gate";
import { can } from "@/lib/auth";
import { hasSyncedData } from "@/lib/creators/load";
import { loadOutreach, loadOutreachPeriod, type SampleCard } from "@/lib/affiliate/outreach-load";
import { parseRange } from "@/lib/creators/params";
import { DatesPicker } from "@/components/ui/range-picker";
import { UrlSearch } from "@/components/ui/url-search";
import { ProductPick } from "@/components/ui/product-pick";
import { Pagination } from "@/components/ui/pagination";
import { pageOf, sizeFrom } from "@/lib/paging";
import { PIPELINE, type PipelineKey } from "@/lib/affiliate/outreach";
import { addDaysISO, daysBetweenISO, fmtDayLabel, todayKL } from "@/lib/time";
import { LIFETIME_FROM } from "@/lib/range";
import { href, one, type SP } from "@/lib/url";
import { Badge, buttonClasses, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/primitives";
import { OpenPanelButton } from "@/components/creators/open-panel-button";
import { Avatar } from "@/components/creators/avatar";
import { ReviewButtons } from "@/components/affiliate/review-buttons";
import { ReviewSwitch } from "@/components/affiliate/review-switch";
import { FindCreators } from "@/components/affiliate/find-creators";
import { CheckEligibility } from "@/components/affiliate/check-eligibility";
import { STATUS_LABEL } from "@/lib/affiliate/eligibility";
import { InfoTip } from "@/components/ui/info-tip";
import { cn, fmtCompact, fmtRM } from "@/lib/utils";

export const metadata: Metadata = { title: "Creator Outreach" };
const MORE_PAGE = 20;
const FIT_RANK = { eligible: 0, unknown: 1, unchecked: 2, not: 3 } as const;
const KEYS = PIPELINE.map((p) => p.key) as string[];
const TONE = { good: "good", warn: "warn", bad: "critical", neutral: "neutral" } as const;

function Card1({ s, enabled, canReview }: { s: SampleCard; enabled: boolean; canReview: boolean }) {
  const h = s.history;
  return (
    <li className={cn("grid grid-cols-1 gap-x-5 gap-y-2 border-t border-line px-5 py-4 lg:grid-cols-[minmax(200px,1fr)_minmax(220px,1.3fr)_minmax(230px,1fr)]", s.verdict?.status === "eligible" && "border-l-4 border-l-good bg-good-soft/30", s.verdict?.status === "not" && "opacity-70")} data-testid="sample-card" data-fit={s.verdict?.status ?? "unchecked"}>
      <div className="flex min-w-0 items-start gap-3">
        <Avatar name={s.creator} size={38} />
        <div className="min-w-0">
          <OpenPanelButton username={s.creator} className="truncate text-left text-[14.5px] font-semibold text-brand hover:underline" />
          <p className="text-[12px] text-ink-3">{s.followers != null ? `${fmtCompact(s.followers)} followers` : "followers not known"}</p>
          <p className="mt-1 text-[13px] text-ink">{s.product}{s.quantity != null && s.quantity < 99999 ? ` · ${s.quantity} left` : ""}</p>
          <p className="text-[12px] text-ink-3">{s.stage === "requested" ? `asked ${s.requestedOn ? fmtDayLabel(s.requestedOn) : ""}` : s.stage === "delivered" || s.stage === "posted" ? `delivered ${s.deliveredOn ? fmtDayLabel(s.deliveredOn) : ""}` : s.shippedOn ? `shipped ${fmtDayLabel(s.shippedOn)}` : ""}{s.commission != null ? ` · commission ${Math.round((s.commission <= 1 ? s.commission * 100 : s.commission > 100 ? s.commission / 100 : s.commission) * 100) / 100}%` : ""}</p>
        </div>
      </div>
      <div>
        <p className="flex flex-wrap items-center gap-1.5 text-[12px]" data-testid="eligibility">
          {s.verdict ? (
            <>
              <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12.5px] font-semibold", s.verdict.status === "eligible" ? "bg-good text-white" : s.verdict.status === "not" ? "bg-critical-soft text-critical" : "bg-surface-2 text-ink-2")}>{s.verdict.status === "eligible" ? <ShieldCheck className="size-3.5" /> : null}{s.verdict.status === "eligible" ? "Meets Criteria" : STATUS_LABEL[s.verdict.status]}</span>
              <span className="text-ink-3">{(s.verdict.status === "eligible" ? s.verdict.good : s.verdict.reasons).slice(0, 3).join(" · ")}</span>
            </>
          ) : <span className="rounded-full bg-surface-2 px-2 py-0.5 text-ink-3" title="The system checks the level and categories with TikTok by itself, a few every 10 minutes">Checking soon</span>}
        </p>
        <p className="mt-1.5 flex items-center gap-1.5 text-[13px] leading-snug text-ink-2"><Badge tone={TONE[h.tone]}>{h.tone === "good" ? "Proven" : h.tone === "bad" ? "Check First" : h.tone === "warn" ? "Unproven" : "New"}</Badge>{h.verdict}</p>
        <p className="tnum mt-1 text-[12px] text-ink-3">{h.samples} samples before · {h.selling} selling · lifetime sales {fmtRM(h.sales)}</p>
      </div>
      <div>
        {s.stage === "requested" ? (
          <>
            {s.daysLeft != null && <p className={cn("mb-2 text-[12.5px] font-semibold", s.daysLeft <= 2 ? "text-critical" : "text-ink-3")}>{s.daysLeft <= 0 ? "Expires today" : `${s.daysLeft} days left to decide`}</p>}
            <ReviewButtons id={s.id} creator={s.creator} product={s.product} enabled={enabled} canReview={canReview} warn={s.verdict?.status === "not" ? s.verdict.reasons.join("; ") : undefined} />
          </>
        ) : <p className="text-[13px] text-ink-3">{s.stage === "approved" ? "Waiting for the shipment." : s.stage === "shipped" ? "On the way to the creator." : s.stage === "delivered" ? "Delivered. Waiting for a post." : "Posted. Continues in Creators."}</p>}
      </div>
    </li>
  );
}

const PIPE_ICON = { suggested: Sparkles, requested: Send, approved: CheckCircle2, shipped: Truck, delivered: PackageOpen, posted: Clapperboard } as const;

export default async function OutreachPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { user, denied } = await gate("creators", "Creator Outreach");
  if (denied) return denied;
  if (!(await hasSyncedData())) {
    return (
      <div className="space-y-6">
        <PageHeader title="Creator Outreach" />
        <Card><EmptyState icon={<Users className="size-5" />} title="No TikTok data yet" description="Run Data Sync first. Sample requests appear here as soon as they are synced." action={<Link href="/sync" className={buttonClasses({ variant: "primary" })}>Open Data Sync</Link>} /></Card>
      </div>
    );
  }
  const sp = await searchParams;
  const raw = Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, one(v)]));
  const today = todayKL();
  const range = parseRange(raw) ?? { start: addDaysISO(today, -29), end: today };
  // Lifetime has no "days before" to compare with.
  const isLife = range.start <= LIFETIME_FROM;
  const days = daysBetweenISO(range.start, range.end) + 1;
  const prevRange = { start: addDaysISO(range.start, -days), end: addDaysISO(range.start, -1) };
  const [o, per, prev] = await Promise.all([loadOutreach(range), loadOutreachPeriod(range), isLife ? null : loadOutreachPeriod(prevRange)]);
  const rangeLabel = isLife ? "Lifetime" : `${fmtDayLabel(range.start)} – ${fmtDayLabel(range.end)}`;
  if (!o) return null;
  const view = one(sp.stage) === "history" ? "history" : ((KEYS.includes(one(sp.stage) ?? "") ? one(sp.stage) : "suggested") as PipelineKey);
  const stage = view === "history" ? "suggested" : view;
  const canReview = can(user, "approve_samples");
  const isOwner = can(user, "settings") && !user.readOnly;
  const def = PIPELINE.find((p) => p.key === stage)!;
  const g = o.guard;
  const keep = { from: raw.from || undefined, to: raw.to || undefined };
  const fit = (stage === "requested" ? one(sp.fit) ?? "" : "") as "" | "eligible" | "not" | "unknown" | "unchecked";
  const all = stage === "suggested" ? [] : o.samples[stage as Exclude<PipelineKey, "suggested">];
  // Requests that meet your rules come first, then the ones still to check; within each, the ones expiring first.
  const ordered = stage === "requested" ? [...all].sort((a, b) => FIT_RANK[a.verdict?.status ?? "unchecked"] - FIT_RANK[b.verdict?.status ?? "unchecked"]) : all;
  const list = fit ? ordered.filter((c) => (fit === "unchecked" ? !c.verdict : c.verdict?.status === fit)) : ordered;
  // Your Own Affiliates: a search and a product to target, then pages.
  const mq = (one(sp.mq) ?? "").toLowerCase().trim().replace(/^@/, ""), mprod = one(sp.mprod) ?? "";
  const moreAll = o.more.filter((m) => (!mq || m.username.toLowerCase().includes(mq)) && (!mprod || m.recs.some((r) => r.pid === mprod)));
  const mSize = sizeFrom(sp, MORE_PAGE, "msize");
  const mpg = pageOf(moreAll, Math.max(1, Number(one(sp.mp)) || 1), mSize);
  const moreRows = mpg.rows;
  const targetable = [...new Map(o.more.flatMap((m) => m.recs.map((r) => [r.pid, r.product] as const))).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const mKeep = { ...keep, mq: one(sp.mq) || undefined, mprod: mprod || undefined, msize: mSize === MORE_PAGE ? undefined : mSize };
  const f = per.funnel, pf = prev?.funnel ?? null;
  const ratio = (a: number, b: number) => (b > 0 ? a / b : null);
  const was = (a: keyof typeof f, b: keyof typeof f) => (pf ? ratio(pf[a], pf[b]) : null);
  // Each rate in plain words ("x of every 100 …") and against the same number of days just before.
  const steps = [
    { k: "requested", label: "Sample Requested", n: f.requested, r: null as number | null, was: null as number | null, rateLabel: "" },
    { k: "approved", label: "Approved", n: f.approved, r: ratio(f.approved, f.requested), was: was("approved", "requested"), rateLabel: "Approval Rate" },
    { k: "delivered", label: "Delivered", n: f.delivered, r: ratio(f.delivered, f.approved), was: was("delivered", "approved"), rateLabel: "Delivered" },
    { k: "posted", label: "Posted Content", n: f.posted, r: ratio(f.posted, f.delivered), was: was("posted", "delivered"), rateLabel: "Post Rate" },
    { k: "sold", label: "Generated Sales", n: f.sold, r: ratio(f.sold, f.posted), was: was("sold", "posted"), rateLabel: "Sales Rate" },
  ].map((st) => ({ ...st, rate: st.r == null ? (st.k === "requested" ? null : "–") : `${Math.round(st.r * 100)}%` }));
  const fMax = Math.max(1, f.requested);
  const dview = one(sp.d) ?? "";
  // One search across everything in a row: creator, product, approved/rejected, this app/TikTok, who, and the date. Every word must match.
  const words = (one(sp.q) ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const textOf = (d: (typeof per.decisions)[number]) => [d.creator, `@${d.creator}`, d.product, d.approved ? "approved" : "rejected", d.source === "app" ? `this app ${d.by ?? ""}` : "tiktok seller center", fmtDayLabel(d.day), d.day].join(" ").toLowerCase();
  const decisions = per.decisions.filter((d) => (dview === "approved" ? d.approved : dview === "rejected" ? !d.approved : dview === "app" ? d.source === "app" : dview === "tiktok" ? d.source === "tiktok" : true) && words.every((w) => textOf(d).includes(w)));
  const byPerson = new Map<string, number>();
  for (const d of per.decisions) { const k = d.source === "app" ? d.by ?? "Unknown" : "TikTok Seller Center"; byPerson.set(k, (byPerson.get(k) ?? 0) + 1); }
  const writeReason = !o.flags.connected ? "TikTok Shop is not connected." : !o.flags.write ? "TikTok has not granted the approve permission yet (seller.affiliate_collaboration.write). Reconnect TikTok in Settings after switching it on in Partner Center." : o.flags.reviewOn ? "On: approvals go to TikTok and cannot be undone." : "Off: the system only reads until the owner switches this on.";

  return (
    <div className="space-y-5">
      <PageHeader title="Creator Outreach" description="How creators come in: suggestions, a sample request, your decision, then shipping, delivery and the first post. After the first post they continue in Creators. Existing creators come first: fix samples that have not sold before paying for new ones."
        actions={<>
          <span className="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-[13px] font-medium text-ink-2" data-testid="review-card" title={writeReason}>
            Approve Samples Here
            {isOwner && o.flags.write ? <ReviewSwitch on={o.flags.reviewOn} /> : <Badge tone={o.flags.reviewOn && o.flags.write ? "good" : "neutral"}>{o.flags.reviewOn && o.flags.write ? "On" : "Off"}</Badge>}
            <span className="sr-only" data-testid="review-status">{writeReason}</span>
          </span>
          <DatesPicker from={raw.from ?? ""} to={raw.to ?? ""} today={today} emptyLabel="Last 30 Days" emptyKey="30d" />
        </>} />

      <div className="-mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12.5px] text-ink-3" data-testid="rules">
        <span className="inline-flex items-center gap-1 font-semibold text-ink-2"><ShieldCheck className="size-3.5 text-brand" />Criteria</span>
        <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 font-semibold text-brand"><Star className="size-3" />Level {o.rules.level}+</span>
        <span className="inline-flex items-center gap-1">
          <Tag className="size-3.5" />{o.rules.categories.length} Categories
          <InfoTip label="Categories">
            <ul className="space-y-0.5">{o.rules.categories.map((c) => <li key={c}>{c}</li>)}</ul>
            <p className="mt-2 text-ink-3">Anything else TikTok shows (recommended tag, promotion score, ratings) only orders the list; it never makes a creator eligible. Where TikTok does not show a level, the creator is marked Not Sure, not rejected.</p>
            {(o.rules.error || o.rules.missing.length > 0) && <p className="mt-2 text-warn" data-testid="rules-error">{o.rules.error ? `Could not read TikTok's category list: ${o.rules.error}` : `TikTok has no category called: ${o.rules.missing.join(", ")}.`}</p>}
          </InfoTip>
        </span>
        <span className="sr-only">{o.rules.categories.join(", ")}</span>
        <span className="text-ink-3">· {rangeLabel}</span>
      </div>

      <nav aria-label="Pipeline" className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7" data-testid="pipeline">
        {PIPELINE.map((p, i) => (
          <Link key={p.key} href={href("/affiliate/outreach", { ...keep, stage: p.key === "suggested" ? undefined : p.key })} title={p.help} aria-current={p.key === view ? "page" : undefined}
            className={cn("relative rounded-2xl border px-4 py-3 transition-colors", p.key === view ? "border-brand/40 bg-brand-soft" : "border-line bg-surface hover:bg-surface-2")}>
            <p className="flex items-center justify-between text-[12.5px] font-medium text-ink-3"><span className="flex items-center gap-1.5">{(() => { const I = PIPE_ICON[p.key]; return <I className={cn("size-4", p.key === view ? "text-brand" : "text-ink-3")} />; })()}{p.label}</span>{i < PIPELINE.length - 1 && <ArrowRight className="hidden size-3.5 lg:block" />}</p>
            <p className={cn("tnum text-[24px] leading-tight font-semibold", p.key === view ? "text-brand" : "text-ink")}>{o.counts[p.key].toLocaleString("en-MY")}</p>
          </Link>
        ))}
        <Link href={href("/affiliate/outreach", { ...keep, stage: "history" })} aria-current={view === "history" ? "page" : undefined} data-testid="history-tab"
          className={cn("rounded-2xl border px-4 py-3 transition-colors", view === "history" ? "border-brand/40 bg-brand-soft" : "border-line bg-surface hover:bg-surface-2")}>
          <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink-3"><History className={cn("size-4", view === "history" ? "text-brand" : "text-ink-3")} />Approval History</p>
          <p className={cn("tnum text-[24px] leading-tight font-semibold", view === "history" ? "text-brand" : "text-ink")}>{per.decisions.length.toLocaleString("en-MY")}</p>
        </Link>
      </nav>

      {g.high && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-warn/50 bg-warn-soft px-4 py-3 text-[13.5px] text-ink" data-testid="guard-banner">
          <b className="inline-flex items-center gap-1.5"><BellRing className="size-4 text-warn" />Chase idle samples first</b>
          <span>{(g.notPosted + g.noSale).toLocaleString("en-MY")} samples sent {isLife ? "" : "in these dates "}are not selling yet:</span>
          <Link href={href("/creators", { status: "Silent", sfrom: range.start, sto: range.end })} className="font-semibold text-brand hover:underline" data-testid="guard-notposted">{g.notPosted.toLocaleString("en-MY")} delivered, not posted</Link>
          <span className="text-ink-3">·</span>
          <Link href={href("/creators", { status: "Posted", sfrom: range.start, sto: range.end })} className="font-semibold text-brand hover:underline" data-testid="guard-nosale">{g.noSale.toLocaleString("en-MY")} posted, no sale</Link>
          <InfoTip label="How this is counted">Counted per creator and product (one creator can hold several samples): a sample delivered with nothing posted after 14 days, or posted with no sale yet. The warning shows when these are a quarter or more of all samples sent. Each link opens exactly these samples in Creators.</InfoTip>
        </div>
      )}

      <Card data-testid="funnel-card">
        <CardHeader title="Outreach Conversion" description="Sample requests made in your chosen dates, and how far they got: approved, delivered, posted, and sold the product. From your own data. Each rate is against the step before. 'was' is the same rate in the same number of days just before." action={<span className="tnum text-[12.5px] text-ink-3">{rangeLabel} · sales {fmtRM(f.sales)}{isLife ? "" : ` · vs ${fmtDayLabel(prevRange.start)} – ${fmtDayLabel(prevRange.end)}`}</span>} />
        <ul className="space-y-1.5 px-5 pb-5" data-testid="funnel">
          {steps.map((st) => (
            <li key={st.k} className="grid grid-cols-[150px_1fr] items-center gap-3 sm:grid-cols-[230px_1fr]">
              <span className="text-right" data-testid={st.r != null ? "funnel-rate" : undefined}>{st.rate ? (
                <>
                  <span className="flex items-center justify-end gap-1.5"><span className="text-[11.5px] font-medium text-ink-3">{st.rateLabel}</span><b className="tnum text-[17px] leading-tight text-ink">{st.rate}</b>{st.r != null && st.was != null && Math.round((st.r - st.was) * 100) !== 0 ? <span className={cn("tnum rounded-full px-1.5 text-[11px] font-semibold", st.r > st.was ? "bg-good-soft text-good" : "bg-critical-soft text-critical")} title={`${fmtDayLabel(prevRange.start)} – ${fmtDayLabel(prevRange.end)}`}>{st.r > st.was ? "▲" : "▼"} was {Math.round(st.was * 100)}%</span> : st.was != null ? <span className="text-[11px] text-ink-3">same</span> : null}</span>
                </>
              ) : <span className="text-[11.5px] text-ink-3">start</span>}</span>
              <span className="relative overflow-hidden rounded-lg bg-surface-2">
                <span className="absolute inset-y-0 left-0 rounded-lg bg-brand/20" style={{ width: `${Math.max(1.5, (st.n / fMax) * 100)}%` }} />
                <span className="relative flex items-center justify-between px-3 py-2.5 text-[13.5px]"><span className="font-medium text-ink">{st.label}</span><b className="tnum text-ink">{st.n.toLocaleString("en-MY")}</b></span>
              </span>
            </li>
          ))}
        </ul>
      </Card>

      {view === "history" ? (
        <Card data-testid="history">
          <CardHeader title="Approval History" description="Every sample request approved or rejected in your chosen dates. From This App shows who pressed the button. From TikTok means it was decided in TikTok Seller Center; its time is when our sync first saw it (marked ≈ when only the shipping date is known)." />
          <div className="flex flex-wrap items-center gap-2 px-5 pb-3">
            <UrlSearch placeholder="Search creator, product, approved, TikTok, a name…" testId="history-search" />
            {([["", "All"], ["approved", "Approved"], ["rejected", "Rejected"], ["app", "From This App"], ["tiktok", "From TikTok"]] as const).map(([k, label]) => (
              <Link key={k || "all"} href={href("/affiliate/outreach", { ...keep, stage: "history", d: k || undefined, q: one(sp.q) || undefined })} scroll={false} aria-current={dview === k ? "page" : undefined} className={cn("inline-flex h-8 items-center rounded-full border px-3 text-[13px] font-medium", dview === k ? "border-brand/40 bg-brand-soft text-brand" : "border-line text-ink-2 hover:bg-surface-2")}>{label}</Link>
            ))}
            <span className="ml-auto flex flex-wrap gap-2 text-[12.5px] text-ink-3">{[...byPerson].map(([k, n]) => <span key={k} className="rounded-full bg-surface-2 px-2.5 py-0.5"><b className="text-ink-2">{k}</b> {n}</span>)}</span>
          </div>
          {words.length > 0 && <p className="px-5 pb-2 text-[12.5px] text-ink-3" data-testid="history-found">{decisions.length.toLocaleString("en-MY")} of {per.decisions.length.toLocaleString("en-MY")} match “{one(sp.q)}”</p>}
          {decisions.length === 0 ? <p className="px-5 py-10 text-center text-[14px] text-ink-3">{words.length ? "Nothing matches this search in these dates." : "No approvals or rejections in these dates."}</p> : (
            <ul data-testid="history-rows">
              {decisions.map((d) => (
                <li key={d.id} className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 border-t border-line px-5 py-2.5 text-[13.5px] sm:grid-cols-[110px_minmax(160px,1fr)_minmax(160px,1fr)_120px_minmax(150px,auto)]">
                  <span className="tnum text-ink-3">{d.approx ? "≈ " : ""}{fmtDayLabel(d.day)}</span>
                  <OpenPanelButton username={d.creator} className="truncate text-left font-semibold text-brand hover:underline" />
                  <span className="text-ink-2">{d.product}</span>
                  <span><Badge tone={d.approved ? "good" : "critical"}>{d.approved ? "Approved" : "Rejected"}</Badge></span>
                  <span className="inline-flex items-center gap-1.5 text-ink-2">{d.source === "app" ? <><UserCheck className="size-3.5 text-brand" />{d.by ?? "This App"}</> : <><ExternalLink className="size-3.5 text-ink-3" />TikTok Seller Center</>}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : stage === "suggested" ? (
        <div className="space-y-6">
          <Card data-testid="more-samples">
            <CardHeader title="Existing Affiliates" description="Creators who sold for you in the chosen dates, had a sample before, and have no sample still waiting to be posted or on the way. Best sellers first. Each shows the products to offer next: the % is how many creators who sell the same things also sell that product." />
            <div className="flex flex-wrap items-center gap-2 px-5 pb-3">
              <p className="mr-auto text-[13px] text-ink-2" data-testid="more-why">
                <b className="tnum text-[15px] text-ink">{o.more.length.toLocaleString("en-MY")}</b> creators can get another sample
                <InfoTip label="Who is counted">Sold for you in the chosen dates, had a sample before, and no sample still waiting to be posted or on the way.</InfoTip>
              </p>
              <UrlSearch placeholder="Find a creator" param="mq" testId="more-search" />
              <ProductPick options={targetable} value={mprod} param="mprod" label="Product" allLabel="All Products" />
            </div>
            {moreAll.length === 0 ? <p className="border-t border-line px-5 py-8 text-center text-[13.5px] text-ink-3">{o.more.length ? "Nobody matches. Clear the search or the product." : "Nobody qualifies right now."}</p> : (
              <ul>
                {moreRows.map((m) => (
                  <li key={m.username} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 border-t border-line px-5 py-3 text-[13.5px] lg:grid-cols-[minmax(180px,0.8fr)_130px_minmax(300px,2.2fr)]" data-testid="more-row">
                    <div className="min-w-0">
                      <OpenPanelButton username={m.username} className="truncate text-left font-semibold text-brand hover:underline" />
                      <p className="flex items-center gap-1.5 text-[12px] text-ink-3">{m.followers != null ? `${fmtCompact(m.followers)} followers` : ""}{m.verdict?.status === "eligible" && <span className="inline-flex items-center gap-0.5 font-semibold text-good"><ShieldCheck className="size-3" />meets criteria</span>}</p>
                    </div>
                    <p className="tnum text-right font-semibold text-ink lg:text-left">{fmtRM(m.sales28)}<span className="block text-[11.5px] font-normal text-ink-3">{isLife ? "lifetime sales" : "sales in these dates"}</span></p>
                    <div className="col-span-2 flex flex-wrap items-center gap-1.5 lg:col-span-1" data-testid="offer-next">
                      {m.recs.length ? m.recs.map((r) => (
                        <span key={r.pid} className={cn("inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12px]", mprod === r.pid ? "border-brand bg-brand-soft text-brand" : "border-line text-ink-2")} title={`${Math.round(r.pct * 100)}% of creators who sell ${r.from} also sell ${r.product}${r.typical ? `. One creator typically sells RM ${Math.round(r.typical).toLocaleString("en-MY")} of it in 28 days` : ""}`}>
                          <Gift className="size-3.5 shrink-0 text-brand" />
                          <span className="font-medium text-ink">{r.product}</span>
                          <b className="tnum text-brand">{Math.round(r.pct * 100)}%</b>
                        </span>
                      )) : <span className="text-[12px] text-ink-3">Already sells or got every product that goes with theirs.</span>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {moreAll.length > 0 && <div className="border-t border-line"><Pagination page={mpg.page} pages={mpg.pages} total={moreAll.length} pageSize={mpg.pageSize} size={mSize} hrefFor={(n) => href("/affiliate/outreach", { ...mKeep, mp: n > 1 ? n : undefined })} sizeHrefFor={(z) => href("/affiliate/outreach", { ...mKeep, msize: z === MORE_PAGE ? undefined : z })} /></div>}
          </Card>
          <Card data-testid="tiktok-card">
            <CardHeader title="Recommended Affiliates" description="From TikTok's Creator Marketplace in your categories, leaving out creators you invited in the last 90 days, and only those meeting your criteria (level 5+, your categories). TikTok's own numbers for its last 30 days. The system fetches it in the background every 6 hours and keeps it, so this list never waits for TikTok." action={<a href="https://affiliate.tiktok.com/connection/creator?shop_region=MY" target="_blank" rel="noreferrer" className="text-[13px] font-semibold text-brand hover:underline">Open In TikTok</a>} />
            <p className="flex items-center gap-1.5 px-5 pb-2 text-[12.5px] text-ink-3" data-testid="tiktok-updated">
              {o.tiktok.fetching ? <><span className="size-2 animate-pulse rounded-full bg-brand" />Getting the latest list from TikTok now…</> : o.tiktok.ok && o.tiktok.at ? <><span className="size-2 rounded-full bg-good" />Updated {new Date(o.tiktok.at).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</> : null}
              {o.tiktok.ok && o.tiktok.note && !o.tiktok.fetching && <span>· the last refresh was refused by TikTok, so this is the previous list; it tries again by itself</span>}
              {o.tiktok.detail && <InfoTip label="What TikTok said">TikTok&apos;s exact answer to the last try (send this to the developer if the list stays empty): <code className="break-all">{o.tiktok.detail}</code></InfoTip>}
            </p>
            {o.tiktok.ok ? <FindCreators initial={o.tiktok.creators} hidden={o.tiktok.hidden} catNames={o.tiktok.catNames} /> : (
              <div className="px-5 py-10 text-center" data-testid="tiktok-unavailable">
                <Sparkles className="mx-auto mb-2 size-5 text-brand" />
                <p className="text-[13.5px] text-ink-2">{o.tiktok.fetching || o.tiktok.error === "fetching" ? "The first list is on its way from TikTok. It appears here by itself within a few minutes." : /busy/i.test(o.tiktok.error) ? "TikTok asked us to slow down. The system keeps trying every 10 minutes; nothing to do on your side." : o.tiktok.error}</p>
              </div>
            )}
          </Card>
        </div>
      ) : (
        <Card>
          <div className="space-y-3 border-b border-line px-5 py-3.5">
            <div><h2 className="text-[15px] font-semibold text-ink">{def.label}</h2><p className="text-[13px] text-ink-3">{def.help}</p></div>
            {stage === "requested" && (
              <>
                <nav aria-label="Eligibility" className="flex flex-wrap gap-2" data-testid="fit-filter">
                  {([["", "All"], ["eligible", "Eligible · Meets Criteria"], ["unknown", "Not Sure"], ["unchecked", "Not Checked"], ["not", "Not Eligible"]] as const).map(([k, label]) => {
                    const n = k === "" ? o.samples.requested.length : o.samples.requested.filter((c) => (k === "unchecked" ? !c.verdict : c.verdict?.status === k)).length;
                    return <Link key={k || "all"} href={href("/affiliate/outreach", { ...keep, stage: "requested", fit: k || undefined })} scroll={false} aria-current={fit === k ? "page" : undefined} className={cn("inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium", fit === k ? "border-brand/40 bg-brand-soft text-brand" : k === "eligible" ? "border-good/40 text-good hover:bg-good-soft" : "border-line text-ink-2 hover:bg-surface-2")}>{label}<span className="tnum text-[12px] text-ink-3">{n}</span></Link>;
                  })}
                </nav>
                <CheckEligibility unchecked={o.unchecked} />
              </>
            )}
          </div>
          {list.length === 0 ? <p className="px-5 py-10 text-center text-[14px] text-ink-3">Nobody is in this stage right now.</p> : (
            <ul data-testid="stage-list">{list.map((s) => <Card1 key={s.id} s={s} enabled={o.flags.reviewOn && o.flags.write} canReview={canReview} />)}</ul>
          )}
        </Card>
      )}
    </div>
  );
}
