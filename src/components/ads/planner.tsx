"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, Check, CheckCircle2, ClipboardCheck, Copy, ExternalLink, Info, Rocket, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { createBoostsBulk, saveBoostBatch, type BulkResult } from "@/app/actions/ads-boost";
import type { PickRow } from "./picks-board";
import { GroupPill, VideoCell, nfmt, rm, roiFmt } from "./ui";

export type PlanBoost = { enabled: boolean; canWrite: boolean; maxBudget: number; dailyCap: number; committed: number; /** Per video (by key): the campaign it would be boosted in, or why it cannot be. */ items: Record<string, { campaign: string | null; blocker: string | null }> };

const rm2 = (n: number) => `RM ${n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const DAYS = [{ v: "", l: "Until I stop it" }, { v: "1", l: "1 day" }, { v: "3", l: "3 days" }, { v: "7", l: "7 days" }];
const card = "rounded-2xl border border-line bg-surface p-5";
const input = "mt-1 h-9 w-full rounded-lg border border-line-strong bg-surface px-2.5 text-[14px] text-ink focus:border-brand focus:outline-none";

/**
 * Batch Planner. The list of videos you ticked, for two ways to boost them:
 *  1. As a batch in TikTok Seller Center (one shared budget that TikTok splits itself). TikTok's API cannot create that, so the app only keeps the list and the log.
 *  2. Through the app: each video its own creative boost (TikTok's API allows one video per boost), all started with one button.
 * The app invents no budget formula: you choose the amounts.
 */
export function Planner({ videos, today, boost }: { videos: PickRow[]; today: string; boost: PlanBoost }) {
  const router = useRouter();
  const [list, setList] = useState(videos);
  const [total, setTotal] = useState("");
  const [days, setDays] = useState(1);
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  // Boost through the app
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [bdays, setBdays] = useState("");
  const [sure, setSure] = useState(false);
  const [step, setStep] = useState<"form" | "confirm">("form");
  const [results, setResults] = useState<BulkResult[] | null>(null);
  const amountOf = (k: string) => Number(amounts[k] ?? "5");

  const products = useMemo(() => {
    const m = new Map<string, { label: string; videos: PickRow[] }>();
    for (const v of list) { const g = m.get(v.productId) ?? { label: v.productLabel, videos: [] }; g.videos.push(v); m.set(v.productId, g); }
    return [...m.entries()].map(([id, g]) => ({ id, ...g }));
  }, [list]);
  const boostable = list.filter((v) => !boost.items[v.key]?.blocker);
  const sum = boostable.reduce((a, v) => a + (amountOf(v.key) > 0 ? amountOf(v.key) : 0), 0);
  const room = Math.max(0, boost.dailyCap - boost.committed);
  const bad = boostable.find((v) => !(amountOf(v.key) > 0) || amountOf(v.key) > boost.maxBudget);
  const problem = !boostable.length ? "None of these videos can be boosted now." : bad ? `Each amount must be above zero and at most ${rm2(boost.maxBudget)} (your limit in Settings).` : sum > room ? `Together they are ${rm2(sum)} a day, but only ${rm2(room)} a day is left under your limit of ${rm2(boost.dailyCap)}.` : null;
  const copy = (key: string, text: string) => { void navigator.clipboard?.writeText(text); setCopied(key); setTimeout(() => setCopied(null), 1500); };

  if (!list.length)
    return (
      <div className="grid place-items-center rounded-2xl border border-line bg-surface px-6 py-16 text-center" data-testid="ads-planner-empty">
        <h2 className="text-[20px] font-semibold text-ink">No Videos In The Batch Yet</h2>
        <p className="mt-1 max-w-md text-[14.5px] text-ink-3">Open Boost Picks, tick the videos you want, then press Plan This Batch.</p>
        <Link href="/ads?tab=picks" className="mt-5 inline-flex h-10 items-center rounded-lg bg-brand px-5 text-[14.5px] font-medium text-white hover:opacity-90">Open Boost Picks</Link>
      </div>
    );

  const goAll = () => start(async () => {
    setError(null);
    const r = await createBoostsBulk(boostable.map((v) => ({ key: v.key, itemId: v.creativeId, budget: amountOf(v.key) })), bdays ? Number(bdays) : null);
    setResults(r); setStep("form"); setSure(false);
    router.refresh();
  });
  const resOf = (k: string) => results?.find((r) => r.key === k);

  return (
    <div className="space-y-5" data-testid="ads-planner">
      <section className={card}>
        <h2 className="text-[16px] font-semibold text-ink">Your Batch: {list.length} Video{list.length === 1 ? "" : "s"}</h2>
        {products.length > 1 && <p className="mt-2 rounded-lg bg-warn-soft px-3 py-2 text-[13px] text-warn" data-testid="ads-plan-products">These videos belong to {products.length} different products. In Seller Center a batch budget is set for one product at a time, so make one batch for each product (the copy buttons below are per product).</p>}
        <ul className="mt-3 divide-y divide-line border-y border-line">
          {list.map((v) => (
            <li key={v.key} className="flex flex-wrap items-center gap-3 py-2.5" data-testid="ads-plan-row">
              <span className="min-w-0 flex-1 basis-64"><VideoCell v={{ ...v, why: undefined }} /></span>
              <GroupPill group={v.group} />
              <span className="tnum w-36 text-right text-[12.5px] text-ink-3">{v.cost > 0 ? `ROI ${roiFmt(v.roi)} · ${nfmt(v.orders)} orders` : v.organicGmv > 0 ? `${rm(v.organicGmv)} without ads` : "no history"}</span>
              <button type="button" onClick={() => { setList((l) => l.filter((x) => x.key !== v.key)); setResults(null); }} aria-label="Remove from batch" title="Remove from batch" className="grid size-8 place-items-center rounded-lg text-ink-3 hover:bg-surface-2 hover:text-ink"><X className="size-4" /></button>
            </li>
          ))}
        </ul>
      </section>

      <section className={card} data-testid="ads-plan-seller">
        <h2 className="text-[16px] font-semibold text-ink">Option 1: One Shared Budget In Seller Center</h2>
        <p className="mt-0.5 max-w-3xl text-[13px] text-ink-3">This is TikTok&apos;s own batch option (&quot;Use batch budget&quot;): you type one total and TikTok shares it between the videos by their performance. TikTok&apos;s API cannot create it, so you make it in Seller Center. The minimum and the split are TikTok&apos;s, not ours: Seller Center shows the minimum when you pick the videos.</p>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-[13.5px] text-ink-2">
          <li>Copy the video IDs below (one product at a time).</li>
          <li>Seller Center, Shop ads, GMV Max, Creatives, Boost: pick the product, search the Post IDs, switch on &quot;Use batch budget&quot; and type the total.</li>
          <li>Come back here, type the same total, and press Mark As Boosted, so the Boost Log can show what happened after.</li>
        </ol>
        <div className="mt-3 flex flex-wrap gap-2">
          {products.map((g) => <button key={g.id} type="button" onClick={() => copy(g.id, g.videos.map((v) => v.creativeId).join("\n"))} data-testid="ads-plan-copy" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line-strong px-3 text-[13.5px] font-medium text-ink hover:bg-surface-2">{copied === g.id ? <Check className="size-4" /> : <Copy className="size-4" />}{copied === g.id ? "Copied" : `Copy ${g.videos.length} Video ID${g.videos.length === 1 ? "" : "s"}`} · {g.label}</button>)}
          <a href="https://seller-my.tiktok.com/ads-creation/dashboard" target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13.5px] font-medium text-brand hover:underline"><ExternalLink className="size-4" />Open Seller Center</a>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <label className="text-[12.5px] font-medium text-ink-2">Total Budget You Set (RM A Day)<input type="number" min={0} step={0.5} value={total} onChange={(e) => setTotal(e.target.value)} placeholder="As typed in Seller Center" data-testid="ads-plan-total-input" className={input} /></label>
          <label className="text-[12.5px] font-medium text-ink-2">Days<input type="number" min={1} max={30} value={days} onChange={(e) => setDays(Math.min(30, Math.max(1, Math.round(Number(e.target.value) || 1))))} className={input} /></label>
          <label className="text-[12.5px] font-medium text-ink-2">Boost Date<input type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} className={input} /></label>
        </div>
        <label className="mt-3 block text-[12.5px] font-medium text-ink-2">Note (Optional)<input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="For example: weekend push for towels" className={input} /></label>
        {error && <p className="mt-3 text-[13.5px] text-critical" role="alert">{error}</p>}
        <button type="button" disabled={busy} data-testid="ads-mark-boosted" onClick={() => start(async () => { setError(null); const r = await saveBoostBatch({ boostedOn: date, days, note, total: Number(total) > 0 ? Number(total) : undefined, videos: list.map((v) => ({ creativeId: v.creativeId, productId: v.productId, budget: 0 })) }); if (r.ok) router.push("/ads?tab=log&saved=1"); else setError(r.error); })}
          className="mt-4 inline-flex h-10 items-center gap-1.5 rounded-lg bg-brand px-4 text-[14px] font-medium text-white hover:bg-brand-strong disabled:opacity-60"><ClipboardCheck className="size-4" />{busy ? "Saving…" : "Mark As Boosted"}</button>
      </section>

      <section className={card} data-testid="ads-plan-api">
        <h2 className="flex items-center gap-2 text-[16px] font-semibold text-ink"><Rocket className="size-4.5 text-brand" />Option 2: Boost Each Video Through The App</h2>
        <p className="mt-0.5 max-w-3xl text-[13px] text-ink-3">TikTok&apos;s API creates one creative boost per video, each with its own budget (no shared budget, so it costs more than Option 1). All videos below are started with one button, and every try is logged.</p>
        {!boost.canWrite || !boost.enabled ? (
          <p className="mt-3 text-[14px] text-ink-2" data-testid="ads-plan-api-off">{!boost.canWrite ? "Only the owner (the Settings permission) can create boosts from the app, because it spends real money." : "Boosting from the app is switched off. The owner can turn it on in Settings, under Connection, Ad Management."}</p>
        ) : (
          <div className="mt-3 space-y-3">
            <ul className="divide-y divide-line border-y border-line">
              {list.map((v) => {
                const info = boost.items[v.key], res = resOf(v.key);
                return (
                  <li key={v.key} className="flex flex-wrap items-center gap-3 py-2.5" data-testid="ads-plan-api-row">
                    <span className="min-w-0 flex-1 basis-60 text-[13.5px]"><span className="block truncate font-medium text-ink">{v.title || `Video ${v.creativeId.slice(-8)}`}</span><span className="block truncate text-[12.5px] text-ink-3">{info?.blocker ? <span className="text-warn">{info.blocker}</span> : `in ${info?.campaign ?? "its campaign"}`}</span></span>
                    {res ? <span className={cn("flex max-w-md items-start gap-1.5 text-[12.5px]", res.ok ? "text-good" : "text-critical")} data-testid="ads-plan-api-result">{res.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" />}{res.message}</span> : (
                      <label className="flex items-center gap-1.5 text-[12.5px] text-ink-3">RM<input type="number" min={1} step={0.5} disabled={!!info?.blocker} value={amounts[v.key] ?? "5"} onChange={(e) => setAmounts((x) => ({ ...x, [v.key]: e.target.value }))} data-testid="ads-plan-api-amount" className="h-9 w-24 rounded-lg border border-line-strong bg-surface px-2 text-right text-[14px] text-ink focus:border-brand focus:outline-none disabled:opacity-50" aria-label={`Daily budget for ${v.title ?? v.creativeId}`} /></label>
                    )}
                  </li>
                );
              })}
            </ul>
            {!results && (step === "form" ? (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="text-[12.5px] font-medium text-ink-2">For How Long<select value={bdays} onChange={(e) => setBdays(e.target.value)} data-testid="ads-plan-api-days" className={input}>{DAYS.map((d) => <option key={d.v} value={d.v}>{d.l}</option>)}</select></label>
                  <p className="self-end pb-1.5 text-[14px] text-ink-2 sm:col-span-2">Total: <b className="tnum" data-testid="ads-plan-api-total">{rm2(sum)}</b> a day for {boostable.length} video{boostable.length === 1 ? "" : "s"}. Your limits: {rm2(boost.maxBudget)} for one, {rm2(boost.dailyCap)} for all started here ({rm2(boost.committed)} in use).</p>
                </div>
                {problem && <p className="text-[13px] text-critical" data-testid="ads-plan-api-problem">{problem}</p>}
                <label className="flex items-start gap-2 text-[13.5px] text-ink-2"><input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} data-testid="ads-plan-api-sure" className="mt-0.5 size-4 accent-[var(--brand)]" />I understand this spends real money in TikTok.</label>
                <button type="button" disabled={!!problem || !sure} onClick={() => setStep("confirm")} data-testid="ads-plan-api-go" className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-brand px-5 text-[14px] font-medium text-white hover:bg-brand-strong disabled:opacity-50"><Rocket className="size-4" />Boost All {boostable.length} In TikTok</button>
              </div>
            ) : (
              <div className="rounded-xl border border-brand/30 bg-brand-soft p-4" data-testid="ads-plan-api-confirm">
                <p className="text-[14.5px] font-semibold text-ink">Please confirm</p>
                <p className="mt-1 text-[14px] text-ink-2">Create <b>{boostable.length} separate creative boosts</b>, together <b>{rm2(sum)} a day</b>{bdays ? <> for <b>{bdays} day{bdays === "1" ? "" : "s"}</b> (up to {rm2(sum * Number(bdays))})</> : <>, <b>until you stop each one</b></>}. If TikTok refuses one, the others still go ahead and each answer is shown. You can stop them on each video&apos;s page.</p>
                <div className="mt-3 flex gap-2">
                  <button type="button" disabled={busy} onClick={goAll} data-testid="ads-plan-api-yes" className="inline-flex h-10 items-center rounded-lg bg-brand px-5 text-[14px] font-medium text-white hover:bg-brand-strong disabled:opacity-60">{busy ? "Sending to TikTok…" : "Yes, Create All Boosts"}</button>
                  <button type="button" disabled={busy} onClick={() => setStep("form")} className="h-10 rounded-lg px-4 text-[14px] text-ink-2 hover:bg-surface-2">Go Back</button>
                </div>
              </div>
            ))}
            {results && <p className="text-[13px] text-ink-3" data-testid="ads-plan-api-done">{results.filter((r) => r.ok).length} of {results.length} boosts were created. They are in the Boost Log and in Settings, under what the app sent.</p>}
          </div>
        )}
        <p className="mt-3 flex items-start gap-1.5 text-[12.5px] text-ink-3"><Info className="mt-0.5 size-3.5 shrink-0" />Seller Center&apos;s smallest budget for one boost is RM 5 a day. TikTok decides and its message is shown if it refuses.</p>
      </section>
    </div>
  );
}
