"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, Check, CheckCircle2, ClipboardCheck, Copy, ExternalLink, Lock, Rocket, ShoppingBag, Store, TrendingUp, Wallet, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { createBoostsBulk, saveBoostBatch, type BulkResult } from "@/app/actions/ads-boost";
import { Sparkline } from "@/components/viz/sparkline";
import { Person } from "@/components/execution/ui";
import type { PickRow } from "./picks-board";
import { GROUP } from "@/lib/ads/groups";
import { BudgetStepper, HoldToLaunch, SpendGauge, rmShort } from "./boost-ui";
import { dayShort, nfmt, rm, roiFmt } from "./ui";

export type PlanBoost = { enabled: boolean; canWrite: boolean; maxBudget: number; dailyCap: number; committed: number; /** Per video (by key): the campaign it would be boosted in, or why it cannot be. */ items: Record<string, { campaign: string | null; blocker: string | null }> };

/** A blocker in a few words for the card (the full text is in the tooltip). */
const shortBlock = (t: string | null) => !t ? "" : /already running/i.test(t) ? "Already boosted" : /no campaign|nowhere to boost/i.test(t) ? "No campaign yet" : /switched off/i.test(t) ? "Campaign is off" : /LIVE GMV/i.test(t) ? "LIVE campaign" : /not in the synced/i.test(t) ? "Press Sync Now" : /TikTok will not boost/i.test(t) ? "TikTok won't boost it" : t.slice(0, 40);
const DAYS = [{ v: "", l: "∞" }, { v: "1", l: "1d" }, { v: "3", l: "3d" }, { v: "7", l: "7d" }];
const EDGE: Record<string, string> = { good: "bg-good", brand: "bg-brand", warn: "bg-warn", critical: "bg-critical", muted: "bg-line-strong" };

function Stat({ icon: Icon, value, tip, tone }: { icon: React.ComponentType<{ className?: string }>; value: string; tip: string; tone?: "good" }) {
  return <span title={tip} className={cn("inline-flex items-center gap-1 rounded-lg bg-surface-2 px-2 py-1 text-[13px] font-semibold", tone === "good" ? "text-good" : "text-ink")}><Icon className="size-3.5 text-ink-3" /><span className="tnum">{value}</span></span>;
}

/**
 * Boost Studio (the Batch Planner tab). Your videos as cards, a launch pad on the side.
 * In the app: each video its own creative boost (TikTok's API allows one video per boost), launched together by pressing and holding one button.
 * Seller Center: TikTok's own batch with one shared budget (not possible through the API): the app only copies the list and keeps the log.
 */
