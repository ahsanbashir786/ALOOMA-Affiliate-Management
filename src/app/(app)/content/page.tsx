import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { periodQuery, resolvePeriod } from "@/lib/period";
import { getVideoAgeMix } from "@/lib/analytics/overview";
import { getPostingInsights, getTopVideos, type VideoRow } from "@/lib/analytics/content";
import { Card, CardHeader, EmptyState, PageHeader, Td, Th } from "@/components/ui/primitives";
import { BarList } from "@/components/charts/bar-list";
import { fmtCompact, fmtDate, fmtInt, fmtPct, fmtRM } from "@/lib/utils";

export const metadata: Metadata = { title: "Content" };

function VideoTable({ list, qs }: { list: VideoRow[]; qs: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] border-collapse">
        <thead>
          <tr>
            <Th>Video</Th>
            <Th>Creator</Th>
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
          {list.map((v) => (
            <tr key={v.videoId} className="hover:bg-surface-2/60">
              <Td className="max-w-[300px]">
                {v.link ? (
                  <a href={v.link} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1.5 text-ink hover:text-brand hover:underline">
                    <span className="truncate">{v.title || `Video …${v.videoId.slice(-6)}`}</span>
                    <ExternalLink className="size-3.5 shrink-0 text-ink-3" />
                  </a>
                ) : (
                  <span className="truncate">{v.title || `Video …${v.videoId.slice(-6)}`}</span>
                )}
              </Td>
              <Td>
                <Link href={`/creators/${encodeURIComponent(v.creator)}?${qs}`} className="text-ink hover:text-brand hover:underline">{v.creator}</Link>
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
          {!list.length && <tr><Td colSpan={9} className="py-10 text-center text-ink-3">No videos in this period.</Td></tr>}
        </tbody>
      </table>
    </div>
  );
}

export default async function ContentPage({ searchParams }: PageProps<"/content">) {
  const period = await resolvePeriod(await searchParams);
  const qs = periodQuery(period);
  const [age, top, evergreen, posting] = await Promise.all([
    getVideoAgeMix(period),
    getTopVideos(period, { limit: 25 }),
    getTopVideos(period, { limit: 10, minAgeDays: 180 }),
    getPostingInsights(period),
  ]);

  if (age.total === 0 && top.length === 0) {
    return (
      <>
        <PageHeader title="Content" description="What kind of content sells, and how long it keeps selling." />
        <Card><EmptyState title="No video sales in this period" description="Upload affiliate orders and the video analysis export, or choose a wider date range." /></Card>
      </>
    );
  }

  const ageItems = age.buckets.map((b) => ({
    label: b.label,
    value: b.gmv,
    display: fmtRM(b.gmv),
    sub: `${fmtPct(age.total ? b.gmv / age.total : 0, 0)} · ${b.videos} videos`,
    highlight: b.key === "d180p" || b.key === "d180",
  }));
  const best = (arr: { label: string; avgGmv: number; videos: number }[]) => Math.max(...arr.map((a) => a.avgGmv));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Content"
        description="What kind of content sells, and how long it keeps selling. Video sales are matched to the video that drove them."
      />

      <section className="grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader
            title="How old are the videos that sell?"
            description="Video GMV by the video's age on the day of the sale."
          />
          <div className="px-5 pb-5">
            <BarList items={ageItems} />
            <p className="mt-5 rounded-lg bg-surface-2 px-4 py-3 text-[13.5px] leading-relaxed text-ink-2">
              <span className="font-semibold text-ink">{fmtPct(age.olderThan90, 0)}</span> of video sales come from videos older than 90 days.
              {age.olderThan90 >= 0.5
                ? " Revenue is carried by a small set of evergreen winners. They won't last forever, so a steady flow of fresh videos – especially sequels to the winners below – protects sales."
                : " Sales are spread across fresh and older content, which is a healthy mix."}
            </p>
          </div>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader
            title="When to post"
            description={
              posting
                ? `Average GMV per video, for ${fmtInt(posting.sample)} videos posted in the 120 days before ${posting.snapshotLabel?.split(" – ")[1]}.`
                : "Needs a video analysis export covering this period."
            }
          />
          <div className="space-y-5 px-5 pb-5">
            {posting && posting.sample >= 30 ? (
              <>
                <div>
                  <p className="mb-2 text-[12.5px] font-medium text-ink-3">By time of day</p>
                  <BarList
                    items={posting.dayparts.map((d) => ({ label: d.label, value: d.avgGmv, display: fmtRM(d.avgGmv), sub: `${d.videos} videos`, highlight: d.avgGmv === best(posting.dayparts) }))}
                  />
                </div>
                <div>
                  <p className="mb-2 text-[12.5px] font-medium text-ink-3">By weekday</p>
                  <BarList
                    items={posting.weekdays.map((d) => ({ label: d.label, value: d.avgGmv, display: fmtRM(d.avgGmv), sub: `${d.videos}`, highlight: d.avgGmv === best(posting.weekdays) }))}
                  />
                </div>
                <p className="text-[12px] text-ink-3">Treat as a hint, not a rule: small samples and a few big hits can skew an average.</p>
              </>
            ) : (
              <p className="py-6 text-center text-[13px] text-ink-3">Not enough recently posted videos to compare posting times.</p>
            )}
          </div>
        </Card>
      </section>

      <Card>
        <CardHeader
          title="Evergreen winners"
          description="Videos posted more than 180 days ago that are still selling – the formats and hooks worth repeating. Ask these creators for a “part 2”."
        />
        <VideoTable list={evergreen} qs={qs} />
      </Card>

      {posting && posting.keywords.length > 0 && (
        <Card>
          <CardHeader title="Hashtags that convert" description="Average GMV per video for hashtags used on at least 8 recent videos." />
          <div className="px-5 pb-5">
            <BarList
              items={posting.keywords.map((k, i) => ({ label: k.word, value: k.avgGmv, display: fmtRM(k.avgGmv), sub: `${k.videos} videos`, highlight: i === 0 }))}
            />
          </div>
        </Card>
      )}

      <Card>
        <CardHeader title="Top videos" description={`Best-selling videos, ${period.label.toLowerCase()}.`} />
        <VideoTable list={top} qs={qs} />
      </Card>
    </div>
  );
}
