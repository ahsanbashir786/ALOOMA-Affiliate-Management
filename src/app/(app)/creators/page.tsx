import type { Metadata } from "next";
import { Fragment } from "react";
import Link from "next/link";
import { ExternalLink, MessageCircle, Users } from "lucide-react";
import { can, requireUser } from "@/lib/auth";
import { ACTION_ORDER, getAffiliateDirectory, STATUS_ORDER, type DirLine, type DirRow } from "@/lib/workflow/directory";
import { parseCreatorParams, PERIODS } from "@/lib/creators/params";
import { getStaff, syncFreshness } from "@/lib/creators/meta";
import { hasSyncedData } from "@/lib/creators/load";
import { STATUS_HELP, ACTION_HELP, type CreatorStatus } from "@/lib/affiliates/status";
import { fmtDayLabel } from "@/lib/time";
import { href, one, type SP } from "@/lib/url";
import { Badge, buttonClasses, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { statsOf } from "@/lib/affiliates/action-messages";
import { Pagination } from "@/components/ui/pagination";
import { OpenPanelButton } from "@/components/creator/open-panel-button";
import { CreatorFilters } from "@/components/creators/creator-filters";
import { LineAction } from "@/components/affiliates/line-action";
import { Avatar } from "@/components/creators/avatar";
import { TierBadge } from "@/components/creators/tier-badge";
import { OwnerPicker } from "@/components/creators/owner-picker";
import { Sparkline } from "@/components/viz/sparkline";
import { cn, fmtCompact, fmtRM } from "@/lib/utils";

export const metadata: Metadata = { title: "Creators" };
const SIZE = 50;
const COLS = "lg:grid-cols-[232px_minmax(100px,1.2fr)_minmax(64px,0.7fr)_58px_72px_92px_104px_minmax(110px,1.1fr)_minmax(96px,0.9fr)]";
const TONE: Record<CreatorStatus, "good" | "brand" | "warn" | "critical" | "neutral"> = { Winner: "good", Rising: "good", Steady: "neutral", Slipping: "warn", Quiet: "warn", Silent: "critical", Waiting: "neutral", Posted: "brand", New: "brand", Paused: "neutral" };
/** A compact headline number that links to the table filtered to what it counts. */
function Kpi({ label, value, sub, delta, href: to, wide }: { label: string; value: string; sub: string; delta?: number | null; href: string; wide?: boolean }) {
  return (
    <Link href={to} className={cn("rounded-2xl border border-line bg-surface px-4 py-3.5 transition-colors hover:bg-surface-2", wide && "col-span-2 lg:col-span-1")}>
      <p className="text-[13px] font-medium text-ink-3">{label}</p>
      <p className="mt-0.5 flex items-baseline gap-2">
        <span className="tnum text-[26px] leading-tight font-semibold tracking-tight text-ink">{value}</span>
        {delta != null && delta !== 0 && <span className={cn("tnum text-[13px] font-semibold", delta > 0 ? "text-good" : "text-critical")}>{delta > 0 ? "▲" : "▼"} {Math.abs(Math.round(delta))}%</span>}
      </p>
      <p className="truncate text-[12.5px] text-ink-3">{sub}</p>
    </Link>
  );
}
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

function CreatorBlock({ r, staff, canAct }: { r: DirRow; staff: { id: string; name: string }[]; canAct: boolean }) {
  const e = r.extra!;
  return (
    <div className="flex min-w-0 gap-3">
      <Avatar name={r.username} size={42} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-1">
          <OpenPanelButton username={r.username} className="block min-w-0 truncate text-left text-[15.5px] font-semibold text-ink hover:underline" />
          <a href={`https://www.tiktok.com/@${encodeURIComponent(r.username)}`} target="_blank" rel="noopener noreferrer" aria-label={`Open @${r.username} on TikTok`} title="Open TikTok profile" className="shrink-0 rounded-md p-0.5 text-ink-3 hover:bg-surface-2 hover:text-brand"><ExternalLink className="size-3.5" /></a>
        </div>
        <p className="tnum flex flex-wrap items-center gap-x-1.5 text-[12.5px] text-ink-3">
          {e.followers != null ? <span>{fmtCompact(e.followers)} followers</span> : <span>{r.type ?? "Type unknown"}</span>}
          {e.followers != null && r.type && <span>· {r.type}</span>}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-1.5">
          <TierBadge tier={e.tier} score={e.score} why={e.scoreWhy} />
          <OwnerPicker username={r.username} ownerId={e.ownerId} staff={staff} canAct={canAct} />
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[12px] text-ink-3">
          {r.phone ? <a href={`https://wa.me/${r.phone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" title="Opening WhatsApp does not count as contact" className="inline-flex items-center gap-1 hover:text-brand"><MessageCircle className="size-3.5" />{r.phone}</a> : <span>No number</span>}
          <span>· {r.lastContactedOn ? `Contacted ${fmtDayLabel(r.lastContactedOn)}` : "Not contacted"}</span>
        </p>
        {(r.overdue || e.requestsOpen > 0) && (
          <p className="mt-1 flex flex-wrap gap-1.5">
            {r.overdue && <Badge tone="critical">Promise overdue</Badge>}
            {e.requestsOpen > 0 && <Badge tone="brand">{e.requestsOpen} sample request{e.requestsOpen === 1 ? "" : "s"}</Badge>}
          </p>
        )}
      </div>
    </div>
  );
}

export default async function CreatorsPage({ searchParams }: PageProps<"/creators">) {
  const user = await requireUser();
  const canAct = can(user, "manager");
  const sp = (await searchParams) as SP;
  const raw = Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, one(v)]));
  const opts = parseCreatorParams(raw);
  const [synced, fresh, staff] = await Promise.all([hasSyncedData(), syncFreshness(), getStaff()]);

  if (!synced) {
    return (
      <div className="space-y-6">
        <PageHeader title="Creators" />
        <Card><EmptyState icon={<Users className="size-5" />} title="No TikTok data yet" description="Connect TikTok Shop and run Data Sync. Your creators appear here as soon as the first orders arrive." action={<Link href="/sync" className={buttonClasses({ variant: "primary" })}>Open Data Sync</Link>} /></Card>
      </div>
    );
  }

  const dir = await getAffiliateDirectory({ ...opts, size: SIZE });
  const ov = dir.overview!;
  const periodLabel = opts.range ? `${fmtDayLabel(opts.range.start)} – ${fmtDayLabel(opts.range.end)}` : "All time";
  const values = { q: opts.q ?? "", samples: opts.samples ?? "all", product: opts.product ?? "", status: opts.status ?? "", action: opts.action ?? "", type: opts.type ?? "", wa: opts.wa ?? "", contact: opts.contact ?? "", owner: opts.owner ?? "", tier: opts.tier ?? "", sort: opts.sort ?? "gmv", days: opts.days };
  const pageFilters = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, (k === "samples" && v === "all") || (k === "sort" && v === "gmv") || (k === "days" && v === "all") ? undefined : v || undefined]));
  const sortHref = (sort: string) => href("/creators", { ...pageFilters, sort: sort === "gmv" ? undefined : sort });
  /** A column heading that sorts: first click high to low, click again for low to high. */
  const head = (label: string, asc: string, desc: string) => {
    const cur = values.sort === desc ? "desc" : values.sort === asc ? "asc" : null;
    return <Link href={sortHref(cur === "desc" ? asc : desc)} scroll={false} aria-label={`Sort by ${label}`} className={cn("inline-flex items-center gap-1 hover:text-ink", cur && "text-ink")}>{label}<span aria-hidden className="text-[11px]">{cur === "desc" ? "▼" : cur === "asc" ? "▲" : "↕"}</span></Link>;
  };
  const statsAll = (r: DirRow) => r.allLines.filter((l) => (l.sampled ?? !l.noSample)).map(statsOf);
  const page = opts.page ?? 1;
  const pages = Math.max(1, Math.ceil(dir.total / SIZE));
  const delta = ov.prev28 > 0 ? ((ov.gmv28 - ov.prev28) / ov.prev28) * 100 : null;
  const goldN = ov.tiers.Gold;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Creators"
        description={<span className="inline-flex items-center gap-2"><span className={cn("size-2 rounded-full", fresh.ok ? "bg-good" : "bg-warn")} />{fresh.label} from TikTok Shop</span>}
        actions={<Link href="/sync" className={buttonClasses({ variant: "secondary" })}>Data Sync</Link>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5" aria-label="Creators at a glance" data-testid="creator-kpis">
        <Kpi label="Creators" value={ov.creators.toLocaleString("en-MY")} sub={`${goldN} Gold · ${ov.tiers.Silver} Silver`} href="/creators" />
        <Kpi label="Selling lately" value={ov.sellers28.toLocaleString("en-MY")} sub="sold in the last 28 days" href="/creators?sort=lately" />
        <Kpi label="Sales, 28 days" value={`RM ${fmtCompact(ov.gmv28)}`} delta={delta} sub={ov.prev28 > 0 ? "vs the 28 days before" : "no earlier period yet"} href="/creators?sort=lately" />
        <Kpi label="To do" value={ov.todoLines.toLocaleString("en-MY")} sub={`${ov.silentLines} silent after a sample`} href="/creators?action=todo" />
        <Kpi label="Not owned" value={ov.unowned.toLocaleString("en-MY")} sub="nobody looks after them yet" href="/creators?owner=none" wide />
      </div>

      <Card>
        <CreatorFilters
          values={values}
          products={dir.products}
          actions={ACTION_ORDER.map((k) => ({ key: k, count: dir.actionCounts[k] }))}
          todo={dir.actionCounts.todo}
          statuses={STATUS_ORDER.map((k) => ({ key: k, count: dir.statusCounts[k] }))}
          staff={staff}
          shown={`${dir.total.toLocaleString("en-MY")} creator${dir.total === 1 ? "" : "s"} · ${dir.totalLines.toLocaleString("en-MY")} product line${dir.totalLines === 1 ? "" : "s"} · orders, GMV and videos: ${PERIODS.find((p) => p.key === opts.days)?.label.toLowerCase()}${opts.range ? ` (${periodLabel})` : ""}`}
        />

        {dir.rows.length === 0 ? (
          <EmptyState title="No creators match" description="Clear a filter to see more." />
        ) : (
          <>
            <div className={cn("hidden gap-x-3 border-b border-line px-5 py-2.5 text-[13px] font-medium text-ink-3 lg:grid", COLS)}>
              <span>Creator</span><span>Product</span><span>SKU</span>{head("Orders", "orders_asc", "orders")}{head("Videos", "videos_all_asc", "videos_all")}{head("GMV", "linegmv_asc", "linegmv")}{head("Total GMV", "gmv_asc", "gmv")}<span>Status</span><span>Action</span>
            </div>
            <ul className="divide-y divide-line">
              {dir.rows.map((r) => (
                <li key={r.username} data-testid={`dir-${r.username}`} className="px-5 py-4">
                  <div className={cn("hidden gap-x-3 gap-y-3 lg:grid", COLS)}>
                    <div style={{ gridColumn: 1, gridRow: `1 / span ${r.lines.length}` }}><CreatorBlock r={r} staff={staff} canAct={canAct} /></div>
                    {r.lines.map((l, i) => (
                      <Fragment key={l.pid ?? `n${i}`}>
                        <div data-testid="dir-line" className={cn("col-start-2 col-end-7 grid grid-cols-subgrid items-start gap-x-3", i > 0 && "border-t border-dashed border-line pt-3")} style={{ gridRow: i + 1 }}>
                          <div className="min-w-0">
                            <p className={cn("text-[14.5px] leading-snug", l.noSample ? "text-ink-3" : "font-medium text-ink")} title={l.name}>{l.name}</p>
                            {l.sampled ? <p className="text-[12px] text-brand">Sample sent</p> : !l.noSample ? <p className="text-[12px] text-ink-3">Sells without a sample</p> : null}
                          </div>
                          <div className="min-w-0 text-[13px] leading-snug text-ink-2">{l.skus.length ? l.skus.map((s) => <p key={s} className="break-words" title={s}>{s}</p>) : <span className="text-ink-3">–</span>}</div>
                          <Orders l={l} /><Videos l={l} /><Gmv l={l} />
                        </div>
                        <div className={cn("col-start-8 col-end-10 grid grid-cols-subgrid items-start gap-x-3", i > 0 && "border-t border-dashed border-line pt-3")} style={{ gridRow: i + 1 }}>
                          <StatusCell l={l} /><LineAction username={r.username} line={l} all={statsAll(r)} period={periodLabel} />
                        </div>
                      </Fragment>
                    ))}
                    <div className="tnum min-w-0" style={{ gridColumn: 7, gridRow: `1 / span ${r.lines.length}` }}>
                      <p className="text-[16px] font-semibold whitespace-nowrap text-ink">{rmShort(r.gmvAll)}</p>
                      <div className="mt-1 w-24" title="Weekly sales, last 8 weeks"><Sparkline values={r.extra!.weeks} tone={r.extra!.gmv28 >= r.extra!.prev28 ? "good" : "critical"} label="Weekly sales, last 8 weeks" /></div>
                    </div>
                  </div>
                  <div className="space-y-3 lg:hidden">
                    <div className="flex items-start justify-between gap-3">
                      <CreatorBlock r={r} staff={staff} canAct={canAct} />
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
        <div className="border-t border-line p-3"><Pagination page={Math.min(page, pages)} pages={pages} total={dir.total} pageSize={SIZE} hrefFor={(p) => href("/creators", { ...pageFilters, page: p })} /></div>
      </Card>

      <details className="rounded-xl border border-line bg-surface">
        <summary className="cursor-pointer px-5 py-4 text-[15px] font-medium text-ink">How Status, Action And Score Work</summary>
        <div className="grid gap-6 px-5 pb-5 text-[14px] text-ink-2 sm:grid-cols-2">
          <dl className="space-y-1.5"><dt className="font-semibold text-ink">Status</dt>{STATUS_ORDER.map((s) => <dd key={s}><b className="text-ink">{s}</b> – {STATUS_HELP[s]}</dd>)}</dl>
          <dl className="space-y-1.5"><dt className="font-semibold text-ink">Action</dt>{(Object.keys(ACTION_HELP) as (keyof typeof ACTION_HELP)[]).map((a) => <dd key={a}><b className="text-ink">{a}</b> – {ACTION_HELP[a]}</dd>)}</dl>
          <p className="text-[13px] text-ink-3 sm:col-span-2">Score (0–100) = Sales 40 + Reliability 25 + Consistency 20 + Reach 15. Gold 70+, Silver 45+, Bronze 20+. Reliability = samples that ended in a post; Consistency = weeks with a sale out of the last 8; Reach = followers. Status and action are worked out for each product line on its own. “Lately” = the 28 days ending at the latest order. Sales exclude cancelled and fully returned orders. V = from videos, L = from LIVE.</p>
        </div>
      </details>
    </div>
  );
}
