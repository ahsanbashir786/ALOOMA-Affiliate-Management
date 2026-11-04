import type { Metadata } from "next";
import { Fragment } from "react";
import Link from "next/link";
import { ExternalLink, MessageCircle } from "lucide-react";
import { can, requireUser } from "@/lib/auth";
import { WorkHeader } from "@/components/work/work-header";
import { ACTION_ORDER, getAffiliateDirectory, STATUS_ORDER, type DirLine, type DirRow } from "@/lib/workflow/directory";
import { parseDirectoryParams } from "@/lib/workflow/directory-params";
import { ACTION_HELP, STATUS_HELP, type CreatorStatus } from "@/lib/affiliates/status";
import { fmtDayLabel } from "@/lib/time";
import { href, one, type SP } from "@/lib/url";
import { Badge, buttonClasses, Card, EmptyState } from "@/components/ui/primitives";
import { sampleRange } from "@/lib/samples/range";
import { statsOf } from "@/lib/affiliates/action-messages";
import { Pagination } from "@/components/ui/pagination";
import { OpenPanelButton } from "@/components/creator/open-panel-button";
import { DirectoryFilters } from "@/components/affiliates/directory-filters";
import { LineAction } from "@/components/affiliates/line-action";
import { cn, fmtRM } from "@/lib/utils";

export const metadata: Metadata = { title: "Affiliate Data Management" };
const SIZE = 50;
const COLS = "lg:grid-cols-[170px_minmax(120px,1.2fr)_minmax(85px,0.8fr)_62px_76px_96px_92px_minmax(120px,1.1fr)_minmax(105px,0.9fr)]";
const TONE: Record<CreatorStatus, "good" | "brand" | "warn" | "critical" | "neutral"> = { Winner: "good", Rising: "good", Steady: "neutral", Slipping: "warn", Quiet: "warn", Silent: "critical", Waiting: "neutral", Posted: "brand", New: "brand", Paused: "neutral" };

const rmShort = (n: number) => (n <= 0 ? "–" : fmtRM(n));

function Orders({ l }: { l: DirLine }) {
  return (
    <div className="tnum">
      <p className="text-[15px] font-semibold text-ink">{l.orders || "–"}</p>
      {l.orders > 0 && <p className="text-[12px] text-ink-3" title="Orders from videos / from LIVE">V {l.ordersVideo} · L {l.ordersLive}</p>}
    </div>
  );
}
function Gmv({ l }: { l: DirLine }) {
  return (
    <div className="tnum">
      <p className="text-[14.5px] font-semibold text-ink">{rmShort(l.gmv)}</p>
      {l.gmv > 0 && <p className="text-[12px] whitespace-nowrap text-ink-3" title="GMV from videos / from LIVE (RM)">V {Math.round(l.gmvVideo).toLocaleString("en-MY")} · L {Math.round(l.gmvLive).toLocaleString("en-MY")}</p>}
    </div>
  );
}
function Videos({ l }: { l: DirLine }) {
  return (
    <div className="tnum">
      <p className="text-[15px] font-semibold text-ink">{l.videos || "–"}</p>
      {l.videos > 0 && <p className="text-[12px] text-ink-3">{l.lastVideoOn ? `last ${fmtDayLabel(l.lastVideoOn)}` : "date unknown"}</p>}
    </div>
  );
}
function StatusCell({ l }: { l: DirLine }) {
  return (
    <div>
      <span className="inline-flex items-center gap-1.5">
        <span title={STATUS_HELP[l.status]}><Badge tone={TONE[l.status]}>{l.status}</Badge></span>
        {l.prev28 > 0 && l.gmv28 !== l.prev28 && (
          <span className={cn("tnum text-[12px] font-semibold", l.gmv28 > l.prev28 ? "text-good" : "text-critical")} title={`Last 28 days RM ${Math.round(l.gmv28).toLocaleString("en-MY")} vs RM ${Math.round(l.prev28).toLocaleString("en-MY")} before`}>
            {l.gmv28 > l.prev28 ? "▲" : "▼"} {Math.abs(Math.round((l.gmv28 / l.prev28 - 1) * 100))}%
          </span>
        )}
      </span>
      <p className="mt-1 text-[12px] leading-snug text-ink-3">{l.reason}</p>
    </div>
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
      <p className="mt-1 text-[12px] text-ink-3">{r.lastContactedOn ? `Contacted ${fmtDayLabel(r.lastContactedOn)}` : "Not contacted yet"}</p>
      {r.overdue && <p className="mt-1"><Badge tone="critical">Promise overdue</Badge></p>}
    </div>
  );
}

