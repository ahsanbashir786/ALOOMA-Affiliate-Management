import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Lightbulb } from "lucide-react";
import { getCurrentUser, can, mayEditContacts } from "@/lib/auth";
import { periodQuery, resolvePeriod } from "@/lib/period";
import { analyse, buildRecommendation } from "@/lib/analytics/recommendations";
import { getCreatorDetail } from "@/lib/analytics/creator-detail";
import { FLAGS, SEGMENTS } from "@/lib/segments";
import { Badge, Card, CardHeader, PageHeader, Td, Th } from "@/components/ui/primitives";
import { KpiCard } from "@/components/ui/kpi-card";
import { TrendChart } from "@/components/charts/trend-chart";
import { SegmentBadge } from "@/components/creators/segment-badge";
import { ContactForm, NotesForm } from "@/components/creators/creator-tools";
import { ResultBadge } from "@/components/samples/result-badge";
import { CONTENT_TYPE_LABEL, getCreatorSamples } from "@/lib/samples/analysis";
import { db } from "@/db";
import { creators } from "@/db/schema";
import { eq } from "drizzle-orm";
import { MessageBox } from "@/components/ui/message-box";
import { getCreatorWorkspace } from "@/lib/workflow/timeline";
import { CreatorTimeline } from "@/components/today/creator-timeline";
import { CreatorActions } from "@/components/today/creator-actions";
import { todayKL } from "@/lib/time";
import { RELATIONSHIP } from "@/lib/workflow/relationship";
import { loadRelationships } from "@/lib/workflow/relationships";
import { fmtDayLabel, fmtDateTimeKL } from "@/lib/time";
import { fmtCompact, fmtDate, fmtInt, fmtPct, fmtRM, initials, pctChange } from "@/lib/utils";

export async function generateMetadata({ params }: PageProps<"/creators/[username]">): Promise<Metadata> {
  return { title: decodeURIComponent((await params).username) };
}

const STATUS_TONE = { open: "brand", in_progress: "warn", sent: "good", done: "good", dismissed: "neutral" } as const;
const SERIES = [
  { key: "video", label: "Videos", color: "var(--s1)" },
  { key: "live", label: "LIVE", color: "var(--s2)" },
  { key: "showcase", label: "Showcase", color: "var(--s3)" },
  { key: "etp", label: "External traffic", color: "var(--s4)" },
];

