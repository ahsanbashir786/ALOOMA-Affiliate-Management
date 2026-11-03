import type { Metadata } from "next";
import Link from "next/link";
import { asc, sql } from "drizzle-orm";
import { Gift, HelpCircle } from "lucide-react";
import { db } from "@/db";
import { users } from "@/db/schema";
import { can, mayEditContacts, requireUser } from "@/lib/auth";
import { getThresholds } from "@/lib/analytics/settings";
import { getCreatorsMatching, getSampleLines, getSampleScorecard, getSampleTotals, getUnknownLines } from "@/lib/samples/analysis";
import { QUEUES, VERDICTS, type SampleVerdict } from "@/lib/samples/states";
import { href, one, periodParams, type SP } from "@/lib/url";
import { sampleRange } from "@/lib/samples/range";
import { Button, Card, EmptyState, Input, PageHeader } from "@/components/ui/primitives";
import { KpiCard } from "@/components/ui/kpi-card";
import { Pagination } from "@/components/ui/pagination";
import { SamplesNav } from "@/components/samples/samples-nav";
import { FilesBar } from "@/components/samples/files-bar";
import { CreatorGroup } from "@/components/samples/creator-group";
import { SampleLineCard } from "@/components/samples/sample-line";
import { BuyerMatchForm } from "@/components/samples/buyer-match";
import { RefreshSamplesButton } from "@/components/samples/refresh-button";
import { cn, fmtDate, fmtInt, fmtRM } from "@/lib/utils";

export const metadata: Metadata = { title: "Sample tracker" };

const PAGE_SIZE = 12;
const TONE_BAR: Record<string, string> = { good: "bg-good", brand: "bg-brand", warn: "bg-warn", serious: "bg-serious", critical: "bg-critical", neutral: "bg-ink-3" };

