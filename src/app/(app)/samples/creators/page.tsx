import type { Metadata } from "next";
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getThresholds } from "@/lib/analytics/settings";
import { CONTENT_TYPE_LABEL, getSampleScorecard, type ScoreRow } from "@/lib/samples/analysis";
import { QUEUES, VERDICTS, type SampleVerdict } from "@/lib/samples/states";
import { href, one, type SP } from "@/lib/url";
import { Badge, Button, Card, EmptyState, Input, PageHeader, Select, SortTh, Td, Th } from "@/components/ui/primitives";
import { KpiCard } from "@/components/ui/kpi-card";
import { Pagination } from "@/components/ui/pagination";
import { SamplesNav } from "@/components/samples/samples-nav";
import { waLink } from "@/lib/samples/states";
import { cn, fmtDate, fmtInt, fmtPct, fmtRM } from "@/lib/utils";

export const metadata: Metadata = { title: "Sample scorecard" };

const PAGE_SIZE = 40;
type SortKey = "samples" | "rate" | "days" | "gmv" | "notposted" | "name";
const ORDER: SampleVerdict[] = QUEUES;

export default async function SampleScorecardPage({ searchParams }: PageProps<"/samples/creators">) {
  await requireUser();
  const sp = (await searchParams) as SP;
  const [{ rows: all, dataDate }, t] = await Promise.all([getSampleScorecard(), getThresholds()]);
  const verdict = one(sp.verdict) as SampleVerdict | undefined;
  const type = one(sp.type);
  const q = (one(sp.q) ?? "").trim().toLowerCase();
  const sort = (one(sp.sort) as SortKey) || "notposted";
  const dir = one(sp.dir) === "asc" ? "asc" : "desc";
  const page = Math.max(1, Number(one(sp.page)) || 1);

  let list = all;
  if (verdict && VERDICTS[verdict]) list = list.filter((r) => r.verdict === verdict);
  if (type) list = list.filter((r) => (type === "none" ? !r.type : r.type === type));
  if (q) list = list.filter((r) => r.username.includes(q) || (r.phone ?? "").includes(q));
  const val = (r: ScoreRow): number | string => {
    switch (sort) {
      case "samples": return r.samples;
      case "rate": return r.postingRate ?? -1;
      case "days": return r.avgDaysToPost ?? Infinity;
      case "gmv": return r.contentGmv;
      case "name": return r.username;
      default: return r.notPosted * 1e6 + r.samples;
    }
  };
  list = [...list].sort((a, b) => {
    const x = val(a), y = val(b);
    const c = typeof x === "string" ? x.localeCompare(y as string) : (x as number) - (y as number);
    return dir === "asc" ? c : -c;
  });

  const judged = all.reduce((a, r) => a + r.judged, 0);
  const posted = all.reduce((a, r) => a + r.posted, 0);
  const dayRows = all.filter((r) => r.avgDaysToPost != null);
  const avgDays = dayRows.length ? dayRows.reduce((a, r) => a + r.avgDaysToPost! * r.posted, 0) / Math.max(1, dayRows.reduce((a, r) => a + r.posted, 0)) : null;
  const gmv = all.reduce((a, r) => a + r.contentGmv, 0);
  const count = (v: SampleVerdict) => all.filter((r) => r.verdict === v).length;

  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const cur = Math.min(page, pages);
  const rows = list.slice((cur - 1) * PAGE_SIZE, cur * PAGE_SIZE);
  const base = { verdict, type, q: one(sp.q), sort: sort !== "notposted" ? sort : undefined, dir: dir !== "desc" ? dir : undefined };
  const sortHref = (k: SortKey) => href("/samples/creators", { ...base, sort: k, dir: sort === k && dir === "desc" ? "asc" : "desc", page: undefined });
  const sortProps = (k: SortKey) => ({ href: sortHref(k), active: sort === k, dir } as const);

  return (
    <div>
      <PageHeader
        title="Samples"
        description={`Compare creators side by side. Posting is judged ${t.samplePostDays} days after delivery; “Send more samples” needs at least ${fmtRM(t.sampleMoreMinGmv)} in sales from the sampled products.`}
      />
      <SamplesNav current="/samples/creators" />

      {!all.length ? (
        <Card><EmptyState title="No sampled creators yet" description="Upload the All orders export – free-sample orders are matched to creators automatically." /></Card>
      ) : (
        <div className="space-y-5">
          <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <KpiCard label="Creators with samples" value={fmtInt(all.length)} sub={`${fmtInt(all.reduce((a, r) => a + r.qty, 0))} items sent`} />
            <KpiCard label="Posting rate" value={judged ? fmtPct(posted / judged, 0) : "–"} sub={`${fmtInt(posted)} of ${fmtInt(judged)} past the deadline`} hint="Samples with a video or LIVE, out of samples whose posting deadline has passed." />
            <KpiCard label="Days to post" value={avgDays == null ? "–" : avgDays.toFixed(1)} sub="average, delivery → content" />
            <KpiCard label="Sales after samples" value={fmtRM(gmv)} sub="sampled products, after delivery" hint="Valid affiliate sales by these creators of the product they were sampled, from the delivery date on." />
            <KpiCard label="To chase" value={fmtInt(count("chase"))} invert sub="creators" />
            <KpiCard label="Ask for more content" value={fmtInt(count("more_content"))} sub="selling, post little" />
          </section>

          <Card>
            <div className="flex flex-wrap items-center gap-1 border-b border-line px-3 pt-2">
              {[undefined, ...ORDER].map((v) => (
                <Link
                  key={v ?? "all"}
                  href={href("/samples/creators", { ...base, verdict: v, page: undefined })}
                  aria-current={verdict === v ? "page" : undefined}
                  className={cn("-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-[13.5px] font-medium", verdict === v ? "border-brand text-ink" : "border-transparent text-ink-3 hover:text-ink")}
                >
                  {v ? VERDICTS[v].label : "All"}
                  <span className="tnum rounded-full bg-surface-2 px-1.5 text-[12px] text-ink-2">{v ? count(v) : all.length}</span>
                </Link>
              ))}
            </div>
            <form action="/samples/creators" className="flex flex-wrap items-center gap-2.5 border-b border-line p-4">
              {verdict && <input type="hidden" name="verdict" value={verdict} />}
              <Input name="q" defaultValue={one(sp.q)} placeholder="Search creator or phone…" className="max-w-[260px]" aria-label="Search" />
              <Select name="type" defaultValue={type ?? ""} aria-label="Content type">
                <option value="">Video & LIVE</option>
                <option value="video">Video only</option>
                <option value="live">LIVE only</option>
                <option value="both">Video + LIVE</option>
                <option value="none">Not known yet</option>
              </Select>
              <Button type="submit">Filter</Button>
              <span className="ml-auto text-[12.5px] text-ink-3">Data up to {fmtDate(dataDate)}</span>
            </form>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1280px] border-collapse">
                <thead>
                  <tr>
                    <SortTh {...sortProps("name")}>Creator</SortTh>
                    <Th>Type</Th>
                    <Th align="right">Videos / LIVEs</Th>
                    <SortTh {...sortProps("samples")} align="right">Samples</SortTh>
                    <Th align="right">Posted</Th>
                    <SortTh {...sortProps("rate")} align="right">Posting rate</SortTh>
                    <SortTh {...sortProps("days")} align="right">Days to post</SortTh>
                    <SortTh {...sortProps("gmv")} align="right">Sales after</SortTh>
                    <SortTh {...sortProps("notposted")} align="right">Not posted</SortTh>
                    <Th>Products</Th>
                    <Th>Next step</Th>
                    <Th align="right">Est. value</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.username} className="hover:bg-surface-2/60">
                      <Td>
                        <div className="flex items-center gap-1.5">
                          <Link href={`/creators/${encodeURIComponent(r.username)}`} className="font-medium text-ink hover:text-brand hover:underline">{r.username}</Link>
                          {r.phone && (
                            <a href={waLink(r.phone)} target="_blank" rel="noopener noreferrer" title={`WhatsApp ${r.phone}`} className="text-good hover:opacity-80">
                              <MessageCircle className="size-4" />
                            </a>
                          )}
                          {r.doNotContact && <Badge tone="critical">Do not contact</Badge>}
                        </div>
                      </Td>
                      <Td>{r.type ? <Badge tone={r.type === "live" ? "brand" : r.type === "both" ? "good" : "neutral"}>{CONTENT_TYPE_LABEL[r.type]}</Badge> : <span className="text-ink-3">–</span>}</Td>
                      <Td align="right" className="text-ink-2">{fmtInt(r.videos)} / {fmtInt(r.lives)}</Td>
                      <Td align="right">{fmtInt(r.samples)}{r.qty !== r.samples ? <span className="text-ink-3"> ({r.qty} items)</span> : null}</Td>
                      <Td align="right">{fmtInt(r.posted)} / {fmtInt(r.judged)}</Td>
                      <Td align="right" className={cn(r.postingRate != null && r.postingRate < 0.5 && "font-medium text-serious")}>{r.postingRate == null ? "–" : fmtPct(r.postingRate, 0)}</Td>
                      <Td align="right">{r.avgDaysToPost == null ? "–" : `${r.avgDaysToPost.toFixed(1)}d`}</Td>
                      <Td align="right" className="font-medium">{r.contentGmv ? fmtRM(r.contentGmv) : "–"}</Td>
                      <Td align="right" className={cn(r.notPosted > 0 && "font-medium text-critical")}>{fmtInt(r.notPosted)}</Td>
                      <Td className="max-w-[240px]"><span className="line-clamp-2 text-[12.5px] text-ink-2" title={r.products}>{r.products}</span></Td>
                      <Td><Badge tone={VERDICTS[r.verdict].tone}>{VERDICTS[r.verdict].label}</Badge></Td>
                      <Td align="right" className="text-good">{r.value > 0 ? fmtRM(r.value) : "–"}</Td>
                    </tr>
                  ))}
                  {!rows.length && <tr><Td colSpan={12} className="py-10 text-center text-ink-3">No creators match.</Td></tr>}
                </tbody>
              </table>
            </div>
            <Pagination page={cur} pages={pages} total={list.length} pageSize={PAGE_SIZE} hrefFor={(p) => href("/samples/creators", { ...base, page: p })} />
          </Card>
          <p className="text-[12.5px] leading-relaxed text-ink-3">Type comes from what the creator actually did (video vs LIVE sales and posts in TikTok&apos;s reports), or from your notes when there&apos;s no data yet. “Est. value” is a cautious estimate of sales gained by acting (for old content: monthly sales that depend on the old videos). Work through these on the Tracker – each verdict also appears in the Action centre with a WhatsApp message.</p>
        </div>
      )}
    </div>
  );
}
