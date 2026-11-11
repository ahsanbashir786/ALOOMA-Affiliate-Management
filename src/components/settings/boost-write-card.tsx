"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Rocket } from "lucide-react";
import { cn } from "@/lib/utils";
import { setBoostWriteSettings } from "@/app/actions/ads-boost";
import type { BoostActionRow, BoostWriteSettings } from "@/lib/tiktok-ads/boost-write";
import { fmtDateTimeKL } from "@/lib/time";

const rm = (n: number) => `RM ${n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** The switch and the spending limits for boosting from the app, and what the app has sent to TikTok. */
export function BoostWriteCard({ initial, actions }: { initial: BoostWriteSettings; actions: BoostActionRow[] }) {
  const [on, setOn] = useState(initial.enabled);
  const [max, setMax] = useState(String(initial.maxBudget));
  const [cap, setCap] = useState(String(initial.dailyCap));
  const [saved, setSaved] = useState(false);
  const [busy, start] = useTransition();
  const input = "mt-1 h-9 w-full rounded-lg border border-line-strong bg-surface px-2.5 text-[14px] text-ink focus:border-brand focus:outline-none";
  const save = (patch: Partial<BoostWriteSettings>) => start(async () => { const s = await setBoostWriteSettings(patch); setOn(s.enabled); setMax(String(s.maxBudget)); setCap(String(s.dailyCap)); setSaved(true); setTimeout(() => setSaved(false), 2000); });
  return (
    <section className="rounded-2xl border border-line bg-surface p-5" data-testid="boost-write-card" aria-label="Boost from the app">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h3 className="flex items-center gap-2 text-[15px] font-semibold text-ink"><Rocket className="size-4.5 text-brand" />Boost From The App</h3>
          <p className="mt-0.5 text-[13px] text-ink-3">Lets the owner create and stop a creative boost for one video from the GMV Max screens. This spends real money in TikTok. It is off until you switch it on, and the limits below always apply.</p>
        </div>
        <button type="button" role="switch" aria-checked={on} disabled={busy} data-testid="boost-write-switch" onClick={() => save({ enabled: !on })}
          className={cn("inline-flex h-9 items-center gap-2 rounded-lg border px-3.5 text-[14px] font-medium", on ? "border-brand/40 bg-brand-soft text-brand-strong" : "border-line-strong text-ink-2 hover:bg-surface-2")}>
          <span className={cn("size-2.5 rounded-full", on ? "bg-good" : "bg-ink-3")} />{on ? "On" : "Off"}
        </button>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className="text-[12.5px] font-medium text-ink-2">Most For One Boost A Day (RM)<input type="number" min={1} step={1} value={max} onChange={(e) => setMax(e.target.value)} data-testid="boost-write-max" className={input} /></label>
        <label className="text-[12.5px] font-medium text-ink-2">Most For All Boosts Started Here A Day (RM)<input type="number" min={1} step={1} value={cap} onChange={(e) => setCap(e.target.value)} data-testid="boost-write-cap" className={input} /></label>
        <div className="flex items-end gap-2"><button type="button" disabled={busy} onClick={() => save({ maxBudget: Number(max), dailyCap: Number(cap) })} data-testid="boost-write-save" className="h-9 rounded-lg bg-brand px-4 text-[14px] font-medium text-white hover:bg-brand-strong disabled:opacity-60">Save Limits</button>{saved && <span className="inline-flex items-center gap-1 pb-2 text-[13px] text-good"><CheckCircle2 className="size-4" />Saved</span>}</div>
      </div>
      <p className="mt-2 text-[12.5px] text-ink-3">The second limit counts the daily budgets of boosts started here that are still running. Stopping a boost frees its share.</p>
      <h4 className="mt-5 text-[13px] font-semibold tracking-wide text-ink-3 uppercase">What The App Sent To TikTok</h4>
      {actions.length === 0 ? <p className="mt-2 text-[14px] text-ink-3">Nothing yet.</p> : (
        <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[640px] border-collapse text-[13px]" data-testid="boost-write-log">
          <thead><tr className="border-y border-line bg-surface-2/60 text-left text-[12px] font-semibold tracking-wide text-ink-3 uppercase"><th className="py-2 pr-3">When</th><th className="py-2 pr-3">Who</th><th className="py-2 pr-3">What</th><th className="py-2 pr-3">Video</th><th className="py-2 pr-3 text-right">Budget A Day</th><th className="py-2">TikTok&apos;s Answer</th></tr></thead>
          <tbody>{actions.map((a) => <tr key={a.id} className="border-b border-line align-top"><td className="py-2 pr-3 whitespace-nowrap text-ink-2">{fmtDateTimeKL(a.at)}</td><td className="py-2 pr-3 text-ink-2">{a.user ?? "–"}</td><td className="py-2 pr-3">{a.action === "create" ? "Create boost" : "Stop boost"}</td><td className="py-2 pr-3 font-mono text-[12px] text-ink-2">{a.itemId ?? "–"}</td><td className="tnum py-2 pr-3 text-right">{a.budget != null ? rm(a.budget) : "–"}</td><td className={cn("py-2", a.ok ? "text-good" : "text-critical")}>{a.ok ? "OK" : "Refused"}: <span className="text-ink-2">{a.message}</span></td></tr>)}</tbody>
        </table></div>
      )}
    </section>
  );
}