export default async function SampleTrackerPage({ searchParams }: PageProps<"/samples">) {
  const user = await requireUser();
  const sp = (await searchParams) as SP;
  const canEdit = can(user, "manager");
  const canPhone = mayEditContacts(user);
  const today = new Date().toISOString().slice(0, 10);
  const q = (one(sp.q) ?? "").trim();
  const mine = one(sp.mine) === "1";
  const due = one(sp.due) === "1";
  const noPhone = one(sp.nophone) === "1";
  const page = Math.max(1, Number(one(sp.page)) || 1);

  const pp = periodParams(sp);
  const { period, range } = await sampleRange(sp);

  const [{ rows: all, dataDate }, totals, team, t, unknown, matching] = await Promise.all([
    getSampleScorecard(range),
    getSampleTotals(range),
    db.select({ id: users.id, name: users.name }).from(users).where(sql`${users.active} and ${users.role} in ('admin','manager')`).orderBy(asc(users.name)),
    getThresholds(),
    getUnknownLines(range),
    getCreatorsMatching({ q, owner: mine ? user.id : null, due }, range),
  ]);

  const count = (v: SampleVerdict) => all.filter((r) => r.verdict === v).length;
  const missingPhone = all.filter((r) => !r.phone && r.verdict !== "ok").length;

  // Default view: the first queue that has work in it.
  const requested = one(sp.view);
  const first = QUEUES.find((v) => v !== "ok" && v !== "wait" && count(v) > 0) ?? "wait";
  const view: SampleVerdict | "all" | "unknown" =
    requested === "all" || requested === "unknown" ? requested : QUEUES.includes(requested as SampleVerdict) ? (requested as SampleVerdict) : first;

  const base = { ...pp, view: requested, q: q || undefined, mine: mine ? "1" : undefined, due: due ? "1" : undefined, nophone: noPhone ? "1" : undefined };
  const noSamples = totals.sent === 0;

  let list = all;
  if (view !== "all" && view !== "unknown") list = list.filter((r) => r.verdict === view);
  if (matching) list = list.filter((r) => matching.has(r.username));
  if (noPhone) list = list.filter((r) => !r.phone);
  list = [...list].sort((a, b) => b.notPosted - a.notPosted || b.review - a.review || b.contentGmv - a.contentGmv || b.samples - a.samples);
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const cur = Math.min(page, pages);
  const shown = list.slice((cur - 1) * PAGE_SIZE, cur * PAGE_SIZE);
  const lines = view === "unknown" ? new Map() : await getSampleLines(shown.map((r) => r.username), range);

  return (
    <div>
      <PageHeader
        title="Samples"
        description={`Every free sample, from shipped to content posted – built automatically from your files. ${
          range ? `Showing samples approved ${fmtDate(range.start)} – ${fmtDate(range.end)}.` : "Showing all samples."
        } Posting is judged ${t.samplePostDays} days after delivery.`}
        actions={canEdit ? <RefreshSamplesButton /> : undefined}
      />
      <FilesBar role={user.role} />
      <SamplesNav current="/samples" params={pp} />

      {noSamples ? (
        <Card>
          <EmptyState
            icon={<Gift className="size-5" />}
            title={range ? "No samples in this date range" : "No samples yet"}
            description={range ? `No sample was approved in ${period.label.toLowerCase()}. Choose a wider range at the top.` : "Upload the All orders export in the Data hub – free samples (RM 0 orders) are picked up automatically. Add Video analysis and Affiliate orders so the app can see who posted and what sold."}
          />
        </Card>
      ) : (
        <div className="space-y-5">
          <section aria-label="Summary" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <KpiCard label="Samples sent" value={fmtInt(totals.sent)} sub={`${fmtInt(all.length)} creators`} />
            <KpiCard label="Delivered" value={fmtInt(totals.delivered)} sub={`${fmtInt(totals.sent - totals.delivered)} on the way`} />
            <KpiCard label="Not posted" value={fmtInt(totals.chase)} invert sub="past the deadline" />
            <KpiCard label="Posted – no orders" value={fmtInt(totals.noSales)} sub="video up, no sales yet" hint="The creator posted but nothing has sold from it yet." />
            <KpiCard label="Posted & selling" value={fmtInt(totals.selling)} sub="samples with orders" />
            <KpiCard label="Sales from samples" value={fmtRM(totals.gmv)} sub="new content only" hint="Valid sales of the sampled product by content posted after the sample arrived. Old videos that keep selling are not counted." />
          </section>

          <section aria-label="What to do next">
            <h2 className="mb-2 text-[13px] font-semibold tracking-wide text-ink-3 uppercase">What to do next</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {QUEUES.filter((v) => v !== "ok").map((v) => {
                const m = VERDICTS[v];
                const n = count(v);
                const on = view === v;
                return (
                  <Link
                    key={v}
                    href={href("/samples", { ...base, view: v, page: undefined })}
                    aria-current={on ? "true" : undefined}
                    className={cn(
                      "relative overflow-hidden rounded-xl border bg-surface p-4 pl-5 shadow-card transition-colors hover:bg-surface-2",
                      on ? "border-brand ring-1 ring-brand" : "border-line",
                      n === 0 && "opacity-60",
                    )}
                  >
                    <span className={cn("absolute inset-y-0 left-0 w-1", TONE_BAR[m.tone])} aria-hidden />
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[14px] font-semibold text-ink">{m.label}</p>
                      <span className="tnum text-[22px] leading-none font-semibold text-ink">{n}</span>
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-[12.5px] text-ink-3">{m.todo}</p>
                  </Link>
                );
              })}
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
              <Link href={href("/samples", { ...base, view: "all", page: undefined })} className={cn("font-medium hover:underline", view === "all" ? "text-ink" : "text-brand")}>
                All affiliates ({fmtInt(all.length)})
              </Link>
              <Link href={href("/samples", { ...base, view: "ok", page: undefined })} className={cn("font-medium hover:underline", view === "ok" ? "text-ink" : "text-brand")}>
                No action needed ({fmtInt(count("ok"))})
              </Link>
              {unknown.length > 0 && (
                <Link href={href("/samples", { ...base, view: "unknown", page: undefined })} className={cn("font-medium hover:underline", view === "unknown" ? "text-ink" : "text-warn")}>
                  Receiver not matched ({fmtInt(unknown.length)})
                </Link>
              )}
              {missingPhone > 0 && canPhone && (
                <Link href={href("/samples", { ...base, view: "all", nophone: "1", page: undefined })} className="font-medium text-warn hover:underline">
                  {fmtInt(missingPhone)} creators need a WhatsApp number
                </Link>
              )}
            </div>
          </section>

          <form action="/samples" className="flex flex-wrap items-center gap-2.5 rounded-xl border border-line bg-surface p-3 shadow-card">
            {requested && <input type="hidden" name="view" value={requested} />}
            {pp.range && <input type="hidden" name="range" value={pp.range} />}
            {pp.from && <input type="hidden" name="from" value={pp.from} />}
            {pp.to && <input type="hidden" name="to" value={pp.to} />}
            <Input name="q" defaultValue={q} placeholder="Search creator, phone, SKU or product…" className="max-w-[300px]" aria-label="Search" />
            <label className="flex items-center gap-2 text-[13.5px] text-ink-2">
              <input type="checkbox" name="mine" value="1" defaultChecked={mine} className="size-4 accent-[var(--brand)]" /> My samples
            </label>
            <label className="flex items-center gap-2 text-[13.5px] text-ink-2">
              <input type="checkbox" name="due" value="1" defaultChecked={due} className="size-4 accent-[var(--brand)]" /> Follow-up due
            </label>
            <label className="flex items-center gap-2 text-[13.5px] text-ink-2">
              <input type="checkbox" name="nophone" value="1" defaultChecked={noPhone} className="size-4 accent-[var(--brand)]" /> No WhatsApp number
            </label>
            <Button type="submit">Filter</Button>
            <span className="ml-auto text-[12.5px] text-ink-3">Posting checked against data up to {dataDate ? fmtDate(dataDate) : "–"}</span>
          </form>

          {view === "unknown" ? (
            <div className="space-y-4">
              <p className="text-[13.5px] text-ink-2">
                TikTok hides the receiver&apos;s name on sample orders. These couldn&apos;t be matched to a creator automatically – type the TikTok username once and every sample from that receiver is filled in.
              </p>
              {unknown.map((u) => (
                <Card key={u.buyer}>
                  <div className="flex flex-wrap items-center gap-3 border-b border-line bg-surface-2/50 px-5 py-3.5">
                    <span className="font-mono text-[14px] font-medium text-ink">{u.buyer}</span>
                    <span className="text-[13px] text-ink-3">{u.lines.length} sample{u.lines.length === 1 ? "" : "s"}</span>
                    <div className="ml-auto">{canEdit && <BuyerMatchForm buyer={u.buyer} />}</div>
                  </div>
                  <ul>{u.lines.map((l) => <SampleLineCard key={l.id} l={l} team={team} canEdit={canEdit} today={today} />)}</ul>
                </Card>
              ))}
              {!unknown.length && <Card><EmptyState title="All receivers matched" description="Every sample is linked to a creator." /></Card>}
            </div>
          ) : shown.length === 0 ? (
            <Card><EmptyState icon={<HelpCircle className="size-5" />} title="Nothing here" description="No creators in this list. Pick another queue above or clear the filters." /></Card>
          ) : (
            <div className="space-y-4">
              {shown.map((r) => (
                <CreatorGroup key={r.username} r={r} lines={lines.get(r.username) ?? []} team={team} canEdit={canEdit} canPhone={canPhone} today={today} />
              ))}
              <Card>
                <Pagination page={cur} pages={pages} total={list.length} pageSize={PAGE_SIZE} hrefFor={(p) => href("/samples", { ...base, page: p })} />
              </Card>
            </div>
          )}

          <details className="rounded-xl border border-line bg-surface p-4 text-[13px] leading-relaxed text-ink-2 shadow-card">
            <summary className="cursor-pointer font-medium text-ink">How this works</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li><b>Shipped and delivered</b> come from the free-sample orders (RM 0) in your All orders export. Bundles are split into their items using your SKU lists.</li>
              <li><b>Posted</b> = the creator has a video with that product after delivery (Video analysis, or a new video already selling in your orders), LIVE sales after delivery, or TikTok&apos;s sample report shows content with samples. Videos with no sales still count, so <i>posted but no orders</i> is told apart from <i>not posted</i>.</li>
              <li>Until delivery + {t.samplePostDays} days a sample is <i>waiting</i>; after that with no content it is <i>not posted – chase</i>.</li>
              <li><b>Sales from samples</b> only counts content made after the sample arrived, so old videos that keep selling don&apos;t inflate it.</li>
              <li>The only manual step is the creator&apos;s WhatsApp number. Upload Video analysis weekly – a video posted after your last upload can&apos;t be seen yet. A LIVE that sold nothing is only visible through TikTok&apos;s sample report.</li>
            </ul>
          </details>
        </div>
      )}
    </div>
  );
}