export function Planner({ videos, today, boost, trends }: { videos: PickRow[]; today: string; boost: PlanBoost; trends: Record<string, number[]> }) {
  const router = useRouter();
  const [list, setList] = useState(videos);
  const [mode, setMode] = useState<"app" | "seller">("app");
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [bdays, setBdays] = useState("");
  const [results, setResults] = useState<BulkResult[] | null>(null);
  const [busy, start] = useTransition();
  // Seller Center mode
  const [total, setTotal] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const amountOf = (k: string) => Number(amounts[k] ?? String(list.find((v) => v.key === k)?.testAmount ?? 5));

  const ready = list.filter((v) => !boost.items[v.key]?.blocker);
  const sum = ready.reduce((a, v) => a + (amountOf(v.key) > 0 ? amountOf(v.key) : 0), 0);
  const room = Math.max(0, boost.dailyCap - boost.committed);
  const bad = ready.find((v) => !(amountOf(v.key) > 0) || amountOf(v.key) > boost.maxBudget);
  const problem = !ready.length ? "none" : bad ? "amount" : sum > room ? "cap" : null;
  const products = useMemo(() => {
    const m = new Map<string, { label: string; videos: PickRow[] }>();
    for (const v of list) { const g = m.get(v.productId) ?? { label: v.productLabel, videos: [] }; g.videos.push(v); m.set(v.productId, g); }
    return [...m.entries()].map(([id, g]) => ({ id, ...g }));
  }, [list]);
  const resOf = (k: string) => results?.find((r) => r.key === k);
  const live = results?.filter((r) => r.ok).length ?? 0;
  const canApp = boost.enabled && boost.canWrite;

  if (!list.length)
    return (
      <div className="grid place-items-center rounded-3xl border border-dashed border-line-strong bg-surface px-6 py-20 text-center" data-testid="ads-planner-empty">
        <span className="grid size-16 place-items-center rounded-2xl bg-brand-soft text-brand"><Rocket className="size-8" /></span>
        <h2 className="mt-4 text-[20px] font-semibold text-ink">Pick Videos To Boost</h2>
        <Link href="/ads?tab=picks" className="mt-5 inline-flex h-10 items-center rounded-lg bg-brand px-5 text-[14.5px] font-medium text-white hover:bg-brand-strong">Open Boost Picks</Link>
      </div>
    );

  const launch = () => start(async () => {
    const r = await createBoostsBulk(ready.map((v) => ({ key: v.key, itemId: v.creativeId, budget: amountOf(v.key) })), bdays ? Number(bdays) : null);
    setResults(r); router.refresh();
  });
  const copy = (key: string, text: string) => { void navigator.clipboard?.writeText(text); setCopied(key); setTimeout(() => setCopied(null), 1500); };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]" data-testid="ads-planner">
      {/* ───── the videos ───── */}
      <div className="space-y-3">
        {products.length > 1 && <p className="flex items-center gap-2 rounded-xl bg-warn-soft px-3.5 py-2 text-[13px] font-medium text-warn" data-testid="ads-plan-products"><AlertTriangle className="size-4" />{products.length} products: a Seller Center batch is one product at a time</p>}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2" data-testid="ads-plan-grid">
          {list.map((v) => {
            const info = boost.items[v.key], res = resOf(v.key), g = GROUP[v.group], tr = trends[v.creativeId] ?? [];
            const blocked = !!info?.blocker;
            return (
              <article key={v.key} data-testid="ads-plan-row" data-state={res ? (res.ok ? "live" : "refused") : blocked ? "blocked" : "ready"}
                className={cn("group relative overflow-hidden rounded-2xl border bg-surface p-4 pt-5 transition-shadow hover:shadow-card", res?.ok ? "bx-pop border-good/50" : res ? "border-critical/40" : "border-line")}>
                <span aria-hidden className={cn("absolute inset-x-0 top-0 h-1.5", res?.ok ? "bg-good" : res ? "bg-critical" : EDGE[g.tone])} />
                <button type="button" onClick={() => { setList((l) => l.filter((x) => x.key !== v.key)); setResults(null); }} aria-label="Remove from batch" title="Remove" className="absolute top-3 right-3 grid size-7 place-items-center rounded-full text-ink-3 opacity-60 hover:bg-surface-2 hover:opacity-100"><X className="size-4" /></button>
                <div className="flex items-start gap-3 pr-6">
                  {v.creator ? <Person name={v.creator} size={38} /> : <span className="size-[38px] shrink-0 rounded-full bg-surface-2" />}
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-[14px] leading-snug font-semibold text-ink" title={v.title ?? undefined}>{v.title || `Video ${v.creativeId.slice(-8)}`}</p>
                    <p className="mt-0.5 truncate text-[12.5px] text-ink-3">{v.creator ? `@${v.creator}` : ""}{v.postedOn ? ` · ${dayShort(v.postedOn)}` : ""}</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <Stat icon={TrendingUp} value={v.cost > 0 ? roiFmt(v.roi) : "–"} tip="ROI: sales for every RM of ads, all time" tone="good" />
                  <Stat icon={ShoppingBag} value={nfmt(v.orders)} tip="Orders from ads, all time" />
                  <Stat icon={Wallet} value={rm(v.cost)} tip="Ad spend, all time" />
                  <span className="ml-auto rounded-full px-2 py-0.5 text-[11.5px] font-medium text-ink-2" style={{ background: "var(--surface-2)" }} title={g.about}>{g.label}</span>
                </div>
                <div className="mt-2 h-9" title="Sales from ads, last 14 days"><Sparkline values={tr.length ? tr : [0, 0]} tone="good" height={36} label="Sales, last 14 days" /></div>
                {/* state / budget */}
                {res ? (
                  <p className={cn("mt-3 flex items-start gap-1.5 rounded-xl px-3 py-2 text-[13px] font-medium", res.ok ? "bg-good-soft text-good" : "bg-critical-soft text-critical")} data-testid="ads-plan-api-result" title={res.message}>
                    {res.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" />}<span className="line-clamp-2">{res.ok ? "Live in TikTok" : res.message}</span>
                  </p>
                ) : blocked ? (
                  <p className="mt-3 flex items-start gap-1.5 rounded-xl bg-warn-soft px-3 py-2 text-[12.5px] font-medium text-warn" title={info.blocker ?? undefined}><Lock className="mt-0.5 size-3.5 shrink-0" /><span className="line-clamp-1">{shortBlock(info.blocker)}</span></p>
                ) : mode === "app" && canApp ? (
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-[12px] text-ink-3" title={info?.campaign ?? undefined}><span className="mr-1 inline-block size-2 rounded-full bg-good align-middle" />{info?.campaign ?? "Ready"}</span>
                    <BudgetStepper value={amounts[v.key] ?? String(v.testAmount)} onChange={(x) => setAmounts((a) => ({ ...a, [v.key]: x }))} max={boost.maxBudget} compact testId="ads-plan-api-amount" />
                  </div>
                ) : (
                  <p className="mt-3 flex items-center gap-1.5 text-[12px] text-ink-3"><span className="inline-block size-2 rounded-full bg-good" />Ready</p>
                )}
              </article>
            );
          })}
        </div>
      </div>

      {/* ───── the launch pad ───── */}
      <aside className="lg:sticky lg:top-4 lg:self-start">
        <div className="space-y-4 rounded-3xl border border-line bg-surface p-4 shadow-card">
          <div className="grid grid-cols-2 rounded-2xl bg-surface-2 p-1" role="tablist" aria-label="Where to boost">
            {([["app", "In The App", Rocket], ["seller", "Seller Center", Store]] as const).map(([k, l, Icon]) => (
              <button key={k} type="button" role="tab" aria-selected={mode === k} onClick={() => setMode(k)} data-testid={`ads-plan-mode-${k}`} className={cn("inline-flex h-10 items-center justify-center gap-1.5 rounded-xl text-[14px] font-medium", mode === k ? "bg-brand-soft text-brand-strong shadow-card" : "text-ink-2 hover:text-ink")}><Icon className="size-4" />{l}</button>
            ))}
          </div>

          {mode === "app" ? (
            <div data-testid="ads-plan-api" className="space-y-4">
              {!canApp ? (
                <div className="grid place-items-center gap-2 rounded-2xl border border-dashed border-line-strong px-4 py-8 text-center" data-testid="ads-plan-api-off">
                  <Lock className="size-8 text-ink-3" />
                  <p className="text-[14px] font-medium text-ink-2">{!boost.canWrite ? "Owner only" : "Switched off"}</p>
                  {boost.canWrite && <Link href="/settings?tab=connection&src=ads" className="inline-flex h-9 items-center rounded-lg border border-line-strong px-3 text-[13.5px] font-medium text-ink hover:bg-surface-2">Turn On In Settings</Link>}
                </div>
              ) : results ? (
                <div className="space-y-3 text-center" data-testid="ads-plan-api-done">
                  <p className="bx-pop mx-auto grid size-16 place-items-center rounded-full bg-good-soft text-good"><CheckCircle2 className="size-9" /></p>
                  <p className="text-[22px] font-semibold text-ink"><span className="tnum">{live}</span> of <span className="tnum">{results.length}</span> live</p>
                  <div className="flex justify-center gap-2"><Link href="/ads?tab=log" className="inline-flex h-9 items-center rounded-lg border border-line-strong px-3 text-[13.5px] font-medium text-ink hover:bg-surface-2">Boost Log</Link><button type="button" onClick={() => setResults(null)} className="h-9 rounded-lg px-3 text-[13.5px] text-ink-2 hover:bg-surface-2">Plan More</button></div>
                </div>
              ) : (
                <>
                  <SpendGauge running={boost.committed} adding={sum} cap={boost.dailyCap} />
                  <div className="flex items-center justify-center gap-1.5" role="group" aria-label="For how long">
                    {DAYS.map((d) => <button key={d.v} type="button" onClick={() => setBdays(d.v)} data-testid={`ads-plan-api-days-${d.v || "open"}`} aria-pressed={bdays === d.v} className={cn("h-9 min-w-12 rounded-full px-3 text-[14px] font-semibold", bdays === d.v ? "bg-brand-soft text-brand-strong" : "bg-surface-2 text-ink-2 hover:bg-brand-soft")}>{d.l}</button>)}
                  </div>
                  <p className="sr-only" data-testid="ads-plan-api-total">{rmShort(sum)}</p>
                  {problem && problem !== "none" && <p className="flex items-center justify-center gap-1.5 text-[13px] font-medium text-critical" data-testid="ads-plan-api-problem"><AlertTriangle className="size-4" />{problem === "amount" ? `Each RM 1 – ${boost.maxBudget}` : `Over your RM ${boost.dailyCap} limit`}</p>}
                  <HoldToLaunch testId="ads-plan-api-go" label={`Launch ${ready.length} Boost${ready.length === 1 ? "" : "s"}`} disabled={!!problem} busy={busy} onDone={launch} />
                </>
              )}
            </div>
          ) : (
            <div data-testid="ads-plan-seller" className="space-y-4">
              <div className="space-y-2">
                {products.map((g) => (
                  <button key={g.id} type="button" onClick={() => copy(g.id, g.videos.map((v) => v.creativeId).join("\n"))} data-testid="ads-plan-copy" className="flex w-full items-center gap-3 rounded-2xl border border-line px-3.5 py-3 text-left hover:border-brand/50 hover:bg-brand-soft">
                    <span className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand">{copied === g.id ? <Check className="size-5" /> : <Copy className="size-5" />}</span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-[14px] font-semibold text-ink">{g.label}</span><span className="text-[12.5px] text-ink-3">{copied === g.id ? "Copied" : `${g.videos.length} video ID${g.videos.length === 1 ? "" : "s"}`}</span></span>
                  </button>
                ))}
              </div>
              <a href="https://seller-my.tiktok.com/ads-creation/dashboard" target="_blank" rel="noreferrer" className="flex h-10 items-center justify-center gap-1.5 rounded-xl border border-line-strong text-[14px] font-medium text-brand hover:bg-brand-soft"><ExternalLink className="size-4" />Open Seller Center</a>
              <label className="block text-center">
                <span className="text-[12px] font-medium text-ink-3">Total you set there (RM a day)</span>
                <input type="number" min={0} step={0.5} value={total} onChange={(e) => setTotal(e.target.value)} placeholder="0" data-testid="ads-plan-total-input" className="tnum mx-auto mt-1 block h-12 w-40 rounded-2xl border border-line-strong bg-surface text-center text-[22px] font-semibold text-ink focus:border-brand focus:outline-none" />
              </label>
              {saveErr && <p className="text-center text-[13px] text-critical" role="alert">{saveErr}</p>}
              <button type="button" disabled={busy} data-testid="ads-mark-boosted" onClick={() => start(async () => { setSaveErr(null); const r = await saveBoostBatch({ boostedOn: today, days: 1, note: "", total: Number(total) > 0 ? Number(total) : undefined, videos: list.map((v) => ({ creativeId: v.creativeId, productId: v.productId, budget: 0 })) }); if (r.ok) router.push("/ads?tab=log&saved=1"); else setSaveErr(r.error); })}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-brand text-[15px] font-semibold text-white hover:bg-brand-strong disabled:opacity-60"><ClipboardCheck className="size-5" />{busy ? "Saving…" : "Mark As Boosted"}</button>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
