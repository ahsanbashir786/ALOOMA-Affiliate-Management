import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDown, ArrowUp, Download, ExternalLink, Users } from "lucide-react";
import { can, requireUser } from "@/lib/auth";
import { AFFILIATE_SORTS, loadAffiliates, type AffiliateScope, type AffiliateSort } from "@/lib/affiliates/service";
import { CONTENT_TYPE_LABEL } from "@/lib/samples/analysis";
import { sampleRange } from "@/lib/samples/range";
import { href, one, periodParams, type SP } from "@/lib/url";
import { Badge, Button, buttonClasses, Card, EmptyState, Input, PageHeader, Select } from "@/components/ui/primitives";
import { Pagination } from "@/components/ui/pagination";
import { FilesBar } from "@/components/samples/files-bar";
import { PhoneEditor } from "@/components/samples/phone-editor";
import { AffiliateRow } from "@/components/affiliates/affiliate-row";
import { AFFILIATE_COLS } from "@/components/affiliates/cols";
import { AffiliateDetail } from "@/components/affiliates/affiliate-detail";
import { cn, fmtDate, fmtInt, fmtRM, initials } from "@/lib/utils";

export const metadata: Metadata = { title: "Affiliates" };

const PAGE_SIZE = 25;

export default async function AffiliatesPage({ searchParams }: PageProps<"/affiliates">) {
  const user = await requireUser();
  const sp = (await searchParams) as SP;
  const canEdit = can(user, "manager");
  const pp = periodParams(sp);
  const { period, range } = await sampleRange(sp);

  const q = (one(sp.q) ?? "").trim();
  const scope: AffiliateScope = one(sp.scope) === "everyone" ? "everyone" : "active";
  const noPhone = one(sp.nophone) === "1";
  const sort: AffiliateSort = (one(sp.sort) as AffiliateSort) in AFFILIATE_SORTS ? (one(sp.sort) as AffiliateSort) : "gmv";
  const dir = one(sp.dir) === "asc" || one(sp.dir) === "desc" ? (one(sp.dir) as "asc" | "desc") : AFFILIATE_SORTS[sort].dir;
  const page = Math.max(1, Number(one(sp.page)) || 1);

  const { items, total, withoutPhone } = await loadAffiliates({ q, scope, noPhone, range }, sort, dir, period, PAGE_SIZE, (page - 1) * PAGE_SIZE);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const cur = Math.min(page, pages);
  if (cur !== page && total > 0) {
    // a page past the end (after filtering) – show the last one
    const again = await loadAffiliates({ q, scope, noPhone, range }, sort, dir, period, PAGE_SIZE, (cur - 1) * PAGE_SIZE);
    items.splice(0, items.length, ...again.items);
  }

  const isDefault = sort === "gmv" && dir === AFFILIATE_SORTS.gmv.dir;
  const filters = { ...pp, q: q || undefined, scope: scope === "everyone" ? "everyone" : undefined, nophone: noPhone ? "1" : undefined, sort: isDefault ? undefined : sort, dir: isDefault ? undefined : dir };
  const sortHref = (k: AffiliateSort) =>
    href("/affiliates", { ...filters, sort: k, dir: sort === k ? (dir === "desc" ? "asc" : "desc") : AFFILIATE_SORTS[k].dir, page: undefined });
  const sortLink = (k: AffiliateSort, label: string, right?: boolean) => (
    <Link href={sortHref(k)} className={cn("inline-flex items-center gap-1 hover:text-ink", right && "justify-end", sort === k && "text-ink")}>
      {label}
      {sort === k && (dir === "desc" ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />)}
    </Link>
  );
  const exportHref = href("/api/affiliates/export", { ...filters, page: undefined });
  const th = "text-[12px] font-medium tracking-wide whitespace-nowrap text-ink-3 uppercase";

  return (
    <div>
      <PageHeader
        title="Affiliates"
        description={`Everything about each affiliate in one place: WhatsApp, the samples she received, what she sold per SKU, how much came from samples, and what to do next.${
          range ? ` Showing ${fmtDate(range.start)} – ${fmtDate(range.end)}.` : ""
        }`}
        actions={
          <a href={exportHref} className={buttonClasses({ variant: "secondary" })}>
            <Download className="size-4" /> Export to Excel
          </a>
        }
      />
      <FilesBar role={user.role} title="Data loaded" showOptional={false} />

      <form action="/affiliates" className="mb-4 flex flex-wrap items-center gap-2.5 rounded-xl border border-line bg-surface p-3 shadow-card">
        {pp.range && <input type="hidden" name="range" value={pp.range} />}
        {pp.from && <input type="hidden" name="from" value={pp.from} />}
        {pp.to && <input type="hidden" name="to" value={pp.to} />}
        <Input name="q" defaultValue={q} placeholder="Search username…" className="max-w-[240px]" aria-label="Search" />
        <Select name="scope" defaultValue={scope} aria-label="Who to show">
          <option value="active">With samples or sales</option>
          <option value="everyone">Everyone</option>
        </Select>
        <label className="flex items-center gap-2 text-[13.5px] text-ink-2">
          <input type="checkbox" name="nophone" value="1" defaultChecked={noPhone} className="size-4 accent-[var(--brand)]" /> No WhatsApp number
        </label>
        <label className="flex items-center gap-2 text-[13.5px] text-ink-2">
          Sort by
          <Select name="sort" defaultValue={sort} aria-label="Sort by">
            {(Object.keys(AFFILIATE_SORTS) as AffiliateSort[]).map((k) => <option key={k} value={k}>{AFFILIATE_SORTS[k].label}</option>)}
          </Select>
        </label>
        <Select name="dir" defaultValue={dir} aria-label="Sort direction">
          <option value="desc">High → low</option>
          <option value="asc">Low → high</option>
        </Select>
        <Button type="submit" variant="primary">Apply</Button>
        <span className="ml-auto text-[12.5px] text-ink-3">
          {fmtInt(total)} affiliates · {fmtInt(withoutPhone)} without a WhatsApp number
        </span>
      </form>

      <Card>
        {items.length === 0 ? (
          <EmptyState
            icon={<Users className="size-5" />}
            title="No affiliates found"
            description={total === 0 && !q && !noPhone && scope === "active" ? "Upload the Affiliate orders and All orders files in the Data hub, or choose a wider date range." : "Try a different search or filter."}
          />
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[1140px]">
              <div className={cn("grid items-center gap-x-3 border-b border-line bg-surface-2 px-5 py-2.5", AFFILIATE_COLS, th)}>
                {sortLink("name", "Affiliate")}
                <span>WhatsApp</span>
                {sortLink("samples", "Samples received")}
                {sortLink("orders", "Orders", true)}
                {sortLink("gmv", "GMV", true)}
                <span className="text-right">{sortLink("video", "Video", true)} / {sortLink("live", "LIVE", true)}</span>
                {sortLink("fromsamples", "From samples", true)}
                <span>Recommended action</span>
                <span />
              </div>
              <ul>
                {items.map((a) => {
                  const names = [...new Set(a.lines.map((l) => l.name ?? l.variation ?? l.sku ?? ""))].filter(Boolean);
                  return (
                    <AffiliateRow
                      key={a.username}
                      name={a.username}
                      head={
                        <>
                          <div className="flex min-w-0 items-center gap-2.5">
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[12px] font-semibold text-ink-2">{initials(a.username)}</span>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <Link href={`/creators/${encodeURIComponent(a.username)}`} className="truncate text-[14px] font-medium text-ink hover:text-brand hover:underline">{a.username}</Link>
                                <a href={`https://www.tiktok.com/@${a.username}`} target="_blank" rel="noopener noreferrer" aria-label={`TikTok profile of ${a.username}`} className="shrink-0 text-ink-3 hover:text-brand">
                                  <ExternalLink className="size-3.5" />
                                </a>
                              </div>
                              <div className="mt-0.5 flex flex-wrap items-center gap-1">
                                {a.type && <Badge tone={a.type === "live" ? "brand" : a.type === "both" ? "good" : "neutral"} className="text-[11px]">{CONTENT_TYPE_LABEL[a.type]}</Badge>}
                                {a.doNotContact && <Badge tone="critical" className="text-[11px]">Do not contact</Badge>}
                              </div>
                            </div>
                          </div>
                          <div><PhoneEditor username={a.username} phone={a.phone} canEdit={canEdit} /></div>
                          <div className="min-w-0 text-[13px]">
                            {a.samples === 0 ? (
                              <span className="text-ink-3">None</span>
                            ) : (
                              <>
                                <p className="font-medium text-ink">{a.samples} sample{a.samples === 1 ? "" : "s"}{a.sampleQty !== a.samples ? ` (${a.sampleQty} items)` : ""}</p>
                                <p className="line-clamp-2 text-[12px] text-ink-3" title={names.join(", ")}>{names.slice(0, 2).join(", ")}{names.length > 2 ? ` +${names.length - 2} more` : ""}</p>
                              </>
                            )}
                          </div>
                          <div className="tnum text-right text-[13.5px]">{fmtInt(a.orders)}</div>
                          <div className="tnum text-right text-[13.5px] font-medium">{a.gmv ? fmtRM(a.gmv) : "–"}</div>
                          <div className="tnum text-right text-[12.5px] text-ink-2">{a.videoGmv ? fmtRM(a.videoGmv) : "–"} / {a.liveGmv ? fmtRM(a.liveGmv) : "–"}</div>
                          <div className={cn("tnum text-right text-[13.5px]", a.fromSamplesGmv > 0 && "font-medium text-good")}>{a.samples ? (a.fromSamplesGmv ? fmtRM(a.fromSamplesGmv) : "RM 0") : "–"}</div>
                          <div className="min-w-0">
                            {a.action ? (
                              <>
                                <Badge tone={a.action.tone}>{a.action.label}</Badge>
                                {a.suggest.length > 0 && a.samples > 0 && <p className="mt-1 line-clamp-1 text-[11.5px] text-ink-3" title={`Samples to offer: ${a.suggest.join(", ")}`}>Offer: {a.suggest.join(", ")}</p>}
                              </>
                            ) : a.suggest.length > 0 && (a.gmv > 0 || a.samples > 0) ? (
                              <p className="line-clamp-2 text-[12.5px] text-ink-2" title="Not received or sold in the loaded data">Offer a sample: {a.suggest.join(", ")}</p>
                            ) : (
                              <span className="text-[12.5px] text-ink-3">–</span>
                            )}
                          </div>
                        </>
                      }
                    >
                      <AffiliateDetail a={a} range={pp.range} />
                    </AffiliateRow>
                  );
                })}
              </ul>
            </div>
          </div>
        )}
        <Pagination page={cur} pages={pages} total={total} pageSize={PAGE_SIZE} hrefFor={(p) => href("/affiliates", { ...filters, page: p })} />
      </Card>
      <p className="mt-3 text-[12.5px] leading-relaxed text-ink-3">
        GMV counts valid orders only (cancelled and returned orders are excluded). “From samples” is the sales of the sampled products made by content posted after the sample arrived;
        sizes of one product are counted once. “Samples to offer” are top sellers she has neither received nor sold in the data loaded above, so load older months to make this more reliable.
        The Excel export has three sheets: affiliates, sales by SKU and samples.
      </p>
    </div>
  );
}
