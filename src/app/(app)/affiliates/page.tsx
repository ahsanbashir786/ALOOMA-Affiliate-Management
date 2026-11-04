import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, MessageCircle, Search } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getAffiliateDirectory, STATUS_ORDER, type DirProduct, type DirRow, type DirSort } from "@/lib/workflow/directory";
import { ACTION_HELP, STATUS_HELP, type CreatorStatus } from "@/lib/affiliates/status";
import { fmtDayLabel } from "@/lib/time";
import { href, one, type SP } from "@/lib/url";
import { Badge, Button, buttonClasses, Card, EmptyState, Input, PageHeader, Select } from "@/components/ui/primitives";
import { Pagination } from "@/components/ui/pagination";
import { OpenPanelButton } from "@/components/creator/open-panel-button";
import { cn, fmtRM } from "@/lib/utils";

export const metadata: Metadata = { title: "Affiliates" };
const SIZE = 15;
const COLS = "lg:grid-cols-[185px_minmax(150px,1.5fr)_minmax(105px,1fr)_72px_82px_88px_92px_78px_70px]";
const TONE: Record<CreatorStatus, "good" | "brand" | "warn" | "critical" | "neutral"> = { Winner: "good", Rising: "good", Steady: "neutral", Slipping: "warn", Quiet: "warn", Silent: "critical", Waiting: "neutral", Posted: "brand", New: "brand", Paused: "neutral" };
const SORTS: { key: DirSort; label: string }[] = [{ key: "gmv", label: "Highest total GMV" }, { key: "attention", label: "Needs attention first" }, { key: "video", label: "Most videos lately" }, { key: "name", label: "Name A–Z" }];

const rmShort = (n: number) => (n <= 0 ? "–" : fmtRM(n));

/** Orders, GMV and videos of one sampled product. */
function ProductCells({ p }: { p: DirProduct }) {
  return (
    <>
      <div className="min-w-0">
        <p className="text-[14.5px] font-medium leading-snug text-ink" title={p.name}>{p.name}</p>
      </div>
      <div className="min-w-0 text-[13px] leading-snug text-ink-2">
        {p.skus.length ? p.skus.map((s) => <p key={s} className="break-words" title={s}>{s}</p>) : <span className="text-ink-3">–</span>}
      </div>
      <div className="tnum">
        <p className="text-[15px] font-semibold text-ink">{p.orders || "–"}</p>
        {p.orders > 0 && <p className="text-[12px] text-ink-3" title="Orders from videos / from LIVE">V {p.ordersVideo} · L {p.ordersLive}</p>}
      </div>
      <p className="tnum text-[14.5px] font-semibold text-ink">{rmShort(p.gmv)}</p>
      <div className="tnum">
        <p className="text-[15px] font-semibold text-ink">{p.videos || "–"}</p>
        {p.videos > 0 && <p className="text-[12px] text-ink-3">{p.lastVideoOn ? `last ${fmtDayLabel(p.lastVideoOn)}` : "date unknown"}</p>}
      </div>
    </>
  );
}