/** Contact details, samples and staff-logged videos – shown whether or not the creator sold in this period. */
async function CreatorExtras({ username, canEdit }: { username: string; canEdit: boolean }) {  // canEdit = may edit WhatsApp numbers
  const [[contact], samples] = await Promise.all([
    db.select({ phone: creators.phone, approach: creators.approach }).from(creators).where(eq(creators.username, username)).limit(1),
    getCreatorSamples(username),
  ]);
  return (
    <section className="grid gap-4 lg:grid-cols-3">
      <Card>
        <CardHeader title="Contact" description="Used for WhatsApp links in the tracker and Action centre." />
        <div className="px-5 pb-5">
          <ContactForm username={username} phone={contact?.phone ?? null} approach={contact?.approach ?? null} canEdit={canEdit} />
        </div>
      </Card>
      <Card className="lg:col-span-2">
        <CardHeader
          title="Samples"
          description="Free samples to this creator and whether content followed."
          action={<Link href={`/samples?q=${encodeURIComponent(username)}&view=all`} className="text-[13px] font-medium text-brand hover:underline">Open in tracker</Link>}
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse">
            <thead>
              <tr><Th>Product</Th><Th>Approved</Th><Th>Delivered</Th><Th>Posted</Th><Th>Result</Th><Th align="right">Sales after</Th></tr>
            </thead>
            <tbody>
              {samples.map((x) => (
                <tr key={x.id}>
                  <Td className="max-w-[260px]">
                    <span className="line-clamp-1">{x.name ?? x.variation ?? x.sku}</span>
                    <span className="text-[11.5px] text-ink-3">{x.sku}</span>
                  </Td>
                  <Td className="whitespace-nowrap text-ink-2">{x.approved ? fmtDate(x.approved) : "–"}</Td>
                  <Td className="whitespace-nowrap text-ink-2">{x.delivered ? fmtDate(x.delivered) : "–"}</Td>
                  <Td className="whitespace-nowrap text-ink-2">
                    {x.post_link ? <a href={x.post_link} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">{x.posted ? fmtDate(x.posted) : "video"}</a> : x.posted ? fmtDate(x.posted) : "–"}
                  </Td>
                  <Td><ResultBadge result={x.r} /></Td>
                  <Td align="right">{x.gmv ? fmtRM(x.gmv) : "–"}</Td>
                </tr>
              ))}
              {!samples.length && <tr><Td colSpan={6} className="py-8 text-center text-ink-3">No samples recorded.</Td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  );
}

type Workspace = Awaited<ReturnType<typeof getCreatorWorkspace>>;
type RelRow = Awaited<ReturnType<typeof loadRelationships>> extends Map<string, infer V> ? V | undefined : never;

/** Relationship, quick actions and the activity timeline – available for every creator, with or without sales or samples. */
function WorkspaceCard({ username, ws, relRow, canEdit }: { username: string; ws: Workspace; relRow: RelRow; canEdit: boolean }) {
  return (
  <Card>
        <CardHeader title="Activity timeline" description="Built automatically from staff actions, samples and verified content. Sales after a contact are shown for context only – they are not proof the contact caused them." />
        {canEdit && <CreatorActions username={username} paused={ws.summary.status === "paused"} today={todayKL()} />}
        {relRow && <p className="px-5 pb-2 text-[13px]"><span className="text-ink-3">Relationship:</span> <Badge tone={RELATIONSHIP[relRow.status].tone}>{RELATIONSHIP[relRow.status].label}</Badge> <span className="text-ink-3">{RELATIONSHIP[relRow.status].hint}</span></p>}
        <div className="grid gap-3 px-5 pb-4 sm:grid-cols-2 lg:grid-cols-4 text-[13px]">
          <p><span className="text-ink-3">Last contact</span><br />{ws.summary.lastContactedAt ? fmtDateTimeKL(ws.summary.lastContactedAt) : "–"}</p>
          <p><span className="text-ink-3">Next action</span><br />{ws.summary.nextOn ? fmtDayLabel(ws.summary.nextOn) : "–"}{ws.summary.status === "paused" ? " (paused)" : ""}</p>
          <p><span className="text-ink-3">Promised date</span><br />{ws.summary.promiseOn ? `${fmtDayLabel(ws.summary.promiseOn)} · ${(() => { const [st, prog] = (ws.summary.promiseState ?? "").split(":"); return st === "fulfilled" ? `content seen${prog ? ` (${prog})` : ""}` : st === "partial" ? `partly done (${prog})` : st === "review" ? "possible match to review" : "not seen yet"; })()}` : "–"}</p>
          <p><span className="text-ink-3">Samples · confirmed content</span><br />{ws.summary.samples} · {ws.summary.verifiedContent}</p>
          <p className="sm:col-span-2"><span className="text-ink-3">Sales since last contact (context only)</span><br />{ws.summary.gmvSinceContact == null ? "–" : fmtRM(ws.summary.gmvSinceContact)}</p>
          <p className="sm:col-span-2"><span className="text-ink-3">Sales, last 28 days of data</span><br />{fmtRM(ws.summary.gmv28)}</p>
        </div>
        <CreatorTimeline entries={ws.entries} canUndo={canEdit} />
  </Card>
  );
}

export default async function CreatorPage({ params, searchParams }: PageProps<"/creators/[username]">) {
  const username = decodeURIComponent((await params).username);
  const period = await resolvePeriod(await searchParams);
  const user = await getCurrentUser();
  const canEdit = !!user && can(user, "manager");
  const canPhone = !!user && mayEditContacts(user);
  const qs = periodQuery(period);

  const analysis = await analyse(period);
  const c = analysis.classified.find((x) => x.username === username);
  if (!c) {
    return (
      <div className="space-y-5">
        <Link href={`/affiliates?${qs}`} className="inline-flex items-center gap-1.5 text-[13.5px] text-ink-2 hover:text-ink">
          <ArrowLeft className="size-4" /> Affiliates Overview
        </Link>
        <PageHeader title={username} description={`No sales for this creator in ${period.label.toLowerCase()} or the period before.`} />
        <WorkspaceCard username={username} ws={await getCreatorWorkspace(username)} relRow={(await loadRelationships([username])).get(username)} canEdit={canEdit} />
        <CreatorExtras username={username} canEdit={canPhone} />
      </div>
    );
  }
  const detail = await getCreatorDetail(username, period);
  const ws = await getCreatorWorkspace(username);
  const relRow = (await loadRelationships([username])).get(username);
  const rec = buildRecommendation(c, period, analysis.thresholds, analysis.names);
  const hasPrev = period.prevEnd >= period.dataMin;
  const maxProd = Math.max(1, ...detail.products.map((p) => p.gmv));
  const seg = c.segment ? SEGMENTS[c.segment] : null;

  return (
    <div className="space-y-6">
      <Link href={`/affiliates?${qs}`} className="inline-flex items-center gap-1.5 text-[13.5px] text-ink-2 hover:text-ink">
        <ArrowLeft className="size-4" /> Affiliates Overview
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="flex size-14 items-center justify-center rounded-full bg-brand-soft text-[18px] font-semibold text-brand-strong">
            {initials(username)}
          </span>
          <div>
            <h1 className="text-[26px] font-semibold tracking-tight text-ink">{username}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <SegmentBadge segment={c.segment} />
              {c.flags.map((f) => (
                <Badge key={f} tone="neutral" className="text-[11.5px]">{FLAGS[f].label}</Badge>
              ))}
              {detail.doNotContact && <Badge tone="critical">Do not contact</Badge>}
              {c.contentType && <Badge tone={c.contentType === "live" ? "brand" : "neutral"}>{CONTENT_TYPE_LABEL[c.contentType]} creator</Badge>}
              <span className="tnum text-[13px] text-ink-3">
                Rank #{c.rank}{c.followers != null ? ` · ${fmtCompact(c.followers)} followers` : ""}
              </span>
            </div>
          </div>
        </div>
        <a
          href={`https://www.tiktok.com/@${username}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3.5 text-[14px] font-medium text-ink shadow-card hover:bg-surface-2"
        >
          TikTok profile <ExternalLink className="size-4 text-ink-3" />
        </a>
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="GMV" value={fmtRM(c.gmv)} delta={hasPrev ? pctChange(c.gmv, c.prevGmv) : undefined} sub={hasPrev ? `was ${fmtRM(c.prevGmv)}` : undefined} />
        <KpiCard label="Orders" value={fmtInt(c.orders)} delta={hasPrev ? pctChange(c.orders, c.prevOrders) : undefined} />
        <KpiCard label="Avg. order" value={fmtRM(c.orders ? c.gmv / c.orders : 0, 2)} />
        <KpiCard label="Commission" value={fmtRM(c.commission)} sub={c.gmv ? `${fmtPct(c.commission / c.gmv, 1)} of GMV` : undefined} />
        <KpiCard label="New videos / wk" value={c.vpw == null ? "–" : c.vpw.toFixed(1)} sub={c.videosPosted != null ? `${c.videosPosted} posted, ${c.livesPosted ?? 0} LIVE` : "no posting data"} hint="Shoppable videos posted in the transaction snapshot window." />
        <KpiCard label="Cancelled / returned" value={c.gross ? fmtPct(c.cancelRate, 0) : "–"} invert sub={`${fmtPct(c.codShare, 0)} COD`} />
      </section>

      {rec ? (
        <Card className="border-brand/30">
          <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex size-8 items-center justify-center rounded-lg bg-brand-soft text-brand"><Lightbulb className="size-4" /></span>
              <div>
                <h2 className="text-[16px] font-semibold text-ink">{rec.title}</h2>
                <p className="mt-0.5 max-w-3xl text-[13.5px] text-ink-2">{rec.reason}</p>
                {seg && <p className="mt-1 text-[13px] text-ink-3">Playbook: {seg.playbook}</p>}
              </div>
            </div>
            {rec.expectedUplift > 0 && (
              <div className="text-right">
                <p className="tnum text-[20px] font-semibold text-good">+{fmtRM(rec.expectedUplift)}</p>
                <p className="text-[12px] text-ink-3" title="An assumption-based scenario, not a forecast or a target.">scenario (assumption)</p>
              </div>
            )}
          </div>
          <MessageBox className="m-5 rounded-lg border border-line bg-surface-2 p-4" en={rec.instruction} ms={rec.instructionMs} phone={c.phone} />
          <div className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-3.5">
          </div>
        </Card>
      ) : (
        <Card className="px-5 py-4 text-[14px] text-ink-2">
          {seg ? <>No action needed right now. {seg.summary}</> : "Below the seller threshold – no recommendation for this period."}
        </Card>
      )}

      <WorkspaceCard username={username} ws={ws} relRow={relRow} canEdit={canEdit} />

      <section className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Sales over time" description="Valid GMV by content type." />
          <div className="px-5 pb-5">
            <TrendChart data={detail.trend} series={SERIES} weekly={detail.bucket === "week"} height={250} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Products" description="Share of this creator's GMV." />
          <ul className="px-5 pb-4">
            {detail.products.slice(0, 7).map((p) => (
              <li key={p.productId} className="border-t border-line py-2.5 first:border-t-0">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[13.5px] leading-snug text-ink">{p.name}</span>
                  <span className="tnum shrink-0 text-[13.5px] font-medium text-ink">{fmtRM(p.gmv)}</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full rounded-full bg-brand" style={{ width: `${(p.gmv / maxProd) * 100}%` }} />
                </div>
              </li>
            ))}
            {!detail.products.length && <li className="py-6 text-center text-[13px] text-ink-3">No sales in this period.</li>}
          </ul>
        </Card>
      </section>

      <Card>
        <CardHeader title="Top videos" description="Videos that sold in this period, with their age – old videos still earning are your evergreen winners." />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse">
            <thead>
              <tr>
                <Th>Video</Th>
                <Th>Posted</Th>
                <Th align="right">Age</Th>
                <Th align="right">GMV</Th>
                <Th align="right">Orders</Th>
                <Th align="right">Views</Th>
                <Th align="right">CTR</Th>
                <Th align="right">GPM</Th>
              </tr>
            </thead>
            <tbody>
              {detail.videos.map((v) => (
                <tr key={v.videoId} className="hover:bg-surface-2/60">
                  <Td className="max-w-[320px]">
                    {v.link ? (
                      <a href={v.link} target="_blank" rel="noopener noreferrer" className="line-clamp-1 text-ink hover:text-brand hover:underline">
                        {v.title || `Video ${v.videoId.slice(-6)}`}
                      </a>
                    ) : (
                      <span className="line-clamp-1">{v.title || `Video ${v.videoId.slice(-6)}`}</span>
                    )}
                  </Td>
                  <Td className="whitespace-nowrap text-ink-2">{v.postedAt ? fmtDate(v.postedAt) : "–"}</Td>
                  <Td align="right" className="text-ink-2">{v.ageDays == null ? "–" : `${Math.round(v.ageDays)}d`}</Td>
                  <Td align="right" className="font-medium">{fmtRM(v.gmv)}</Td>
                  <Td align="right">{fmtInt(v.orders)}</Td>
                  <Td align="right">{v.views == null ? "–" : fmtCompact(v.views)}</Td>
                  <Td align="right">{v.ctr == null ? "–" : fmtPct(v.ctr, 1)}</Td>
                  <Td align="right">{v.gpm == null ? "–" : fmtRM(v.gpm)}</Td>
                </tr>
              ))}
              {!detail.videos.length && (
                <tr><Td colSpan={8} className="py-8 text-center text-ink-3">No video sales in this period.</Td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <CreatorExtras username={username} canEdit={canPhone} />

      <section className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="TikTok sample stats" description="From the sample analysis export." />
          <div className="px-5 pb-5">
            {detail.sample ? (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[14px]">
                {[
                  ["Requested", fmtInt(detail.sample.requested)],
                  ["Shipped", fmtInt(detail.sample.shipped)],
                  ["Posting rate", fmtPct(detail.sample.postingRate, 0)],
                  ["Videos / LIVEs", `${detail.sample.videos} / ${detail.sample.lives}`],
                  ["45-day ROI", detail.sample.roi45.toFixed(1)],
                  ["90-day ROI", detail.sample.roi90.toFixed(1)],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-[12.5px] text-ink-3">{k}</dt>
                    <dd className="tnum font-medium text-ink">{v}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-[13.5px] text-ink-3">No samples recorded for this creator in this period.</p>
            )}
            {detail.cancelReasons.length > 0 && (
              <div className="mt-5 border-t border-line pt-4">
                <p className="mb-2 text-[12.5px] font-medium text-ink-3">Why orders were cancelled</p>
                <ul className="space-y-1.5 text-[13.5px]">
                  {detail.cancelReasons.map((r) => (
                    <li key={r.reason} className="flex justify-between gap-3">
                      <span className="text-ink-2">{r.reason}</span>
                      <span className="tnum font-medium">{r.n}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Notes" />
          <div className="px-5 pb-5">
            <NotesForm username={username} notes={detail.notes ?? ""} doNotContact={detail.doNotContact} canEdit={canEdit} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Action history" />
          <ul className="px-5 pb-4">
            {detail.history.map((a) => (
              <li key={a.id} className="border-t border-line py-3 first:border-t-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13.5px] font-medium text-ink">{a.title}</span>
                  <Badge tone={STATUS_TONE[a.status]}>{a.status.replace("_", " ")}</Badge>
                </div>
                <p className="mt-0.5 text-[12.5px] text-ink-3">{fmtDate(a.createdAt)}</p>
              </li>
            ))}
            {!detail.history.length && <li className="py-6 text-center text-[13px] text-ink-3">No actions yet.</li>}
          </ul>
        </Card>
      </section>
    </div>
  );
}
