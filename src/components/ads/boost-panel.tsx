"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Rocket, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { createBoostNow, stopBoostNow } from "@/app/actions/ads-boost";
import type { BoostCampaign } from "@/lib/tiktok-ads/boost-write";

const rm = (n: number) => `RM ${n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const DAYS = [{ v: "", l: "Until I stop it" }, { v: "1", l: "1 day" }, { v: "3", l: "3 days" }, { v: "7", l: "7 days" }, { v: "14", l: "14 days" }, { v: "30", l: "30 days" }];

/** Boost one video in TikTok from here. Spends real money: off until the owner switches it on, with limits, a confirm step and a Stop button. */
export function BoostPanel({ itemId, campaigns, blockers, enabled, canWrite, maxBudget, dailyCap, committed, defaultBudget }: {
  itemId: string; campaigns: BoostCampaign[]; blockers: string[]; enabled: boolean; canWrite: boolean; maxBudget: number; dailyCap: number; committed: number; defaultBudget: number;
}) {
  const router = useRouter();
  const [camp, setCamp] = useState(campaigns[0] ? `${campaigns[0].advertiserId}|${campaigns[0].campaignId}` : "");
  const [budget, setBudget] = useState(String(Math.min(defaultBudget, maxBudget)));
  const [days, setDays] = useState("");
  const [sure, setSure] = useState(false);
  const [step, setStep] = useState<"form" | "confirm">("form");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, start] = useTransition();
  const n = Number(budget);
  const chosen = campaigns.find((c) => `${c.advertiserId}|${c.campaignId}` === camp);
  const room = Math.max(0, dailyCap - committed);
  const problem = !(n > 0) ? "Enter a daily budget above zero." : n > maxBudget ? `One boost may spend at most ${rm(maxBudget)} a day (your limit in Settings).` : n > room ? `Only ${rm(room)} a day is left under your limit of ${rm(dailyCap)} for boosts started here.` : null;
  const box = "rounded-2xl border border-line bg-surface p-5";
  const head = <h2 className="flex items-center gap-2 text-[16px] font-semibold text-ink"><Rocket className="size-4.5 text-brand" />Boost This Video In TikTok</h2>;

  if (blockers.length)
    return <section id="boost" className={box} aria-label="Boost this video" data-testid="ads-boost-panel">{head}<ul className="mt-2 space-y-1">{blockers.map((b) => <li key={b} className="flex items-start gap-2 text-[14px] text-ink-2" data-testid="ads-boost-blocker"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" />{b}</li>)}</ul></section>;
  if (!enabled || !canWrite)
    return (
      <section id="boost" className={box} aria-label="Boost this video" data-testid="ads-boost-panel">{head}
        <p className="mt-2 text-[14px] text-ink-2" data-testid="ads-boost-off">{!canWrite ? "Only the owner (the Settings permission) can create boosts from the app, because it spends real money. You can still plan it here and boost it in TikTok." : "Boosting from the app is switched off. The owner can turn it on in Settings, under Connection, Ad Management."}</p>
        {canWrite && <Link href="/settings?tab=connection&src=ads" className="mt-3 inline-flex h-9 items-center rounded-lg border border-line-strong px-3 text-[13.5px] font-medium text-ink hover:bg-surface-2">Open Settings</Link>}
      </section>
    );

  const go = () => start(async () => {
    setMsg(null);
    const [advertiserId, campaignId] = camp.split("|");
    const r = await createBoostNow({ itemId, advertiserId, campaignId, budget: n, days: days ? Number(days) : null });
    setMsg(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error });
    setStep("form"); setSure(false);
    if (r.ok) router.refresh();
  });
  const input = "mt-1 h-9 w-full rounded-lg border border-line-strong bg-surface px-2.5 text-[14px] text-ink focus:border-brand focus:outline-none";
  return (
    <section id="boost" className={box} aria-label="Boost this video" data-testid="ads-boost-panel">
      {head}
      <p className="mt-0.5 text-[13px] text-ink-3">Creates a creative boost for this one video in TikTok. It uses its own daily budget, separate from the campaign.</p>
      {msg && <p role="status" data-testid="ads-boost-result" className={cn("mt-3 flex items-start gap-2 rounded-xl px-3.5 py-2.5 text-[14px]", msg.ok ? "bg-good-soft text-good" : "bg-critical-soft text-critical")}>{msg.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" />}{msg.text}</p>}
      {step === "form" ? (
        <div className="mt-3 space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-[12.5px] font-medium text-ink-2 sm:col-span-1">Campaign
              <select value={camp} onChange={(e) => setCamp(e.target.value)} data-testid="ads-boost-campaign" className={input}>{campaigns.map((c) => <option key={`${c.advertiserId}|${c.campaignId}`} value={`${c.advertiserId}|${c.campaignId}`}>{c.name} · {c.productLabel}{c.ranHere ? " · ran here" : ""}</option>)}</select>
            </label>
            <label className="text-[12.5px] font-medium text-ink-2">Daily Budget (RM)
              <input type="number" min={1} step={0.5} max={maxBudget} value={budget} onChange={(e) => setBudget(e.target.value)} data-testid="ads-boost-budget" className={input} />
            </label>
            <label className="text-[12.5px] font-medium text-ink-2">For How Long
              <select value={days} onChange={(e) => setDays(e.target.value)} data-testid="ads-boost-days" className={input}>{DAYS.map((d) => <option key={d.v} value={d.v}>{d.l}</option>)}</select>
            </label>
          </div>
          <p className="text-[12.5px] text-ink-3">Your limits: up to {rm(maxBudget)} a day for one boost, and {rm(dailyCap)} a day for all boosts started here ({rm(committed)} in use now). In Seller Center the smallest budget for one boost is RM 5 a day. TikTok&apos;s API documentation says 10 (USD); TikTok decides, and its message is shown if it refuses.</p>
          {problem && <p className="text-[13px] text-critical" data-testid="ads-boost-problem">{problem}</p>}
          <label className="flex items-start gap-2 text-[13.5px] text-ink-2"><input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} data-testid="ads-boost-sure" className="mt-0.5 size-4 accent-[var(--brand)]" />I understand this spends real money in TikTok.</label>
          <button type="button" disabled={!!problem || !sure || !chosen} onClick={() => setStep("confirm")} data-testid="ads-boost-go" className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-brand px-5 text-[14px] font-medium text-white hover:bg-brand-strong disabled:opacity-50"><Rocket className="size-4" />Boost In TikTok</button>
        </div>
      ) : (
        <div className="mt-3 rounded-xl border border-brand/30 bg-brand-soft p-4" data-testid="ads-boost-confirm">
          <p className="text-[14.5px] font-semibold text-ink">Please confirm</p>
          <p className="mt-1 text-[14px] text-ink-2">Create a boost for this video in <b>{chosen?.name}</b> ({chosen?.productLabel}) with <b>{rm(n)} a day</b>{days ? <> for <b>{days} day{days === "1" ? "" : "s"}</b> (up to {rm(n * Number(days))})</> : <>, <b>until you stop it</b></>}. TikTok will start spending soon after. You can stop it here at any time.</p>
          <div className="mt-3 flex gap-2">
            <button type="button" disabled={busy} onClick={go} data-testid="ads-boost-confirm-yes" className="inline-flex h-10 items-center rounded-lg bg-brand px-5 text-[14px] font-medium text-white hover:bg-brand-strong disabled:opacity-60">{busy ? "Sending to TikTok…" : "Yes, Create The Boost"}</button>
            <button type="button" disabled={busy} onClick={() => setStep("form")} className="h-10 rounded-lg px-4 text-[14px] text-ink-2 hover:bg-surface-2">Go Back</button>
          </div>
        </div>
      )}
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
