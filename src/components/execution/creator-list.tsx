"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, Download, ExternalLink, Loader2, MessageCircle, Search } from "lucide-react";
import { exportTaskCreators, getTaskCreators, setCreatorsContacted } from "@/app/actions/execution";
import { CopyButton } from "@/components/ui/copy-button";
import { fillMessage, MESSAGES, videoText } from "@/lib/execution/rules";
import type { CreatorItem } from "@/lib/execution/plan";
import { fmtDateTimeKL } from "@/lib/time";
import { cn, fmtRM } from "@/lib/utils";
import { Person } from "./ui";

type Filter = "all" | "todo" | "done";
const PAGE = 50;

/** Every creator an action is about: search, tick off who was contacted, see their videos, message them. */
export function CreatorList({ taskId, kind, product, canEdit, closed, total, contacted, onContacted, lang }: {
  taskId: string; kind: string; product: string; canEdit: boolean; closed: boolean; total: number; contacted: number; onContacted: (n: number) => void; lang: "ms" | "en";
}) {
  const [items, setItems] = useState<CreatorItem[]>([]);
  const [count, setCount] = useState(total);
  const [done, setDone] = useState(contacted);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const tpl = MESSAGES[kind];

  const load = useCallback(async (offset: number, reset: boolean, query: string, f: Filter) => {
    const mine = ++seq.current;
    setLoading(true);
    const r = await getTaskCreators(taskId, offset, query, f);
    if (mine !== seq.current) return;
    setLoading(false);
    if ("error" in r) { setError(r.error); return; }
    setError(null);
    setItems((cur) => (reset ? r.items : [...cur, ...r.items]));
    setCount(r.total); setDone(r.contacted);
  }, [taskId]);

  useEffect(() => {
    const t = setTimeout(() => { void load(0, true, q, filter); }, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [q, filter, load]);

  const tick = async (names: string[], on: boolean) => {
    setItems((cur) => cur.map((c) => (names.includes(c.name) ? { ...c, contactedAt: on ? new Date().toISOString() : null, contactedBy: on ? "You" : null } : c)));
    const r = await setCreatorsContacted(taskId, names, on);
    if (r.error) { setError(r.error); void load(0, true, q, filter); return; }
    if (r.contacted != null) { setDone(r.contacted); onContacted(r.contacted); }
  };
  const download = async () => {
    const r = await exportTaskCreators(taskId);
    if ("error" in r) { setError(r.error); return; }
    const url = URL.createObjectURL(new Blob(["﻿" + r.csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = r.name; a.click(); URL.revokeObjectURL(url);
  };

  const pct = total ? Math.round((done / total) * 100) : 0;
  const shown = items.length;
  const msgFor = (c: CreatorItem) => (tpl ? fillMessage(tpl[lang], c.name, product, c.data, lang) : "");

  return (
    <div data-testid="creator-list">
      <div className="mb-3 flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-baseline justify-between text-[13px]"><span className="text-ink-2"><b className="tnum font-semibold text-ink" data-testid="contacted-count">{done}</b> of {total} contacted</span><span className="tnum text-ink-3">{pct}%</span></div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-good transition-all" style={{ width: `${pct}%` }} /></div>
        </div>
        <button onClick={download} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-line-strong px-2.5 text-[13px] font-medium text-ink-2 hover:bg-surface-2" title="Download everyone in this action as a spreadsheet"><Download className="size-4" />CSV</button>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-3" />
          <input data-testid="creator-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${total} creators`} className="h-8 w-full rounded-lg border border-line-strong bg-surface pr-3 pl-8 text-[13.5px] placeholder:text-ink-3" />
        </div>
        <div className="inline-flex overflow-hidden rounded-lg border border-line-strong text-[12.5px] font-medium">
          {([["all", "All"], ["todo", "To Do"], ["done", "Done"]] as const).map(([k, l]) => <button key={k} data-testid={`cl-${k}`} onClick={() => setFilter(k)} className={cn("px-2.5 py-1.5", filter === k ? "bg-ink text-white" : "bg-surface text-ink-2 hover:bg-surface-2")}>{l}</button>)}
        </div>
      </div>
      {error && <p role="alert" className="mb-2 rounded-lg bg-critical-soft px-3 py-2 text-[13px] text-critical">{error}</p>}

      <ul className="divide-y divide-line rounded-xl border border-line">
        {items.map((c) => {
          const isDone = !!c.contactedAt;
          const wa = c.phone ? `https://wa.me/${c.phone.replace(/\D/g, "")}?text=${encodeURIComponent(msgFor(c))}` : null;
          return (
            <li key={c.name} data-testid="creator-row" data-done={isDone} className={cn("flex items-start gap-3 px-3 py-3", isDone && "bg-surface-2/50")}>
              <button aria-label={isDone ? `Untick ${c.name}` : `Tick ${c.name} as contacted`} disabled={!canEdit || closed} onClick={() => tick([c.name], !isDone)}
                className={cn("mt-1 flex size-[20px] shrink-0 items-center justify-center rounded-md border-2 transition-colors disabled:opacity-50", isDone ? "border-good bg-good text-white" : "border-line-strong hover:border-brand")}>{isDone && <Check className="size-3.5" strokeWidth={3} />}</button>
              <Person name={c.name} size={32} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2">
                  <Link href={`/creators/${encodeURIComponent(c.name)}`} className={cn("truncate text-[14px] font-semibold hover:underline", isDone ? "text-ink-3" : "text-ink hover:text-brand-strong")}>@{c.name}</Link>
                  {c.owner && <span className="text-[12px] text-ink-3">Owner: {c.owner}</span>}
                </div>
                <p className="text-[12.5px] text-ink-3">{c.note}</p>
                {c.data.videos?.slice(0, 2).map((v) => (
                  <p key={v.id} className="mt-1 flex items-start gap-1.5 rounded-md bg-surface-2 px-2 py-1 text-[12.5px] text-ink-2">
                    <span className="min-w-0 flex-1">{videoText(v)}</span>
                    {v.url && <a href={v.url} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 font-medium text-brand-strong hover:underline" aria-label="Watch the video on TikTok">Watch<ExternalLink className="size-3" /></a>}
                  </p>
                ))}
                {c.data.lifetime != null && !c.data.videos?.length && <p className="mt-0.5 text-[12px] text-ink-3">{fmtRM(c.data.lifetime)} sold in total</p>}
                {isDone && <p className="mt-1 text-[12px] text-good">Contacted{c.contactedBy ? ` by ${c.contactedBy}` : ""}{c.contactedAt ? ` · ${fmtDateTimeKL(c.contactedAt)}` : ""}</p>}
              </div>
              {tpl && !isDone && (
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  {wa && <a href={wa} target="_blank" rel="noreferrer" onClick={() => { if (canEdit && !closed) void tick([c.name], true); }} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#25D366] px-2.5 text-[13px] font-medium text-white hover:brightness-95" title="Open WhatsApp with the message ready, and tick this creator"><MessageCircle className="size-4" />WhatsApp</a>}
                  <CopyButton text={msgFor(c)} label="Message" />
                </div>
              )}
            </li>
          );
        })}
        {!items.length && !loading && <li className="px-4 py-8 text-center text-[13.5px] text-ink-3">{q || filter !== "all" ? "No creators match." : "No creators in this action."}</li>}
        {loading && !items.length && <li className="flex justify-center px-4 py-8"><Loader2 className="size-5 animate-spin text-ink-3" /></li>}
      </ul>
      {shown < count && (
        <button onClick={() => load(shown, false, q, filter)} disabled={loading} className="mt-3 flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-line-strong text-[13.5px] font-medium text-ink-2 hover:bg-surface-2 disabled:opacity-60">{loading && <Loader2 className="size-4 animate-spin" />}Show {Math.min(PAGE, count - shown)} More <span className="text-ink-3">({shown} of {count})</span></button>
      )}
      {canEdit && !closed && items.some((c) => !c.contactedAt) && (
        <button onClick={() => tick(items.filter((c) => !c.contactedAt).slice(0, 50).map((c) => c.name), true)} className="mt-2 text-[13px] font-medium text-brand-strong hover:underline">Tick all shown as contacted</button>
      )}
    </div>
  );
}
