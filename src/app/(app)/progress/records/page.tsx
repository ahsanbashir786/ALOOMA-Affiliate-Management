import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getRecords, METRICS, type Metric } from "@/lib/workflow/records";
import { PROGRESS_RANGES } from "@/lib/workflow/progress";
import { fmtDayLabel } from "@/lib/time";
import { one, type SP } from "@/lib/url";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Progress records" };

const TONE: Record<string, string> = { good: "bg-good", warn: "bg-warn", critical: "bg-critical", neutral: "bg-line-strong" };

export default async function RecordsPage({ searchParams }: PageProps<"/progress/records">) {
  await requireUser("admin");
  const sp = (await searchParams) as SP;
  const m = (METRICS as readonly string[]).includes(one(sp.m) ?? "") ? (one(sp.m) as Metric) : "fu_due";
  const days = [...PROGRESS_RANGES, 365].find((d) => String(d) === one(sp.days)) ?? 28;
  const set = await getRecords(m, days);
  return (
    <div className="space-y-4">
      <Link href={`/progress?days=${Math.min(days, 90)}`} className="inline-flex items-center gap-1.5 text-[13px] text-ink-3 hover:text-ink"><ArrowLeft className="size-4" /> Back to Progress</Link>
      <PageHeader title={set.title} description={`${set.rows.length} record${set.rows.length === 1 ? "" : "s"} · last ${days} days`} />
      <p className="max-w-3xl text-[13px] text-ink-3">{set.definition}</p>
      <Card>
        {set.rows.length === 0 ? (
          <EmptyState title="Nothing here" description="No records match this figure in the period." />
        ) : (
          <ul className="divide-y divide-line">
            {set.rows.map((r, i) => (
              <li key={i} className="flex items-center gap-3 px-5 py-2.5">
                <span className={cn("size-2.5 shrink-0 rounded-full", TONE[r.tone ?? "neutral"])} aria-hidden />
                <Link href={`/creators/${encodeURIComponent(r.username)}`} className="w-48 shrink-0 truncate text-[14px] font-medium hover:underline">@{r.username}</Link>
                <span className="min-w-0 flex-1 truncate text-[13px] text-ink-2" title={r.detail}>{r.detail}</span>
                {r.date && <span className="tnum shrink-0 text-[12.5px] text-ink-3">{fmtDayLabel(r.date)}</span>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
