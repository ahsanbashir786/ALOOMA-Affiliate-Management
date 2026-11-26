"use client";

import { useState, useTransition } from "react";
import { ExternalLink, Search, Sparkles, Star } from "lucide-react";
import { findCreators } from "@/app/actions/outreach";
import { Button } from "@/components/ui/primitives";
import { cn, fmtCompact } from "@/lib/utils";
import { PAGE_SIZES, pageWindow } from "@/lib/paging";

export type Found = {
  id: string | null; username: string | null; nickname: string | null; followers: number | null; gmv: number | null; units: number | null; category: string | null;
  avgVideoViews: number | null; avgLiveViewers: number | null; region: string | null; avatar: string | null; level?: number | null; categoryIds?: string[];
  gmvRange?: string | null; unitsRange?: string | null; audience?: string | null; officialRecommend?: boolean | null; risingStar?: boolean | null; fastGrowing?: boolean | null;
  verdict: { status: "eligible" | "not" | "unknown"; reasons: string[]; good: string[]; fit: number | null };
};
const GMV = [{ key: "GMV_RANGE_100_1000", label: "RM 100 – 1,000" }, { key: "GMV_RANGE_1000_10000", label: "RM 1,000 – 10,000" }, { key: "GMV_RANGE_10000_AND_ABOVE", label: "RM 10,000+" }];

