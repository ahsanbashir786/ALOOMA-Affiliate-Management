import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDown, ArrowUp, Download, ExternalLink, Users } from "lucide-react";
import { mayEditContacts, requireUser } from "@/lib/auth";
import { AFFILIATE_SORTS, loadAffiliates, queryAffiliates, type AffiliateScope, type AffiliateSort, type SalesSource } from "@/lib/affiliates/service";
import { CONTENT_TYPE_LABEL } from "@/lib/samples/analysis";
import { sampleRange } from "@/lib/samples/range";
import { href, one, periodParams, type SP } from "@/lib/url";
import { Badge, Button, buttonClasses, Card, EmptyState, Input, PageHeader, Select } from "@/components/ui/primitives";
import { Pagination } from "@/components/ui/pagination";
import { PhoneEditor } from "@/components/samples/phone-editor";
import { AffiliateRow } from "@/components/affiliates/affiliate-row";
import { AFFILIATE_COLS, SAMPLE_SUBCOLS } from "@/components/affiliates/cols";
import { AffiliateDetail } from "@/components/affiliates/affiliate-detail";
import { DataSources } from "@/components/affiliates/data-sources";
import { cn, fmtInt, fmtRM, fmtRMCompact } from "@/lib/utils";

export const metadata: Metadata = { title: "Affiliates Overview" };

const PAGE_SIZE = 25;

const SOURCE: Record<Exclude<SalesSource, null>, { label: string; cls: string }> = {
  video: { label: "Video", cls: "bg-surface-2 text-ink-2" },
  live: { label: "LIVE", cls: "bg-brand-soft text-brand-strong" },
  both: { label: "Both", cls: "bg-good-soft text-good" },
};

