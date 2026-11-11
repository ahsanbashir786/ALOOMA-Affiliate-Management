"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Lock, Rocket, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { createBoostNow, stopBoostNow } from "@/app/actions/ads-boost";
import type { BoostCampaign } from "@/lib/tiktok-ads/boost-write";
import { BudgetStepper, HoldToLaunch, SpendGauge } from "./boost-ui";


const DAY_PILLS = [{ v: "", l: "∞" }, { v: "1", l: "1d" }, { v: "3", l: "3d" }, { v: "7", l: "7d" }, { v: "14", l: "14d" }];

/** Boost one video in TikTok from here. Spends real money: off until the owner switches it on, with limits, a press-and-hold launch and a Stop button. */
export function BoostPanel({ itemId, campaigns, blockers, enabled, canWrite, maxBudget, dailyCap, committed, defaultBudget }: {
  itemId: string; campaigns: BoostCampaign[]; blockers: string[]; enabled: boolean; canWrite: boolean; maxBudget: number; dailyCap: number; committed: number; defaultBudget: number;
}) {
  const router = useRouter();
  const [camp, setCamp] = useState(campaigns[0] ? `${campaigns[0].advertiserId}|${campaigns[0].campaignId}` : "");
  const [budget, setBudget] = useState(String(Math.min(defaultBudget, maxBudget)));
  const [days, setDays] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, start] = useTransition();
  const n = Number(budget);
  const chosen = campaigns.find((c) => `${c.advertiserId}|${c.campaignId}` === camp);
  const room = Math.max(0, dailyCap - committed);
  const problem = !(n > 0) ? `Enter RM 1 – ${maxBudget}` : n > maxBudget ? `Most for one boost: RM ${maxBudget}` : n > room ? `Over your RM ${dailyCap} limit` : null;
  const box = "overflow-hidden rounded-3xl border border-line bg-surface p-5 shadow-card";
  const head = <h2 className="flex items-center gap-2 text-[16px] font-semibold text-ink"><span className="grid size-8 place-items-center rounded-xl bg-brand-soft text-brand"><Rocket className="size-4.5" /></span>Boost This Video</h2>;

  const resultEl = msg ? <p role="status" data-testid="ads-boost-result" className={cn("bx-pop mt-4 flex items-start gap-2 rounded-2xl px-4 py-3 text-[14px] font-medium", msg.ok ? "bg-good-soft text-good" : "bg-critical-soft text-critical")}>{msg.ok ? <CheckCircle2 className="mt-0.5 size-5 shrink-0" /> : <AlertTriangle className="mt-0.5 size-5 shrink-0" />}{msg.text}</p> : null;
  if (blockers.length)
    return <section id="boost" className={box} aria-label="Boost this video" data-testid="ads-boost-panel">{head}{resultEl}<ul className="mt-3 space-y-2">{blockers.map((b) => <li key={b} className="flex items-start gap-2 rounded-xl bg-warn-soft px-3.5 py-2.5 text-[13.5px] font-medium text-warn" data-testid="ads-boost-blocker"><AlertTriangle className="mt-0.5 size-4 shrink-0" />{b}</li>)}</ul></section>;
  if (!enabled || !canWrite)
    return (
      <section id="boost" className={box} aria-label="Boost this video" data-testid="ads-boost-panel">{head}
        <div className="mt-3 flex flex-wrap items-center gap-3" data-testid="ads-boost-off"><span className="grid size-10 place-items-center rounded-xl bg-surface-2 text-ink-3"><Lock className="size-5" /></span>
          <p className="text-[14px] font-medium text-ink-2">{!canWrite ? "Owner only" : "Switched off"}</p>
          {canWrite && <Link href="/settings?tab=connection&src=ads" className="inline-flex h-9 items-center rounded-lg border border-line-strong px-3 text-[13.5px] font-medium text-ink hover:bg-surface-2">Turn On In Settings</Link>}
        </div>
      </section>
    );

  const go = () => start(async () => {
    setMsg(null);
    const [advertiserId, campaignId] = camp.split("|");
    const r = await createBoostNow({ itemId, advertiserId, campaignId, budget: n, days: days ? Number(days) : null });
    setMsg(r.ok ? { ok: true, text: "Live in TikTok" } : { ok: false, text: r.error });
    if (r.ok) router.refresh();
  });
  return (
    <section id="boost" className={box} aria-label="Boost this video" data-testid="ads-boost-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {head}
        <select value={camp} onChange={(e) => setCamp(e.target.value)} data-testid="ads-boost-campaign" aria-label="Campaign" className="h-9 max-w-[280px] rounded-full border border-line-strong bg-surface-2 px-3 text-[13px] font-medium text-ink-2 focus:border-brand focus:outline-none">{campaigns.map((c) => <option key={`${c.advertiserId}|${c.campaignId}`} value={`${c.advertiserId}|${c.campaignId}`}>{c.name}{c.ranHere ? " ●" : ""}</option>)}</select>
      </div>
      {resultEl}
      <div className="mt-5 grid items-center gap-6 md:grid-cols-[auto_minmax(0,1fr)_minmax(0,260px)]">
        <div className="space-y-3">
          <BudgetStepper value={budget} onChange={setBudget} max={maxBudget} testId="ads-boost-budget" />
          <div className="flex gap-1.5" role="group" aria-label="For how long">{DAY_PILLS.map((d) => <button key={d.v} type="button" onClick={() => setDays(d.v)} data-testid={`ads-boost-days-${d.v || "open"}`} aria-pressed={days === d.v} className={cn("h-8 min-w-10 rounded-full px-2.5 text-[13px] font-semibold", days === d.v ? "bg-brand-soft text-brand-strong" : "bg-surface-2 text-ink-2 hover:bg-brand-soft")}>{d.l}</button>)}</div>
        </div>
        <div className="hidden md:block"><SpendGauge running={committed} adding={n > 0 ? n : 0} cap={dailyCap} size={190} /></div>
        <div>
          {problem && <p className="mb-2 flex items-center justify-center gap-1.5 text-[13px] font-medium text-critical" data-testid="ads-boost-problem"><AlertTriangle className="size-4" />{problem}</p>}
          <HoldToLaunch testId="ads-boost-go" label="Launch Boost" disabled={!!problem || !chosen} busy={busy} onDone={go} />
        </div>
      </div>
    </section>
  );
}

/** Stops one running boost (with a confirm step). */
export function StopBoostButton({ sessionId, itemId }: { sessionId: string; itemId: string }) {
  const router = useRouter();
  const [ask, setAsk] = useState(false);
  const [busy, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  if (!ask) return <button type="button" onClick={() => setAsk(true)} data-testid="ads-boost-stop" className="inline-flex h-8 items-center gap-1 rounded-lg border border-line-strong px-2.5 text-[12.5px] font-medium text-critical hover:bg-critical-soft"><Square className="size-3.5" />Stop</button>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 text-[12.5px] text-ink-2">Stop this boost in TikTok?
      <button type="button" disabled={busy} data-testid="ads-boost-stop-yes" onClick={() => start(async () => { const r = await stopBoostNow(sessionId, itemId); if (r.ok) router.refresh(); else setErr(r.error); })} className="h-8 rounded-lg bg-critical-soft px-2.5 font-medium text-critical">{busy ? "Stopping…" : "Yes, stop it"}</button>
      <button type="button" onClick={() => setAsk(false)} className="h-8 rounded-lg px-2 hover:bg-surface-2">Keep</button>
      {err && <span className="basis-full text-critical" role="alert">{err}</span>}
    </span>
  );
}
