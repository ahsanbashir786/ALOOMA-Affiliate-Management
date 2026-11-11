"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, ClipboardCheck, Copy, Info, Rocket, X } from "lucide-react";
import { minBatchTotal, suggestBudgets } from "@/lib/ads/budget";
import { saveBoostBatch } from "@/app/actions/ads-boost";
import type { PickRow } from "./picks-board";
import { GroupPill, VideoCell, rm, roiFmt } from "./ui";

/** Batch Planner: an uneven budget split for the videos you ticked. A plan only; you create the batch in TikTok Ads Manager. */
export function Planner({ videos, today }: { videos: PickRow[]; today: string }) {
  const router = useRouter();
  const [list, setList] = useState(videos);
  const min = minBatchTotal(list.length);
  const [total, setTotal] = useState<number | null>(null);
  const [edits, setEdits] = useState<Record<string, number>>({});
  const [days, setDays] = useState(1);
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const want = Math.max(total ?? min, min);
  // A video GMV Max never spent on has no ROI yet: give it a modest weight so it still gets a fair share.
  const split = useMemo(() => suggestBudgets(list.map((v) => ({ id: v.key, roi: v.roi ?? 3, orders: Math.max(v.orders, v.organicGmv > 0 ? 2 : 1) })), want), [list, want]);
  const budgetOf = (k: string) => edits[k] ?? split.budgets[k] ?? 0;
  const sum = list.reduce((a, v) => a + budgetOf(v.key), 0);
  const text = () => list.map((v) => `${v.creativeId}\tRM ${budgetOf(v.key).toFixed(2)}\t${v.creator ? "@" + v.creator : ""}\t${v.title ?? ""}`).join("\n");

  if (!list.length)
    return (
      <div className="grid place-items-center rounded-2xl border border-line bg-surface px-6 py-16 text-center" data-testid="ads-planner-empty">
        <h2 className="text-[20px] font-semibold text-ink">No Videos In The Batch Yet</h2>
        <p className="mt-1 max-w-md text-[14.5px] text-ink-3">Open Boost Picks, tick the videos you want, then press Plan This Batch.</p>
        <Link href="/ads?tab=picks" className="mt-5 inline-flex h-10 items-center rounded-lg bg-brand px-5 text-[14.5px] font-medium text-white hover:opacity-90">Open Boost Picks</Link>
      </div>
    );

  return (
    <div className="space-y-5" data-testid="ads-planner">
      <section className="rounded-2xl border border-line bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <h2 className="text-[16px] font-semibold text-ink">Batch Of {list.length} Video{list.length === 1 ? "" : "s"}</h2>
            <p className="mt-0.5 text-[13px] text-ink-3">The lowest total TikTok accepts for this many videos is about {rm(min)} a day (RM 3.50 a video, rounded up; one video alone needs RM 5). The total is split unevenly: more for the videos with the best ROI and most orders. You can change the total or any amount.</p>
          </div>
          <div className="text-right"><p className="tnum text-[26px] leading-tight font-semibold text-ink" data-testid="ads-plan-total">RM {sum.toFixed(2)}</p><p className="text-[12.5px] text-ink-3">a day{days > 1 ? ` · RM ${(sum * days).toFixed(2)} for ${days} days` : ""}</p></div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <label className="text-[12.5px] font-medium text-ink-2">Total Budget A Day (RM)
            <input type="number" min={min} step={0.5} value={total ?? min} onChange={(e) => { setTotal(Number(e.target.value) || 0); setEdits({}); }} data-testid="ads-plan-total-input" className="mt-1 h-9 w-full rounded-lg border border-line-strong bg-surface px-2.5 text-[14px] text-ink focus:border-brand focus:outline-none" />
          </label>
          <label className="text-[12.5px] font-medium text-ink-2">Days
            <input type="number" min={1} max={30} value={days} onChange={(e) => setDays(Math.min(30, Math.max(1, Math.round(Number(e.target.value) || 1))))} className="mt-1 h-9 w-full rounded-lg border border-line-strong bg-surface px-2.5 text-[14px] text-ink focus:border-brand focus:outline-none" />
          </label>
          <label className="text-[12.5px] font-medium text-ink-2">Boost Date
            <input type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 h-9 w-full rounded-lg border border-line-strong bg-surface px-2.5 text-[14px] text-ink focus:border-brand focus:outline-none" />
          </label>
        </div>
        {new Set(list.map((v) => v.productId)).size > 1 && <p className="mt-3 rounded-lg bg-warn-soft px-3 py-2 text-[13px] text-warn" data-testid="ads-plan-products">These videos belong to {new Set(list.map((v) => v.productId)).size} different products. In Seller Center a batch budget is set for one product at a time, so make one batch for each product.</p>}
        <ul className="mt-4 divide-y divide-line border-y border-line">
          {list.map((v) => (
            <li key={v.key} className="flex flex-wrap items-center gap-3 py-2.5" data-testid="ads-plan-row">
              <span className="min-w-0 flex-1 basis-64"><VideoCell v={{ ...v, why: undefined }} /></span>
              <GroupPill group={v.group} />
              <span className="tnum w-28 text-right text-[12.5px] text-ink-3">{v.cost > 0 ? `ROI ${roiFmt(v.roi)} · ${v.orders} orders` : v.organicGmv > 0 ? `${rm(v.organicGmv)} without ads` : "no history"}</span>
              <label className="flex items-center gap-1.5 text-[12.5px] text-ink-3">RM<input type="number" min={1} step={0.5} value={budgetOf(v.key)} onChange={(e) => setEdits((x) => ({ ...x, [v.key]: Math.max(0, Number(e.target.value) || 0) }))} className="h-9 w-24 rounded-lg border border-line-strong bg-surface px-2 text-right text-[14px] text-ink focus:border-brand focus:outline-none" aria-label={`Budget for ${v.title ?? v.creativeId}`} /></label>
              <Link href={`/ads/video/${encodeURIComponent(v.creativeId)}?budget=${budgetOf(v.key)}#boost`} data-testid="ads-plan-boost" title="Open this video to boost it in TikTok from here" className="inline-flex h-8 items-center gap-1 rounded-lg border border-line-strong px-2.5 text-[12.5px] font-medium text-brand-strong hover:bg-brand-soft"><Rocket className="size-3.5" />Boost</Link>
              <button type="button" onClick={() => { setList((l) => l.filter((x) => x.key !== v.key)); setEdits({}); setTotal(null); }} aria-label="Remove from batch" title="Remove from batch" className="grid size-8 place-items-center rounded-lg text-ink-3 hover:bg-surface-2 hover:text-ink"><X className="size-4" /></button>
            </li>
          ))}
        </ul>
        <label className="mt-4 block text-[12.5px] font-medium text-ink-2">Note (Optional)
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="For example: weekend push for towels" className="mt-1 h-9 w-full rounded-lg border border-line-strong bg-surface px-2.5 text-[14px] text-ink focus:border-brand focus:outline-none" />
        </label>
        {error && <p className="mt-3 text-[13.5px] text-critical" role="alert">{error}</p>}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => { void navigator.clipboard?.writeText(text()); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-line-strong px-4 text-[14px] font-medium text-ink hover:bg-surface-2">{copied ? <Check className="size-4" /> : <Copy className="size-4" />}{copied ? "Copied" : "Copy Videos And Budgets"}</button>
          <button type="button" disabled={busy} data-testid="ads-mark-boosted" onClick={() => start(async () => { setError(null); const r = await saveBoostBatch({ boostedOn: date, days, note, videos: list.map((v) => ({ creativeId: v.creativeId, productId: v.productId, budget: budgetOf(v.key) })) }); if (r.ok) router.push("/ads?tab=log&saved=1"); else setError(r.error); })} className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-brand px-4 text-[14px] font-medium text-white hover:bg-brand-strong disabled:opacity-60"><ClipboardCheck className="size-4" />{busy ? "Saving…" : "Mark As Boosted"}</button>
          <Link href="/ads?tab=picks" className="inline-flex h-10 items-center rounded-lg px-3 text-[14px] text-ink-2 hover:bg-surface-2">Back To Boost Picks</Link>
        </div>
        <p className="mt-3 flex items-start gap-1.5 text-[12.5px] text-ink-3"><Info className="mt-0.5 size-3.5 shrink-0" />This is a plan. Create the batch in TikTok Ads Manager with these videos, then press Mark As Boosted so the Boost Log can show the results before and after. Nothing is sent to TikTok from this page. To boost one video through the app, press Boost on its row (the owner must switch it on in Settings first).</p>
      </section>
    </div>
  );
}