export default async function AffiliatesPage({ searchParams }: PageProps<"/affiliates/analysis">) {
  const user = await requireUser();
  const sp = (await searchParams) as SP;
  const canPhone = mayEditContacts(user);
  const pp = periodParams(sp);
  const { period, range } = await sampleRange(sp);

  const q = (one(sp.q) ?? "").trim();
  const scope: AffiliateScope = one(sp.scope) === "everyone" ? "everyone" : "active";
  const noPhone = one(sp.nophone) === "1";
  const sort: AffiliateSort = (one(sp.sort) as AffiliateSort) in AFFILIATE_SORTS ? (one(sp.sort) as AffiliateSort) : "gmv";
  const dir = one(sp.dir) === "asc" || one(sp.dir) === "desc" ? (one(sp.dir) as "asc" | "desc") : AFFILIATE_SORTS[sort].dir;
  const page = Math.max(1, Number(one(sp.page)) || 1);

  const filter = { q, scope, noPhone, range };
  const first = await loadAffiliates(filter, sort, dir, period, PAGE_SIZE, (page - 1) * PAGE_SIZE);
  const total = first.total;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const cur = Math.min(page, pages);
  const { items } = cur !== page && total > 0 ? await loadAffiliates(filter, sort, dir, period, PAGE_SIZE, (cur - 1) * PAGE_SIZE) : first;
  // WhatsApp coverage of everyone in scope, whatever the search or filter is
  const cover = q || noPhone ? await queryAffiliates({ scope, range }, "gmv", "desc", 1, 0) : { total, withoutPhone: first.withoutPhone };

  const isDefault = sort === "gmv" && dir === AFFILIATE_SORTS.gmv.dir;
  const filters = { ...pp, q: q || undefined, scope: scope === "everyone" ? "everyone" : undefined, nophone: noPhone ? "1" : undefined, sort: isDefault ? undefined : sort, dir: isDefault ? undefined : dir };
  const sortHref = (k: AffiliateSort) =>
    href("/affiliates/analysis", { ...filters, sort: k, dir: sort === k ? (dir === "desc" ? "asc" : "desc") : AFFILIATE_SORTS[k].dir, page: undefined });
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
        title="Affiliate analysis"
        actions={
          <a href={exportHref} className={buttonClasses({ variant: "secondary" })}>
            <Download className="size-4" /> Export to Excel
          </a>
        }
      />
      <DataSources role={user.role} everyone={scope === "everyone"} withPhone={cover.total - cover.withoutPhone} total={cover.total} />

      <form action="/affiliates/analysis" className="mb-4 flex flex-wrap items-center gap-2.5 rounded-xl border border-line bg-surface p-3 shadow-card">
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
        <span className="ml-auto text-[12.5px] text-ink-3">{fmtInt(total)} affiliates</span>
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
            <div className="min-w-[1170px]">
              <div className={cn("grid items-end gap-x-3 border-b border-line bg-surface-2 px-5 py-2.5", AFFILIATE_COLS, th)}>
                {sortLink("name", "Affiliate")}
                <span>WhatsApp</span>
                <div>
                  <div>{sortLink("samples", "Samples received")}</div>
                  <div className={cn("mt-1 grid gap-x-2 text-[10.5px] font-normal normal-case", SAMPLE_SUBCOLS)}>
                    <span>SKU × qty</span><span className="text-right">Orders</span><span className="text-right">GMV</span><span>Source</span>
                  </div>
                </div>
                <span className="text-right">{sortLink("gmv", "Total GMV", true)}</span>
                <span>Segment</span>
                <span>Action to take</span>
                <span />
              </div>
              <ul>
                {items.map((a) => (
                  <AffiliateRow
                    key={a.username}
                    name={a.username}
                    head={
                      <>
                        <div className="min-w-0 self-start">
                          <div className="flex items-center gap-1.5">
                            <Link href={`/creators/${encodeURIComponent(a.username)}`} className="truncate text-[14px] font-medium text-ink hover:text-brand hover:underline">{a.username}</Link>
                            <a href={`https://www.tiktok.com/@${a.username}`} target="_blank" rel="noopener noreferrer" aria-label={`TikTok profile of ${a.username}`} className="shrink-0 text-ink-3 hover:text-brand">
                              <ExternalLink className="size-3.5" />
                            </a>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-1">
                            {a.type && <Badge tone={a.type === "live" ? "brand" : a.type === "both" ? "good" : "neutral"} className="text-[11px]">{CONTENT_TYPE_LABEL[a.type]}</Badge>}
                            {a.doNotContact && <Badge tone="critical" className="text-[11px]">Do not contact</Badge>}
                          </div>
                        </div>
                        <div className="self-start pt-0.5"><PhoneEditor username={a.username} phone={a.phone} canEdit={canPhone} /></div>
                        <div className="min-w-0 self-start text-[12.5px]">
                          {a.sampleSkus.length === 0 ? (
                            <span className="text-ink-3">None</span>
                          ) : (
                            <>
                              <ul className="divide-y divide-line/70">
                                {a.sampleSkus.map((sk) => (
                                  <li key={sk.key} className={cn("grid items-start gap-x-2 py-1.5 first:pt-0", SAMPLE_SUBCOLS)}>
                                    <div className="min-w-0">
                                      <p className="truncate font-medium text-ink" title={sk.name}>
                                        {sk.name} <span className="tnum font-normal text-ink-3">×{sk.qty}</span>
                                      </p>
                                      <p className="truncate text-[11px] text-ink-3" title={`${sk.sku}${sk.parts.length ? " – " + sk.parts.map((p) => `${p.qty}× ${p.name}`).join(", ") : ""}`}>
                                        {sk.sku}{sk.parts.length ? ` · bundle: ${sk.parts.map((p) => `${p.qty}× ${p.name}`).join(", ")}` : ""}
                                      </p>
                                      {(sk.afterGmv > 0 || sk.afterOrders > 0) && (
                                        <p className="tnum text-[11px] text-good">after sample: {fmtRM(sk.afterGmv)} · {sk.afterOrders} order{sk.afterOrders === 1 ? "" : "s"}</p>
                                      )}
                                    </div>
                                    <span className="tnum text-right">{sk.orders || "–"}</span>
                                    <span className="tnum text-right font-medium">{sk.gmv ? fmtRM(sk.gmv) : "–"}</span>
                                    <span>
                                      {sk.source ? (
                                        <span className={cn("rounded-full px-1.5 py-0.5 text-[10.5px] font-medium", SOURCE[sk.source].cls)}>{SOURCE[sk.source].label}</span>
                                      ) : (
                                        <span className="text-[11px] text-ink-3" title="No sales of this SKU yet">–</span>
                                      )}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                              {a.fromSamplesGmv > 0 && (
                                <p className="tnum mt-1.5 border-t border-line pt-1.5 text-[11.5px] font-medium text-good">
                                  GMV from sample content: {fmtRM(a.fromSamplesGmv)} · {fmtInt(a.fromSamplesOrders)} orders
                                </p>
                              )}
                            </>
                          )}
                        </div>
                        <div className="tnum self-start text-right">
                          <p className="text-[14px] font-semibold text-ink">{a.gmv ? fmtRM(a.gmv) : "–"}</p>
                          {a.gmv > 0 && (
                            <p className="text-[11px] text-ink-3">
                              Video {a.videoGmv ? fmtRMCompact(a.videoGmv) : "–"} · LIVE {a.liveGmv ? fmtRMCompact(a.liveGmv) : "–"}
                            </p>
                          )}
                          {a.orders > 0 && <p className="text-[11px] text-ink-3">{fmtInt(a.orders)} orders</p>}
                        </div>
                        <div className="min-w-0 self-start">
                          {a.segment ? (
                            <>
                              <Badge tone={a.segment.tone} className="rounded-lg text-left whitespace-normal">{a.segment.label}</Badge>
                              <p className="mt-1 line-clamp-2 text-[11px] text-ink-3" title={a.segment.reason}>{a.segment.reason}</p>
                            </>
                          ) : (
                            <span className="text-[12.5px] text-ink-3">–</span>
                          )}
                        </div>
                        <div className="min-w-0 self-start">
                          {a.action ? (
                            <>
                              {a.action.source === "samples" && <Badge tone={a.action.tone} className="rounded-lg text-left whitespace-normal">{a.action.label}</Badge>}
                              <p className={cn("line-clamp-3 text-[12.5px] text-ink", a.action.source === "samples" && "mt-1")} title={a.action.text}>{a.action.text}</p>
                            </>
                          ) : (
                            <span className="text-[12.5px] text-ink-3">–</span>
                          )}
                          {a.suggest.length > 0 && (a.gmv > 0 || a.samples > 0) && (
                            <p className="mt-1 line-clamp-2 text-[11.5px] text-ink-3" title="Not received or sold in the loaded data">Offer a sample: {a.suggest.join(", ")}</p>
                          )}
                        </div>
                      </>
                    }
                  >
                    <AffiliateDetail a={a} range={pp.range} />
                  </AffiliateRow>
                ))}
              </ul>
            </div>
          </div>
        )}
        <Pagination page={cur} pages={pages} total={total} pageSize={PAGE_SIZE} hrefFor={(p) => href("/affiliates/analysis", { ...filters, page: p })} />
      </Card>
    </div>
  );
}