function CreatorBlock({ r }: { r: DirRow }) {
  return (
    <div className="relative min-w-0 pr-7">
      <a href={`https://www.tiktok.com/@${encodeURIComponent(r.username)}`} target="_blank" rel="noopener noreferrer" aria-label={`Open @${r.username} on TikTok`} title="Open TikTok profile" className="absolute top-0 right-0 rounded-md p-1 text-ink-3 hover:bg-surface-2 hover:text-brand"><ExternalLink className="size-4" /></a>
      <OpenPanelButton username={r.username} className="block max-w-full truncate text-left text-[16px] font-semibold text-ink hover:underline" />
      <p className="text-[13px] text-ink-3">{r.type ?? "Type unknown"}</p>
      {r.phone ? (
        <a href={`https://wa.me/${r.phone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" title="Opening WhatsApp does not count as contact" className="mt-1 inline-flex items-center gap-1 text-[13px] text-ink-2 hover:text-brand"><MessageCircle className="size-3.5" />{r.phone}</a>
      ) : <p className="mt-1 text-[13px] text-ink-3">No number</p>}
      {r.overdue && <p className="mt-1"><Badge tone="critical">Promise overdue</Badge></p>}
    </div>
  );
}

/** Total GMV, status and action: three columns that each span every product line of the creator (desktop). */
function Verdict({ r, span }: { r: DirRow; span: number }) {
  const row = `1 / span ${span}`;
  return (
    <>
      <div className="tnum" style={{ gridColumn: 7, gridRow: row }}><p className="text-[16px] font-semibold text-ink">{rmShort(r.gmvAll)}</p></div>
      <div style={{ gridColumn: 8, gridRow: row }}><span title={STATUS_HELP[r.status]}><Badge tone={TONE[r.status]}>{r.status}</Badge></span></div>
      <div style={{ gridColumn: 9, gridRow: row }}><span title={ACTION_HELP[r.action]} className="inline-flex rounded-full border border-line-strong px-2.5 py-0.5 text-[13px] font-semibold text-ink">{r.action}</span></div>
    </>
  );
}

export default async function AffiliatesPage({ searchParams }: PageProps<"/affiliates">) {
  await requireUser();
  const sp = (await searchParams) as SP;
  const q = (one(sp.q) ?? "").trim();
  const status = (STATUS_ORDER.includes(one(sp.status) as CreatorStatus) ? one(sp.status) : "") as CreatorStatus | "";
  const sort = (SORTS.find((s) => s.key === one(sp.sort))?.key ?? "gmv") as DirSort;
  const samples = (["with", "none", "all"].includes(one(sp.samples) ?? "") ? one(sp.samples) : "with") as "with" | "none" | "all";
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const dir = await getAffiliateDirectory({ q, status, sort, samples, page, size: SIZE });
  const pages = Math.max(1, Math.ceil(dir.total / SIZE));
  const filters = { q: q || undefined, status: status || undefined, sort: sort === "gmv" ? undefined : sort, samples: samples === "with" ? undefined : samples };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Affiliates"
        description={`${dir.total} creator${dir.total === 1 ? "" : "s"} · one card each, with every product they received a sample of.${dir.dataEnd ? ` Sales are valid orders from all uploaded data; “lately” ends ${fmtDayLabel(dir.dataEnd)}.` : ""}`}
        actions={<Link href="/affiliates/analysis" className={buttonClasses({ variant: "secondary" })}>Detailed analysis</Link>}
      />
      <Card>
        <form action="/affiliates" className="flex flex-wrap items-center gap-3 border-b border-line p-4">
          <div className="relative min-w-60 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
            <Input name="q" defaultValue={q} placeholder="Search by username" aria-label="Search creators" className="pl-9" />
          </div>
          <Select name="samples" defaultValue={samples} aria-label="Samples">
            <option value="with">Received samples</option>
            <option value="all">All creators</option>
            <option value="none">No samples</option>
          </Select>
          <Select name="status" defaultValue={status} aria-label="Status">
            <option value="">All statuses</option>
            {STATUS_ORDER.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
          <Select name="sort" defaultValue={sort} aria-label="Sort">
            {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </Select>
          <Button type="submit">Apply</Button>
        </form>

        {dir.rows.length === 0 ? (
          <EmptyState title="No creators found" description="Try a different search or status." />
        ) : (
          <>
            <div className={cn("hidden gap-x-3 border-b border-line px-5 py-2.5 text-[13px] font-medium text-ink-3 lg:grid", COLS)}>
              <span>Creator</span><span>Sample product</span><span>SKU</span><span>Orders</span><span>GMV</span><span>Videos</span><span>Total GMV</span><span>Status</span><span>Action</span>
            </div>
            <ul className="divide-y divide-line">
              {dir.rows.map((r) => {
                const lines: (DirProduct | null)[] = r.products.length ? r.products : [null];
                return (
                  <li key={r.username} data-testid={`dir-${r.username}`} className="px-5 py-4">
                    {/* desktop: one grid, creator / totals / status span all the product lines */}
                    <div className={cn("hidden gap-x-3 gap-y-3 lg:grid", COLS)}>
                      <div style={{ gridColumn: 1, gridRow: `1 / span ${lines.length}` }}><CreatorBlock r={r} /></div>
                      {lines.map((p, i) => p ? (
                        <div key={p.pid ?? `n${i}`} className={cn("col-start-2 col-end-7 grid items-start gap-x-3", "grid-cols-subgrid", i > 0 && "border-t border-dashed border-line pt-3")} style={{ gridRow: i + 1 }}>
                          <ProductCells p={p} />
                        </div>
                      ) : (
                        <p key="none" className="col-start-2 col-end-7 text-[14px] text-ink-3" style={{ gridRow: 1 }}>No sample sent</p>
                      ))}
                      <Verdict r={r} span={lines.length} />
                    </div>
                    {/* mobile / tablet: stacked */}
                    <div className="space-y-3 lg:hidden">
                      <div className="flex items-start justify-between gap-3">
                        <CreatorBlock r={r} />
                        <div className="flex shrink-0 flex-col items-end gap-1.5"><Badge tone={TONE[r.status]}>{r.status}</Badge><span className="rounded-full border border-line-strong px-2.5 py-0.5 text-[13px] font-semibold">{r.action}</span></div>
                      </div>
                      {lines.map((p, i) => p ? (
                        <div key={p.pid ?? `m${i}`} className="rounded-xl bg-surface-2 p-3.5">
                          <p className="text-[14.5px] font-medium text-ink">{p.name}</p>
                          <p className="break-words text-[12.5px] text-ink-3">{p.skus.join(" · ") || "–"}</p>
                          <dl className="mt-2.5 grid grid-cols-3 gap-2 text-[13px]">
                            <div><dt className="text-ink-3">Orders</dt><dd className="tnum font-semibold">{p.orders || "–"}{p.orders > 0 && <span className="block text-[12px] font-normal text-ink-3">V {p.ordersVideo} · L {p.ordersLive}</span>}</dd></div>
                            <div><dt className="text-ink-3">GMV</dt><dd className="tnum font-semibold">{rmShort(p.gmv)}</dd></div>
                            <div><dt className="text-ink-3">Videos</dt><dd className="tnum font-semibold">{p.videos || "–"}{p.videos > 0 && <span className="block text-[12px] font-normal text-ink-3">{p.lastVideoOn ? `last ${fmtDayLabel(p.lastVideoOn)}` : "date unknown"}</span>}</dd></div>
                          </dl>
                        </div>
                      ) : <p key="m-none" className="text-[14px] text-ink-3">No sample sent</p>)}
                      <p className="text-[14px] text-ink-2">Total GMV <b className="tnum text-[16px] text-ink">{rmShort(r.gmvAll)}</b></p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
        <div className="border-t border-line p-3"><Pagination page={Math.min(page, pages)} pages={pages} total={dir.total} pageSize={SIZE} hrefFor={(p) => href("/affiliates", { ...filters, page: p })} /></div>
      </Card>

      <details className="rounded-xl border border-line bg-surface">
        <summary className="cursor-pointer px-5 py-4 text-[15px] font-medium text-ink">What the status and action words mean</summary>
        <div className="grid gap-6 px-5 pb-5 text-[14px] text-ink-2 sm:grid-cols-2">
          <dl className="space-y-1.5"><dt className="font-semibold text-ink">Status</dt>{STATUS_ORDER.map((s) => <dd key={s}><b className="text-ink">{s}</b> – {STATUS_HELP[s]}</dd>)}</dl>
          <dl className="space-y-1.5"><dt className="font-semibold text-ink">Action</dt>{(Object.keys(ACTION_HELP) as (keyof typeof ACTION_HELP)[]).map((a) => <dd key={a}><b className="text-ink">{a}</b> – {ACTION_HELP[a]}</dd>)}</dl>
          <p className="sm:col-span-2 text-[13px] text-ink-3">“Lately” = the latest 28 days of orders we hold. Winner = top 10% of sellers in that period. Orders, GMV and videos are per product (all its sizes together). V = orders from videos, L = from LIVE.</p>
        </div>
      </details>
    </div>
  );
}
