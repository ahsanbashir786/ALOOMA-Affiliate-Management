import type { Metadata } from "next";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { periodQuery, resolvePeriod } from "@/lib/period";
import { allRecommendations, analyse } from "@/lib/analytics/recommendations";
import { SEGMENTS, SEGMENT_ORDER, type SegmentKey } from "@/lib/segments";
import { href, one, periodParams, type SP } from "@/lib/url";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { SegmentBadge } from "@/components/creators/segment-badge";
import { CopyButton } from "@/components/ui/copy-button";
import { ScatterPlot } from "@/components/charts/scatter-plot";
import { cn, fmtCompact, fmtInt, fmtRM, initials } from "@/lib/utils";

export const metadata: Metadata = { title: "Opportunities" };

const TONE_BAR: Record<string, string> = {
  good: "bg-good", brand: "bg-brand", neutral: "bg-ink-3", warn: "bg-warn", serious: "bg-serious", critical: "bg-critical",
};

export default async function OpportunitiesPage({ searchParams }: PageProps<"/opportunities">) {
  const sp = (await searchParams) as SP;
  const period = await resolvePeriod(sp);
  const analysis = await analyse(period);
  const recs = allRecommendations(analysis);
  const qs = periodQuery(period);
  const pp = periodParams(sp);

  const bySeg = new Map<SegmentKey, typeof recs>();
  for (const r of recs) bySeg.set(r.type, [...(bySeg.get(r.type) ?? []), r]);
  const gmvBySeg = new Map<SegmentKey, number>();
  for (const c of analysis.classified) if (c.segment) gmvBySeg.set(c.segment, (gmvBySeg.get(c.segment) ?? 0) + c.gmv);

  const keys = SEGMENT_ORDER.filter((k) => k !== "steady" && bySeg.has(k));
  const selected = (one(sp.segment) as SegmentKey) && bySeg.has(one(sp.segment) as SegmentKey) ? (one(sp.segment) as SegmentKey) : keys[0];
  const list = selected ? (bySeg.get(selected) ?? []) : [];
  const cls = new Map(analysis.classified.map((c) => [c.username, c]));
  const totalUplift = recs.filter((r) => r.type === "underposting").reduce((a, r) => a + r.expectedUplift, 0);

  const points = analysis.classified
    .filter((c) => c.gmv > 0 && c.vpw != null)
    .map((c) => ({ name: c.username, x: c.vpw!, y: c.gmv, segment: c.segment }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Opportunities"
        description={`Who to talk to, and what to ask them – based on ${period.label.toLowerCase()} compared with the period before.`}
      />

      {!keys.length ? (
        <Card><EmptyState title="No opportunities found" description="Upload transaction and order data covering this period to generate recommendations." /></Card>
      ) : (
        <>
          <section aria-label="Segments" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {keys.map((k) => {
              const s = SEGMENTS[k];
              const on = k === selected;
              const items = bySeg.get(k)!;
              const uplift = items.reduce((a, r) => a + r.expectedUplift, 0);
              return (
                <Link
                  key={k}
                  href={href("/opportunities", { ...pp, segment: k })}
                  aria-current={on ? "true" : undefined}
                  className={cn(
                    "relative overflow-hidden rounded-xl border bg-surface p-4 pl-5 shadow-card transition-colors hover:bg-surface-2",
                    on ? "border-brand ring-1 ring-brand" : "border-line",
                  )}
                >
                  <span className={cn("absolute inset-y-0 left-0 w-1", TONE_BAR[s.tone])} aria-hidden />
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[14px] font-semibold text-ink">{s.label}</p>
                    <span className="tnum text-[22px] leading-none font-semibold text-ink">{items.length}</span>
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-[12.5px] text-ink-3">{s.summary}</p>
                  <p className="tnum mt-2.5 text-[12.5px] text-ink-2">
                    {gmvBySeg.get(k) ? `${fmtRM(gmvBySeg.get(k)!)} GMV` : "–"}
                    {uplift > 0 && <span className="text-good"> · +{fmtRM(uplift)} est.</span>}
                  </p>
                </Link>
              );
            })}
          </section>

          {selected && (
            <Card>
              <div className="border-b border-line px-5 py-4">
                <div className="flex flex-wrap items-center gap-3">
                  <SegmentBadge segment={selected} />
                  <p className="text-[13.5px] text-ink-2">{SEGMENTS[selected].playbook}</p>
                </div>
              </div>
              <ul>
                {list.slice(0, 40).map((r) => {
                  const c = cls.get(r.username);
                  return (
                    <li key={r.username + r.type} className="border-b border-line last:border-b-0">
                      <details className="group">
                        <summary className="flex cursor-pointer list-none items-center gap-4 px-5 py-3.5 hover:bg-surface-2/60 [&::-webkit-details-marker]:hidden">
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[12px] font-semibold text-ink-2">
                            {initials(r.username)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[14.5px] font-medium text-ink">{r.username}</p>
                            <p className="mt-0.5 line-clamp-2 text-[13px] text-ink-2">{r.reason}</p>
                          </div>
                          <div className="hidden text-right sm:block">
                            <p className="tnum text-[14px] font-medium text-ink">{c ? fmtRM(c.gmv) : "–"}</p>
                            <p className="tnum text-[12px] text-ink-3">
                              {c?.vpw != null ? `${c.vpw.toFixed(1)} videos/wk` : c?.followers ? `${fmtCompact(c.followers)} followers` : ""}
                            </p>
                          </div>
                          <div className="hidden w-24 text-right md:block">
                            {r.expectedUplift > 0 ? (
                              <>
                                <p className="tnum text-[14px] font-semibold text-good">+{fmtRM(r.expectedUplift)}</p>
                                <p className="text-[11.5px] text-ink-3">est. uplift</p>
                              </>
                            ) : null}
                          </div>
                          <ChevronDown className="size-4 shrink-0 text-ink-3 transition-transform group-open:rotate-180" />
                        </summary>
                        <div className="border-t border-line bg-surface-2/50 px-5 py-4">
                          <p className="mb-2 text-[12px] font-medium tracking-wide text-ink-3 uppercase">Message to send</p>
                          <pre className="max-w-3xl font-sans text-[14px] leading-relaxed whitespace-pre-wrap text-ink">{r.instruction}</pre>
                          <div className="mt-3 flex items-center gap-3">
                            <CopyButton text={r.instruction} />
                            <Link
                              href={`/creators/${encodeURIComponent(r.username)}?${qs}`}
                              className="text-[13.5px] font-medium text-brand hover:underline"
                            >
                              Open profile
                            </Link>
                          </div>
                        </div>
                      </details>
                    </li>
                  );
                })}
              </ul>
              {list.length > 40 && (
                <p className="border-t border-line px-5 py-3 text-[13px] text-ink-3">
                  Showing the top 40 of {fmtInt(list.length)}. Use the Action centre to work through all of them.
                </p>
              )}
            </Card>
          )}

          {points.length > 0 && (
            <Card>
              <div className="px-5 pt-4 pb-1">
                <h3 className="text-[15px] font-semibold text-ink">Posting rhythm vs. sales</h3>
                <p className="mt-0.5 max-w-3xl text-[13px] text-ink-3">
                  Each dot is a creator. Many top sellers post little yet keep selling because their older videos still earn – the
                  question is how long that lasts. Hover a dot for details.
                </p>
              </div>
              <div className="px-3 pb-4">
                <ScatterPlot points={points} />
              </div>
            </Card>
          )}
          {totalUplift > 0 && (
            <p className="text-[12.5px] text-ink-3">
              Uplift estimates are conservative: extra videos per week × the creator&apos;s average GMV per selling video × {Math.round(analysis.thresholds.upliftHaircut * 100)}%. Adjust the assumptions in Settings.
            </p>
          )}
        </>
      )}
    </div>
  );
}
