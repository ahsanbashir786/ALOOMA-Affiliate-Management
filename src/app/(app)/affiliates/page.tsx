import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getDirectory } from "@/lib/workflow/directory";
import { RELATIONSHIP, type Relationship } from "@/lib/workflow/relationship";
import { href, one, type SP } from "@/lib/url";
import { Button, buttonClasses, Card, EmptyState, Input, PageHeader, Select } from "@/components/ui/primitives";
import { Pagination } from "@/components/ui/pagination";
import { OpenPanelButton } from "@/components/creator/open-panel-button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Affiliates" };
const SIZE = 25;
const DOT: Record<string, string> = { good: "bg-good", brand: "bg-brand", warn: "bg-warn", critical: "bg-critical", neutral: "bg-line-strong" };
const STATUSES = Object.keys(RELATIONSHIP) as Relationship[];

export default async function AffiliatesPage({ searchParams }: PageProps<"/affiliates">) {
  await requireUser();
  const sp = (await searchParams) as SP;
  const q = (one(sp.q) ?? "").trim();
  const status = (STATUSES.includes(one(sp.status) as Relationship) ? one(sp.status) : "") as Relationship | "";
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const dir = await getDirectory({ q, status, page, size: SIZE });
  const pages = Math.max(1, Math.ceil(dir.total / SIZE));
  const filters = { q: q || undefined, status: status || undefined };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Affiliates"
        description="Every creator we have records for. Click a name for samples, promises, evidence and history."
        actions={<Link href="/affiliates/analysis" className={buttonClasses({ variant: "secondary" })}>Detailed analysis</Link>}
      />
      <Card>
        <form action="/affiliates" className="flex flex-wrap items-center gap-3 border-b border-line p-4">
          <div className="relative min-w-60 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
            <Input name="q" defaultValue={q} placeholder="Search by username" aria-label="Search creators" className="pl-9" />
          </div>
          <Select name="status" defaultValue={status} aria-label="Relationship">
            <option value="">All relationships ({dir.counts.all})</option>
            {STATUSES.map((s) => <option key={s} value={s}>{RELATIONSHIP[s].label} ({dir.counts[s]})</option>)}
          </Select>
          <Button type="submit">Search</Button>
        </form>

        {dir.rows.length === 0 ? (
          <EmptyState title="No creators found" description="Try a different search or relationship." />
        ) : (
          <>
            <div className="hidden grid-cols-[minmax(180px,1.4fr)_minmax(150px,1fr)_minmax(170px,1.2fr)_minmax(140px,1fr)_minmax(140px,1fr)] gap-4 border-b border-line px-5 py-2.5 text-[13px] font-medium text-ink-3 md:grid">
              <span>Creator</span><span>Relationship</span><span>Next action</span><span>Samples</span><span>Content</span>
            </div>
            <ul className="divide-y divide-line">
              {dir.rows.map((r) => (
                <li key={r.username} className="grid gap-x-4 gap-y-1.5 px-5 py-4 md:grid-cols-[minmax(180px,1.4fr)_minmax(150px,1fr)_minmax(170px,1.2fr)_minmax(140px,1fr)_minmax(140px,1fr)] md:items-center" data-testid={`dir-${r.username}`}>
                  <OpenPanelButton username={r.username} className="truncate text-left text-[16px] font-semibold text-ink hover:underline" />
                  <span className="flex items-center gap-2 text-[14.5px] text-ink-2" title={RELATIONSHIP[r.status].hint}><span className={cn("size-2.5 rounded-full", DOT[RELATIONSHIP[r.status].tone])} />{RELATIONSHIP[r.status].label}</span>
                  <span className={cn("text-[14.5px]", r.overdue ? "font-semibold text-critical" : r.nextLabel ? "text-ink" : "text-ink-3")}>{r.nextLabel ?? "Nothing scheduled"}</span>
                  <span className="text-[14.5px] text-ink-2">
                    {r.samples.sent === 0 ? <span className="text-ink-3">No samples</span> : (
                      <span className="flex items-center gap-2"><span className="tnum font-medium text-ink">{r.samples.posted}/{r.samples.sent}</span> posted
                        <span className="h-1.5 w-12 overflow-hidden rounded-full bg-surface-2" aria-hidden><span className="block h-full rounded-full bg-good" style={{ width: `${(r.samples.posted / r.samples.sent) * 100}%` }} /></span></span>
                    )}
                  </span>
                  <span className="text-[14.5px] text-ink-2">
                    {r.content.needed > 0 ? <span><span className="tnum font-medium text-ink">{r.content.done}/{r.content.needed}</span> promised</span> : r.content.pieces > 0 ? <span><span className="tnum font-medium text-ink">{r.content.pieces}</span> piece{r.content.pieces === 1 ? "" : "s"} seen</span> : <span className="text-ink-3">None seen</span>}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="border-t border-line p-3"><Pagination page={Math.min(page, pages)} pages={pages} total={dir.total} pageSize={SIZE} hrefFor={(p) => href("/affiliates", { ...filters, page: p })} /></div>
      </Card>
    </div>
  );
}