export default async function AffiliatesPage({ searchParams }: PageProps<"/affiliates">) {
  const user = await requireUser();
  const sp = (await searchParams) as SP;
  const raw = Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, one(v)]));
  const opts = parseDirectoryParams(raw);
  const { period, range } = await sampleRange(sp);
  const periodLabel = `${fmtDayLabel(period.start)} – ${fmtDayLabel(period.end)}`;
  const dir = await getAffiliateDirectory({ ...opts, range, size: SIZE });
  const sortHref = (sort: string) => href("/affiliates", { ...pageFilters, sort: sort === "gmv" ? undefined : sort, range: sp.range ? one(sp.range) : undefined, from: one(sp.from), to: one(sp.to) });
  /** A column heading that sorts: first click high to low, click again for low to high. */
  const head = (label: string, asc: string, desc: string) => {
    const cur = values.sort === desc ? "desc" : values.sort === asc ? "asc" : null;
    return <Link href={sortHref(cur === "desc" ? asc : desc)} scroll={false} aria-label={`Sort by ${label}`} className={cn("inline-flex items-center gap-1 hover:text-ink", cur && "text-ink")}>{label}<span aria-hidden className="text-[11px]">{cur === "desc" ? "▼" : cur === "asc" ? "▲" : "↕"}</span></Link>;
  };
  const statsAll = (r: DirRow) => r.allLines.filter((l) => !l.noSample).map(statsOf);
  const page = opts.page ?? 1;
  const pages = Math.max(1, Math.ceil(dir.total / SIZE));
  const values = { q: opts.q ?? "", samples: opts.samples ?? "with", product: opts.product ?? "", status: opts.status ?? "", action: opts.action ?? "", type: opts.type ?? "", wa: opts.wa ?? "", contact: opts.contact ?? "", done: opts.done ?? "", sort: opts.sort ?? "gmv" };
  const pageFilters = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, (k === "samples" && v === "with") || (k === "sort" && v === "gmv") ? undefined : v || undefined]));

  return (
    <div className="space-y-6">
      <WorkHeader current="find" title="Affiliate Data Management" isOwner={can(user, "admin")} actions={<Link href="/affiliates/analysis" className={buttonClasses({ variant: "secondary" })}>Detailed Analysis</Link>} />
      <Card>
        <DirectoryFilters
          values={values}
          products={dir.products}
          actions={ACTION_ORDER.map((k) => ({ key: k, count: dir.actionCounts[k] }))}
          todo={dir.actionCounts.todo}
          statuses={STATUS_ORDER.map((k) => ({ key: k, count: dir.statusCounts[k] }))}
          shown={`${dir.total} creator${dir.total === 1 ? "" : "s"} · ${dir.totalLines} line${dir.totalLines === 1 ? "" : "s"}${dir.dataEnd ? ` · “lately” ends ${fmtDayLabel(dir.dataEnd)}` : ""}`}
        />

        {dir.rows.length === 0 ? (
          <EmptyState title="No Creators Match" description="Clear a filter to see more." />
        ) : (
          <>
            <div className={cn("hidden gap-x-3 border-b border-line px-5 py-2.5 text-[13px] font-medium text-ink-3 lg:grid", COLS)}>
              <span>Creator</span><span>Sample Product</span><span>SKU</span>{head("Orders", "orders_asc", "orders")}{head("Videos", "videos_all_asc", "videos_all")}{head("GMV", "linegmv_asc", "linegmv")}{head("Total GMV", "gmv_asc", "gmv")}<span>Status</span><span>Action</span>
            </div>
            <ul className="divide-y divide-line">
              {dir.rows.map((r) => (
                <li key={r.username} data-testid={`dir-${r.username}`} className="px-5 py-4">
                  {/* desktop: creator and total GMV span all the product lines; each line has its own status and action */}
                  <div className={cn("hidden gap-x-3 gap-y-3 lg:grid", COLS)}>
                    <div style={{ gridColumn: 1, gridRow: `1 / span ${r.lines.length}` }}><CreatorBlock r={r} /></div>
                    {r.lines.map((l, i) => (
                      <Fragment key={l.pid ?? `n${i}`}>
                        <div data-testid="dir-line" className={cn("col-start-2 col-end-7 grid grid-cols-subgrid items-start gap-x-3", i > 0 && "border-t border-dashed border-line pt-3")} style={{ gridRow: i + 1 }}>
                          <p className={cn("min-w-0 text-[14.5px] leading-snug", l.noSample ? "text-ink-3" : "font-medium text-ink")} title={l.name}>{l.name}</p>
                          <div className="min-w-0 text-[13px] leading-snug text-ink-2">{l.skus.length ? l.skus.map((s) => <p key={s} className="break-words" title={s}>{s}</p>) : <span className="text-ink-3">–</span>}</div>
                          <Orders l={l} /><Videos l={l} /><Gmv l={l} />
                        </div>
                        <div className={cn("col-start-8 col-end-10 grid grid-cols-subgrid items-start gap-x-3", i > 0 && "border-t border-dashed border-line pt-3")} style={{ gridRow: i + 1 }}>
                          <StatusCell l={l} /><LineAction username={r.username} line={l} all={statsAll(r)} period={periodLabel} />
                        </div>
                      </Fragment>
                    ))}
                    <div className="tnum whitespace-nowrap" style={{ gridColumn: 7, gridRow: `1 / span ${r.lines.length}` }}><p className="text-[16px] font-semibold text-ink">{rmShort(r.gmvAll)}</p></div>
                  </div>
                  {/* mobile / tablet: stacked */}
                  <div className="space-y-3 lg:hidden">
                    <div className="flex items-start justify-between gap-3">
                      <CreatorBlock r={r} />
                      <p className="tnum shrink-0 text-right text-[13px] text-ink-3">Total GMV<b className="block text-[16px] text-ink">{rmShort(r.gmvAll)}</b></p>
                    </div>
                    {r.lines.map((l, i) => (
                      <div key={l.pid ?? `m${i}`} data-testid="dir-line-m" className="rounded-xl bg-surface-2 p-3.5">
                        <p className={cn("text-[14.5px]", l.noSample ? "text-ink-3" : "font-medium text-ink")}>{l.name}</p>
                        {l.skus.length > 0 && <p className="break-words text-[12.5px] text-ink-3">{l.skus.join(" · ")}</p>}
                        <div className="mt-2.5 grid grid-cols-3 gap-2 text-[13px]">
                          <div><p className="text-ink-3">Orders</p><Orders l={l} /></div>
                          <div><p className="text-ink-3">Videos</p><Videos l={l} /></div>
                          <div><p className="text-ink-3">GMV</p><Gmv l={l} /></div>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-3 border-t border-line pt-3">
                          <StatusCell l={l} /><LineAction username={r.username} line={l} all={statsAll(r)} period={periodLabel} />
                        </div>
                      </div>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="border-t border-line p-3"><Pagination page={Math.min(page, pages)} pages={pages} total={dir.total} pageSize={SIZE} hrefFor={(p) => href("/affiliates", { ...pageFilters, range: sp.range ? one(sp.range) : undefined, from: one(sp.from), to: one(sp.to), page: p })} /></div>
      </Card>

      <details className="rounded-xl border border-line bg-surface">
        <summary className="cursor-pointer px-5 py-4 text-[15px] font-medium text-ink">What The Status And Action Words Mean</summary>
        <div className="grid gap-6 px-5 pb-5 text-[14px] text-ink-2 sm:grid-cols-2">
          <dl className="space-y-1.5"><dt className="font-semibold text-ink">Status</dt>{STATUS_ORDER.map((s) => <dd key={s}><b className="text-ink">{s}</b> – {STATUS_HELP[s]}</dd>)}</dl>
          <dl className="space-y-1.5"><dt className="font-semibold text-ink">Action</dt>{(Object.keys(ACTION_HELP) as (keyof typeof ACTION_HELP)[]).map((a) => <dd key={a}><b className="text-ink">{a}</b> – {ACTION_HELP[a]}</dd>)}</dl>
          <p className="text-[13px] text-ink-3 sm:col-span-2">Status and action are worked out for each product line on its own. “Lately” = the latest 28 days of orders we hold. Winner = top 10% of sellers of that product in that period. V = from videos, L = from LIVE. Click an action to message the creator and record what happened – it then shows in Today&apos;s Work.</p>
        </div>
      </details>
    </div>
  );
}
