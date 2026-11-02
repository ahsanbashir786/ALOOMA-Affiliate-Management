import type { Metadata } from "next";
import Link from "next/link";
import { asc, sql } from "drizzle-orm";
import { Gift } from "lucide-react";
import { db } from "@/db";
import { skuItems, users } from "@/db/schema";
import { can, requireUser } from "@/lib/auth";
import { getThresholds } from "@/lib/analytics/settings";
import { getSampleTracker, STAGES, type StageKey } from "@/lib/samples/analysis";
import { sampleDataDate } from "@/lib/samples/service";
import { href, one, type SP } from "@/lib/url";
import { Button, Card, EmptyState, Input, PageHeader, Th } from "@/components/ui/primitives";
import { Pagination } from "@/components/ui/pagination";
import { SamplesNav } from "@/components/samples/samples-nav";
import { SampleRow } from "@/components/samples/sample-row";
import { AddSampleForm } from "@/components/samples/add-sample-form";
import { RefreshSamplesButton } from "@/components/samples/refresh-button";
import { cn, fmtDate, fmtInt } from "@/lib/utils";

export const metadata: Metadata = { title: "Sample tracker" };

const PAGE_SIZE = 40;

export default async function SampleTrackerPage({ searchParams }: PageProps<"/samples">) {
  const user = await requireUser();
  const sp = (await searchParams) as SP;
  const stage = (STAGES.some((s) => s.key === one(sp.stage)) ? one(sp.stage) : "open") as StageKey;
  const q = (one(sp.q) ?? "").trim();
  const mine = one(sp.mine) === "1";
  const due = one(sp.due) === "1";
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const canEdit = can(user, "manager");
  const today = new Date().toISOString().slice(0, 10);

  const [data, team, t, dataDate, skus] = await Promise.all([
    getSampleTracker({ stage, q, owner: mine ? user.id : null, due, page, pageSize: PAGE_SIZE }),
    db.select({ id: users.id, name: users.name }).from(users).where(sql`${users.active} and ${users.role} in ('admin','manager')`).orderBy(asc(users.name)),
    getThresholds(),
    sampleDataDate(),
    db.select({ sku: skuItems.sku, name: skuItems.name }).from(skuItems).orderBy(asc(skuItems.sku)),
  ]);
  const pages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  const base = { stage: stage === "open" ? undefined : stage, q: q || undefined, mine: mine ? "1" : undefined, due: due ? "1" : undefined };
  const anything = Object.values(data.counts).some((n) => n > 0);

  return (
    <div>
      <PageHeader
        title="Samples"
        description={`Every free sample from request to content: shipped, delivered, and whether the creator posted within ${t.samplePostDays} days of delivery.`}
        actions={canEdit ? <RefreshSamplesButton /> : undefined}
      />
      <SamplesNav current="/samples" />

      {!anything ? (
        <Card>
          <EmptyState
            icon={<Gift className="size-5" />}
            title="No samples yet"
            description="Upload the All orders export in the Data hub – free samples (RM 0 orders) are picked up automatically. You can also import your staff sheet for history, or log a request below."
            action={canEdit ? <AddSampleForm today={today} skus={skus} /> : undefined}
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {canEdit && <AddSampleForm today={today} skus={skus} />}
          <Card>
            <div className="flex flex-wrap items-center gap-1 border-b border-line px-3 pt-2">
              {STAGES.map((s) => (
                <Link
                  key={s.key}
                  href={href("/samples", { ...base, stage: s.key === "open" ? undefined : s.key, page: undefined })}
                  aria-current={stage === s.key ? "page" : undefined}
                  className={cn(
                    "-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-[13.5px] font-medium",
                    stage === s.key ? "border-brand text-ink" : "border-transparent text-ink-3 hover:text-ink",
                  )}
                >
                  {s.label}
                  <span className={cn("tnum rounded-full px-1.5 text-[12px]", s.key === "not_posted" && data.counts[s.key] > 0 ? "bg-critical-soft text-critical" : "bg-surface-2 text-ink-2")}>
                    {fmtInt(data.counts[s.key])}
                  </span>
                </Link>
              ))}
            </div>
            <form action="/samples" className="flex flex-wrap items-center gap-2.5 border-b border-line p-4">
              {stage !== "open" && <input type="hidden" name="stage" value={stage} />}
              <Input name="q" defaultValue={q} placeholder="Search creator, phone, SKU or product…" className="max-w-[300px]" aria-label="Search" />
              <label className="flex items-center gap-2 text-[13.5px] text-ink-2">
                <input type="checkbox" name="mine" value="1" defaultChecked={mine} className="size-4 accent-[var(--brand)]" /> My samples
              </label>
              <label className="flex items-center gap-2 text-[13.5px] text-ink-2">
                <input type="checkbox" name="due" value="1" defaultChecked={due} className="size-4 accent-[var(--brand)]" /> Follow-up due
              </label>
              <Button type="submit">Filter</Button>
              <span className="ml-auto text-[12.5px] text-ink-3">
                {fmtInt(data.total)} sample{data.total === 1 ? "" : "s"}{dataDate ? ` · posting checked against data up to ${fmtDate(dataDate)}` : ""}
              </span>
            </form>
            {data.rows.length === 0 ? (
              <EmptyState title="Nothing here" description="No samples match these filters." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1320px] border-collapse">
                  <thead>
                    <tr>
                      <Th className="w-8"><span className="sr-only">Expand</span></Th>
                      <Th>Creator</Th>
                      <Th>Product</Th>
                      <Th align="right">Qty</Th>
                      <Th>Requested</Th>
                      <Th>Approved</Th>
                      <Th>Shipped</Th>
                      <Th>Delivered</Th>
                      <Th title={`Delivered + ${t.samplePostDays} days`}>Post by</Th>
                      <Th>Posted</Th>
                      <Th>Result</Th>
                      <Th>In charge</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((s) => (
                      <SampleRow key={s.id} s={s} team={team} canEdit={canEdit} today={today} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <Pagination page={Math.min(page, pages)} pages={pages} total={data.total} pageSize={PAGE_SIZE} hrefFor={(p) => href("/samples", { ...base, page: p })} />
          </Card>
          <p className="text-[12.5px] leading-relaxed text-ink-3">
            How the check works: a sample counts as <b>posted</b> when the creator has a video with that product (Video analysis) posted after delivery,
            LIVE sales after delivery, or TikTok&apos;s sample analysis reports content with samples. Without any of these it is “waiting” until{" "}
            {t.samplePostDays} days after delivery, then “not posted”. TikTok hides the receiver&apos;s name on sample orders, so the creator is matched from
            the visible letters – set it by hand under a row if it&apos;s wrong or unknown.
          </p>
        </div>
      )}
    </div>
  );
}
