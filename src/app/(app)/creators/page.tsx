import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { periodQuery, resolvePeriod } from "@/lib/period";
import { analyse } from "@/lib/analytics/recommendations";
import { FLAGS, SEGMENTS, SEGMENT_ORDER, type SegmentKey } from "@/lib/segments";
import { href, one, periodParams, type SP } from "@/lib/url";
import { Badge, Button, Card, EmptyState, Input, PageHeader, Select, SortTh, Td, Th } from "@/components/ui/primitives";
import { Delta } from "@/components/ui/delta";
import { Pagination } from "@/components/ui/pagination";
import { SegmentBadge } from "@/components/creators/segment-badge";
import { cn, fmtCompact, fmtInt, fmtPct, fmtRM, initials, pctChange } from "@/lib/utils";

export const metadata: Metadata = { title: "Creators" };

const PAGE_SIZE = 25;
type SortKey = "gmv" | "orders" | "change" | "vpw" | "followers" | "cancel" | "uplift" | "name";

export default async function CreatorsPage({ searchParams }: PageProps<"/creators">) {
  const sp = (await searchParams) as SP;
  const period = await resolvePeriod(sp);
  const { classified, ctx, names, snapshots } = await analyse(period);

  const q = (one(sp.q) ?? "").trim().toLowerCase();
  const segment = one(sp.segment) as SegmentKey | "longtail" | undefined;
  const sort = (one(sp.sort) as SortKey) || "gmv";
  const dir = one(sp.dir) === "asc" ? "asc" : "desc";
  const page = Math.max(1, Number(one(sp.page)) || 1);

  let list = classified.filter((c) => c.gmv > 0 || c.prevGmv > 0);
  if (q) list = list.filter((c) => c.username.toLowerCase().includes(q));
  if (segment === "longtail") list = list.filter((c) => !c.segment);
  else if (segment) list = list.filter((c) => c.segment === segment);

  const val = (c: (typeof list)[number]): number | string => {
    switch (sort) {
      case "orders": return c.orders;
      case "change": return c.change ?? -Infinity;
      case "vpw": return c.vpw ?? -1;
      case "followers": return c.followers ?? -1;
      case "cancel": return c.cancelRate;
      case "uplift": return c.uplift;
      case "name": return c.username.toLowerCase();
      default: return c.gmv;
    }
  };
  list = [...list].sort((a, b) => {
    const x = val(a), y = val(b);
    const r = typeof x === "string" ? x.localeCompare(y as string) : (x as number) - (y as number);
    return dir === "asc" ? r : -r;
  });

  const total = list.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const cur = Math.min(page, pages);
  const rows = list.slice((cur - 1) * PAGE_SIZE, cur * PAGE_SIZE);
  const pp = periodParams(sp);
  const base = { ...pp, q: one(sp.q), segment, sort: sort !== "gmv" ? sort : undefined, dir: dir !== "desc" ? dir : undefined };
  const hasPrev = period.prevEnd >= period.dataMin;
  const qs = periodQuery(period);

  const sortHref = (key: SortKey) =>
    href("/creators", { ...base, sort: key === "gmv" && dir === "desc" && sort !== "gmv" ? undefined : key, dir: sort === key && dir === "desc" ? "asc" : "desc" });
  const sortProps = (k: SortKey) => ({ href: sortHref(k), active: sort === k, dir } as const);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Creators"
        description={`Every creator who sold in ${period.label.toLowerCase()} or the period before, with what they need next.`}
      />

      <Card>
        <form action="/creators" className="flex flex-wrap items-center gap-2.5 border-b border-line p-4">
          {pp.range && <input type="hidden" name="range" value={pp.range} />}
          {pp.from && <input type="hidden" name="from" value={pp.from} />}
          {pp.to && <input type="hidden" name="to" value={pp.to} />}
          <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
            <Input name="q" defaultValue={one(sp.q)} placeholder="Search creator…" className="pl-9" aria-label="Search creators" />
          </div>
          <Select name="segment" defaultValue={segment ?? ""} aria-label="Segment">
            <option value="">All segments</option>
            {SEGMENT_ORDER.filter((k) => k !== "sample_no_post" && k !== "untapped").map((k) => (
              <option key={k} value={k}>{SEGMENTS[k].label}</option>
            ))}
            <option value="longtail">Long tail</option>
          </Select>
          <Button type="submit" variant="primary">Apply</Button>
          {(q || segment) && (
            <Link href={href("/creators", pp)} className="text-[13px] text-ink-3 hover:text-ink">Clear</Link>
          )}
          <span className="tnum ml-auto text-[13px] text-ink-3">{fmtInt(total)} creators</span>
        </form>

        {rows.length === 0 ? (
          <EmptyState title="No creators match" description="Try a different search or segment." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse">
              <thead>
                <tr>
                  <SortTh {...sortProps("name")}>Creator</SortTh>
                  <Th>Segment</Th>
                  <SortTh {...sortProps("gmv")} align="right">GMV</SortTh>
                  <SortTh {...sortProps("change")} align="right">vs prev.</SortTh>
                  <SortTh {...sortProps("orders")} align="right">Orders</SortTh>
                  <SortTh {...sortProps("vpw")} align="right">Videos / wk</SortTh>
                  <Th align="right">Top product</Th>
                  <SortTh {...sortProps("cancel")} align="right">Cancelled</SortTh>
                  <SortTh {...sortProps("followers")} align="right">Followers</SortTh>
                  <SortTh {...sortProps("uplift")} align="right">Uplift est.</SortTh>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.username} className="hover:bg-surface-2/60">
                    <Td>
                      <Link href={`/creators/${encodeURIComponent(c.username)}?${qs}`} className="group flex items-center gap-3">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[12px] font-semibold text-ink-2">
                          {initials(c.username)}
                        </span>
                        <span className="font-medium text-ink group-hover:text-brand">{c.username}</span>
                      </Link>
                    </Td>
                    <Td>
                      <div className="flex flex-wrap items-center gap-1">
                        <SegmentBadge segment={c.segment} short />
                        {c.flags.slice(0, 1).map((f) => (
                          <Badge key={f} tone="neutral" className="text-[11px]">{FLAGS[f].label}</Badge>
                        ))}
                      </div>
                    </Td>
                    <Td align="right" className="font-medium">{fmtRM(c.gmv)}</Td>
                    <Td align="right"><Delta value={hasPrev ? pctChange(c.gmv, c.prevGmv) : null} /></Td>
                    <Td align="right">{fmtInt(c.orders)}</Td>
                    <Td align="right">{c.vpw == null ? "–" : c.vpw.toFixed(1)}</Td>
                    <Td align="right" className="max-w-[200px] truncate text-ink-2" title={c.topProductId ? names.get(c.topProductId) : undefined}>
                      {c.topProductId ? names.get(c.topProductId)?.replace(/Washable Quilted THICK /, "") ?? "–" : "–"}
                    </Td>
                    <Td align="right" className={cn(c.cancelRate >= 0.2 && "font-medium text-serious")}>{c.gross ? fmtPct(c.cancelRate, 0) : "–"}</Td>
                    <Td align="right">{c.followers == null ? "–" : fmtCompact(c.followers)}</Td>
                    <Td align="right" className="text-ink-2">{c.uplift > 0 ? fmtRM(c.uplift) : "–"}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={cur} pages={pages} total={total} pageSize={PAGE_SIZE} hrefFor={(p) => href("/creators", { ...base, page: p })} />
      </Card>
      {!snapshots.txn && (
        <p className="text-[13px] text-ink-3">
          Posting frequency and view data need a Transaction analysis export covering this period. Upload one in the Data hub.
        </p>
      )}
      <p className="text-[12.5px] text-ink-3">
        Seller threshold: RM {Math.round(ctx.minSeller)} valid GMV in the period · {ctx.sellers} creators qualify.
      </p>
    </div>
  );
}
