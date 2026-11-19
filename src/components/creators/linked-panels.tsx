"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, Loader2, X } from "lucide-react";
import { Badge } from "@/components/ui/primitives";
import { href } from "@/lib/url";
import { fmtRM } from "@/lib/utils";
import { useCreatorPanel } from "./panel-context";
import type { CreatorLinks, ProductCard, VideoMini } from "@/lib/affiliate/links";

function useLoad<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(url, { cache: "no-store" }).then((r) => (r.ok ? (r.json() as Promise<T>) : Promise.reject(new Error("Could not load this."))))
      .then((d) => alive && setData(d)).catch((e) => alive && setError(e instanceof Error ? e.message : "Could not load this."));
    return () => { alive = false; };
  }, [url]);
  return { data, error };
}

function Shell({ title, sub, label, testId, onClose, children }: { title: string; sub?: React.ReactNode; label: string; testId: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={label}>
      <button className="absolute inset-0 bg-black/40" aria-label="Close panel" onClick={onClose} />
      <aside className="relative flex h-full w-full flex-col overflow-y-auto bg-surface shadow-xl sm:w-[480px]" data-testid={testId}>
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-line bg-surface px-5 py-4">
          <div className="min-w-0"><h2 className="text-[19px] leading-snug font-semibold text-ink">{title}</h2>{sub && <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[14px] text-ink-2">{sub}</p>}</div>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-ink-3 hover:bg-surface-2"><X className="size-5" /></button>
        </div>
        {children}
      </aside>
    </div>
  );
}

const Block = ({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) => (
  <section className="border-t border-line px-5 py-4"><h3 className="mb-2 text-[15px] font-semibold text-ink">{title}{count != null && <span className="ml-2 text-[13px] font-normal text-ink-3">{count}</span>}</h3>{children}</section>
);
const pill = "inline-flex items-center rounded-full border border-line px-2.5 py-0.5 text-[13px] font-medium text-ink-2 hover:bg-surface-2";
const change = (now: number, prev: number) => (prev > 0 ? `${now >= prev ? "▲" : "▼"} ${Math.abs(Math.round(((now - prev) / prev) * 100))}%` : now > 0 ? "▲ new" : "");

function VideoList({ videos, hideCreator, hideProduct }: { videos: VideoMini[]; hideCreator?: boolean; hideProduct?: boolean }) {
  const { open, openProduct, openVideo } = useCreatorPanel();
  if (!videos.length) return <p className="text-[13.5px] text-ink-3">No videos with recent sales.</p>;
  return (
    <ul className="divide-y divide-line">
      {videos.map((v) => (
        <li key={v.id} className="py-2.5">
          <button type="button" onClick={() => openVideo(v.id)} className="line-clamp-2 text-left text-[13.5px] font-medium text-ink hover:text-brand" title={v.title ?? ""}>{v.title || "Untitled video"}</button>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12.5px] text-ink-3">
            {!hideCreator && v.creator && <button type="button" onClick={() => open(v.creator!)} className="font-semibold text-brand hover:underline">@{v.creator}</button>}
            {!hideProduct && v.pk && <button type="button" onClick={() => openProduct(v.pk!)} className="hover:text-brand hover:underline">{v.product}</button>}
            <span className="tnum">{fmtRM(v.s28)} in 28 days</span><span>{v.cls}</span>
          </p>
        </li>
      ))}
    </ul>
  );
}

export function ProductPanel({ pkey, onClose }: { pkey: string; onClose: () => void }) {
  const { data, error } = useLoad<ProductCard>(`/api/affiliate/product/${encodeURIComponent(pkey)}`);
  const { open } = useCreatorPanel();
  return (
    <Shell title={data?.name ?? "Product"} label="Product" testId="product-panel" onClose={onClose}
      sub={data && <><Badge tone={data.tag === "Growing" ? "good" : data.tag === "Slipping" ? "warn" : data.tag === "Dying" ? "critical" : "neutral"}>{data.tag}</Badge>{data.fragile != null && <span>{data.fragile ? "Fragile" : "Healthy"}</span>}</>}>
      {!data && !error && <p className="flex items-center gap-2 px-5 py-8 text-[14px] text-ink-3"><Loader2 className="size-4 animate-spin" /> Loading…</p>}
      {error && <p className="px-5 py-8 text-[14px] text-critical">{error}</p>}
      {data && (
        <>
          <dl className="mx-5 mt-4 mb-4 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl bg-surface-2 p-3"><dt className="text-[12.5px] text-ink-3">Sales</dt><dd className="tnum text-[17px] font-semibold text-ink">{fmtRM(data.sales.now)}</dd><dd className="text-[12px] text-ink-3">{change(data.sales.now, data.sales.prev)}</dd></div>
            <div className="rounded-xl bg-surface-2 p-3"><dt className="text-[12.5px] text-ink-3">Creators</dt><dd className="tnum text-[17px] font-semibold text-ink">{data.creators}</dd></div>
            <div className="rounded-xl bg-surface-2 p-3"><dt className="text-[12.5px] text-ink-3">New Videos</dt><dd className="tnum text-[17px] font-semibold text-ink">{data.videos ?? "–"}</dd></div>
          </dl>
          <Block title="Top Creators" count={data.topCreators.length}>
            {data.topCreators.length === 0 ? <p className="text-[13.5px] text-ink-3">Nobody sold it in the last 28 days.</p> : (
              <ul className="divide-y divide-line">{data.topCreators.map((c) => (
                <li key={c.username} className="flex items-center justify-between gap-3 py-2"><button type="button" onClick={() => open(c.username)} className="font-semibold text-brand hover:underline">@{c.username}</button><span className="tnum text-[13px] text-ink-2">{fmtRM(c.gmv28)} <span className="text-ink-3">{change(c.gmv28, c.prev28)}</span></span></li>
              ))}</ul>
            )}
          </Block>
          <Block title="Top Videos" count={data.topVideos.length}><VideoList videos={data.topVideos} hideProduct /></Block>
          <div className="flex flex-wrap gap-2 border-t border-line px-5 py-4">
            <Link href={href("/creators", { product: data.key })} className={pill}>All Its Creators</Link>
            <Link href={href("/affiliate/content", { product: data.key })} className={pill}>All Its Videos</Link>
            <Link href={href("/affiliate/actions", { product: data.key })} className={pill}>Actions For This Product</Link>
            <Link href={`/products/${data.key}`} className={pill}>Full Analysis</Link>
          </div>
        </>
      )}
    </Shell>
  );
}

export function VideoPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, error } = useLoad<VideoMini>(`/api/affiliate/video/${encodeURIComponent(id)}`);
  const { open, openProduct } = useCreatorPanel();
  return (
    <Shell title={data?.title || "Video"} label="Video" testId="video-panel" onClose={onClose} sub={data && <><Badge tone={data.cls === "Heating Up" ? "good" : data.cls === "Fading" || data.cls === "Stopped Selling" ? "warn" : "neutral"}>{data.cls}</Badge>{data.ads && <span>{data.ads}</span>}</>}>
      {!data && !error && <p className="flex items-center gap-2 px-5 py-8 text-[14px] text-ink-3"><Loader2 className="size-4 animate-spin" /> Loading…</p>}
      {error && <p className="px-5 py-8 text-[14px] text-critical">{error}</p>}
      {data && (
        <>
          <dl className="mx-5 mt-4 mb-4 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl bg-surface-2 p-3"><dt className="text-[12.5px] text-ink-3">Last 14 Days</dt><dd className="tnum text-[17px] font-semibold text-ink">{fmtRM(data.s14)}</dd><dd className="text-[12px] text-ink-3">{change(data.s14, data.p14)}</dd></div>
            <div className="rounded-xl bg-surface-2 p-3"><dt className="text-[12.5px] text-ink-3">Before</dt><dd className="tnum text-[17px] font-semibold text-ink">{fmtRM(data.p14)}</dd></div>
            <div className="rounded-xl bg-surface-2 p-3"><dt className="text-[12.5px] text-ink-3">All Time</dt><dd className="tnum text-[17px] font-semibold text-ink">{fmtRM(data.total)}</dd></div>
          </dl>
          <Block title="Made By">{data.creator ? <button type="button" onClick={() => open(data.creator!)} className="font-semibold text-brand hover:underline">@{data.creator}</button> : <span className="text-[13.5px] text-ink-3">Unknown creator</span>}{data.postedOn && <span className="ml-3 text-[13px] text-ink-3">posted {data.postedOn}{data.ageDays != null ? ` (${data.ageDays} days)` : ""}</span>}</Block>
          <Block title="Sells">{data.pk ? <button type="button" onClick={() => openProduct(data.pk!)} className="font-semibold text-brand hover:underline">{data.product}</button> : <span className="text-[13.5px] text-ink-3">–</span>}</Block>
          {data.creator && <div className="flex flex-wrap gap-2 border-t border-line px-5 py-4"><a className={pill} href={`https://www.tiktok.com/@${data.creator}/video/${data.id}`} target="_blank" rel="noreferrer">Open On TikTok <ExternalLink className="ml-1 size-3" /></a></div>}
        </>
      )}
    </Shell>
  );
}

/** Inside the creator panel: the products they sold and their best videos, each one opens the same panel. */
export function CreatorLinksSection({ username }: { username: string }) {
  const { data } = useLoad<CreatorLinks>(`/api/affiliate/creator/${encodeURIComponent(username)}`);
  const { openProduct } = useCreatorPanel();
  if (!data || (!data.products.length && !data.videos.length)) return null;
  return (
    <div data-testid="creator-links">
      {data.products.length > 0 && <Block title="Products" count={data.products.length}><ul className="divide-y divide-line">{data.products.map((p) => <li key={p.pid} className="flex items-center justify-between gap-3 py-2"><button type="button" onClick={() => openProduct(p.pid)} className="text-left text-[13.5px] font-medium text-ink hover:text-brand">{p.name}</button><span className="tnum text-[13px] text-ink-2">{fmtRM(p.gmv28)} <span className="text-ink-3">in 28 days</span></span></li>)}</ul></Block>}
      {data.videos.length > 0 && <Block title="Best Videos" count={data.videos.length}><VideoList videos={data.videos} hideCreator /></Block>}
    </div>
  );
}