/** TikTok's picture, shown as it is (it comes from TikTok's own picture server, so Next's image optimiser is not used). */
function Pic({ url, name }: { url: string | null; name: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img src={url} alt="" className="size-11 shrink-0 rounded-full bg-surface-2 object-cover" referrerPolicy="no-referrer" /> : <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[12px] font-semibold text-ink-3">{name.slice(0, 2).toUpperCase()}</span>;
}
const money = (c: Found) => (c.gmv != null ? `RM${fmtCompact(c.gmv)}` : c.gmvRange ?? "–");
const units = (c: Found) => (c.units != null ? fmtCompact(c.units) : c.unitsRange ?? "–");

function Rows({ rows, catNames }: { rows: Found[]; catNames: Record<string, string> }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-[13px]" data-testid="tiktok-creators">
        <thead className="text-[12px] text-ink-3"><tr className="border-y border-line bg-surface-2/50">
          <th className="px-5 py-2 font-medium">Creator</th><th className="px-3 font-medium text-right">Sales (30 Days)</th><th className="px-3 font-medium text-right">Items Sold</th><th className="px-3 font-medium text-right">Avg. Video Views</th><th className="px-3 font-medium text-right">Avg. LIVE Viewers</th><th className="px-5 font-medium" />
        </tr></thead>
        <tbody>
          {rows.map((c, i) => {
            const name = c.username ?? c.nickname ?? "?";
            const cats = (c.categoryIds ?? []).map((id) => catNames[id]).filter(Boolean);
            return (
              <tr key={c.id ?? `${name}-${i}`} className="border-b border-line align-top last:border-b-0" data-testid="tiktok-row">
                <td className="px-5 py-3">
                  <div className="flex items-start gap-3">
                    <Pic url={c.avatar} name={name} />
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-1.5">
                        <span className="font-semibold text-ink">{c.username ?? c.nickname ?? "Name not shared"}</span>
                        {c.level != null && <span className={cn("inline-flex items-center gap-0.5 rounded-full px-1.5 py-px text-[11px] font-semibold", c.level >= 5 ? "bg-good-soft text-good" : "bg-surface-2 text-ink-3")}><Star className="size-3" />Lv. {c.level}</span>}
                        {c.verdict.status === "eligible" && <span className="rounded-full bg-brand-soft px-1.5 py-px text-[11px] font-semibold text-brand" title={c.verdict.good.join(" · ")}>Meets Criteria</span>}
                      </p>
                      {c.username && c.nickname && <p className="text-[12px] text-ink-3">{c.nickname}</p>}
                      <p className="mt-0.5 text-[12px] text-ink-2">{cats.length ? `${cats[0]}${cats.length > 1 ? `, +${cats.length - 1}` : ""}` : c.category ?? ""}</p>
                      <p className="text-[12px] text-ink-3">{[c.followers != null ? fmtCompact(c.followers) : null, c.audience].filter(Boolean).join(", ")}</p>
                      <p className="mt-1 flex flex-wrap gap-1">
                        {c.officialRecommend && <span className="rounded bg-surface-2 px-1.5 text-[11px] text-ink-2">TikTok Recommends</span>}
                        {c.risingStar && <span className="rounded bg-surface-2 px-1.5 text-[11px] text-ink-2">Rising Star</span>}
                        {c.fastGrowing && <span className="rounded bg-surface-2 px-1.5 text-[11px] text-ink-2">Fast Growing</span>}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="tnum px-3 py-3 text-right font-semibold text-ink">{money(c)}</td>
                <td className="tnum px-3 py-3 text-right text-ink">{units(c)}</td>
                <td className="tnum px-3 py-3 text-right text-ink">{c.avgVideoViews != null ? fmtCompact(c.avgVideoViews) : "–"}</td>
                <td className="tnum px-3 py-3 text-right text-ink">{c.avgLiveViewers != null ? fmtCompact(c.avgLiveViewers) : "–"}</td>
                <td className="px-5 py-3 text-right whitespace-nowrap">
                  <a href="https://affiliate.tiktok.com/connection/creator?shop_region=MY" target="_blank" rel="noreferrer" className="inline-flex h-8 items-center rounded-lg bg-brand px-3 text-[12.5px] font-semibold text-white hover:bg-brand-strong" title="Opens TikTok's Find Creators, where you send the invitation">Invite</a>
                  {c.username && <a href={`https://www.tiktok.com/@${c.username}`} target="_blank" rel="noreferrer" aria-label="Open on TikTok" className="ml-1.5 inline-flex size-8 items-center justify-center rounded-lg border border-line text-ink-3 hover:text-brand"><ExternalLink className="size-3.5" /></a>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** TikTok's recommended creators in your categories, already filtered by your criteria, in pages. A search is there too, folded away. */
export function FindCreators({ initial, catNames = {}, hidden: h0 = 0 }: { initial: Found[]; fieldsSeen?: string[]; hidden?: number; catNames?: Record<string, string> }) {
  const [rows, setRows] = useState<Found[]>(initial);
  const [hidden, setHidden] = useState(h0);
  const [showAll, setShowAll] = useState(false);
  const [kw, setKw] = useState("");
  const [gmv, setGmv] = useState<string[]>([]);
  const [err, setErr] = useState("");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState<number | "all">(10);
  const [pending, start] = useTransition();
  const run = () => start(async () => { const r = await findCreators(kw, gmv); if (r.ok) { setRows(r.creators); setHidden(r.hidden); setErr(""); setPage(1); } else setErr(r.error); });
  // Only creators who fit your rules; "not sure" (TikTok shows no level) can be added with one click.
  const shown = rows.filter((r) => r.verdict.status === "eligible" || (showAll && r.verdict.status === "unknown"));
  const unsure = rows.filter((r) => r.verdict.status === "unknown").length;
  const per = size === "all" ? Math.max(1, shown.length) : size, pages = Math.max(1, Math.ceil(shown.length / per)), p = Math.min(page, pages);
  return (
    <div>
      {shown.length === 0 ? (
        <p className="px-5 py-10 text-center text-[13.5px] text-ink-3" data-testid="tiktok-empty"><Sparkles className="mx-auto mb-2 size-5 text-brand" />No creator in TikTok&apos;s list meets your criteria yet.{unsure ? " Show the ones TikTok gives no level for below." : ""}</p>
      ) : <Rows rows={shown.slice((p - 1) * per, p * per)} catNames={catNames} />}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3 text-[12.5px] text-ink-3">
        <span>
          {shown.length} meet your criteria{unsure > 0 && <> · <button type="button" onClick={() => { setShowAll((v) => !v); setPage(1); }} className="font-semibold text-brand hover:underline" data-testid="show-unsure">{showAll ? "Hide" : "Show"} {unsure} without a level</button></>}{hidden > 0 && ` · ${hidden} left out (outside your criteria)`}
        </span>
        <span className="flex items-center gap-1" data-testid="tiktok-pager">
          {pages > 1 && pageWindow(p, pages).map((n, i) => n == null ? <span key={`d${i}`} className="px-1">…</span> : <button key={n} type="button" onClick={() => setPage(n)} className={cn("tnum h-7 min-w-7 rounded-lg px-1.5", n === p ? "border border-brand font-semibold text-brand" : "hover:bg-surface-2")}>{n}</button>)}
          <select aria-label="Creators per page" value={String(size)} onChange={(e) => { setSize(e.target.value === "all" ? "all" : Number(e.target.value)); setPage(1); }} className="ml-1 h-7 rounded-lg border border-line-strong bg-surface px-1.5 text-[12.5px]">
            {PAGE_SIZES.map((s) => <option key={s} value={s}>{s}/page</option>)}<option value="all">All</option>
          </select>
        </span>
      </div>
      <details className="border-t border-line">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 px-5 py-2.5 text-[12.5px] font-medium text-ink-3 hover:text-brand [&::-webkit-details-marker]:hidden"><Search className="size-3.5" />Look up a creator on TikTok</summary>
        <form className="flex flex-wrap items-center gap-2 px-5 pb-3" onSubmit={(e) => { e.preventDefault(); run(); }}>
          <input value={kw} onChange={(e) => setKw(e.target.value)} placeholder="Keyword or username" aria-label="Keyword" className="h-9 w-56 rounded-lg border border-line bg-surface px-3 text-[13.5px]" />
          {GMV.map((g) => <button key={g.key} type="button" aria-pressed={gmv.includes(g.key)} onClick={() => setGmv((c) => (c.includes(g.key) ? c.filter((x) => x !== g.key) : [...c, g.key]))} className={`h-8 rounded-full border px-3 text-[13px] ${gmv.includes(g.key) ? "border-brand/40 bg-brand-soft text-brand" : "border-line text-ink-2 hover:bg-surface-2"}`}>{g.label}</button>)}
          <Button type="submit" size="sm" disabled={pending}>{pending ? "Searching…" : "Search"}</Button>
          {err && <span className="text-[12.5px] text-ink-3" data-testid="tiktok-error">{err}</span>}
        </form>
      </details>
    </div>
  );
}
