"use client";

import { useState, useTransition } from "react";
import { Check, ClipboardCopy, Eye, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { checkAlertsNow, markAlert, saveAlertRetention } from "@/app/actions/alerts";

const btn = "inline-flex h-8 items-center gap-1.5 rounded-md border border-line-strong bg-surface px-2.5 text-[13px] font-medium text-ink-2 hover:bg-surface-2 disabled:opacity-60";

/** What a person can do with one alert: keep it listed but stop it counting on the bell (Seen), or clear an error until it happens again. */
export function AlertButtons({ alertKey, status, clearable }: { alertKey: string; status: "open" | "seen"; clearable: boolean }) {
  const [pending, start] = useTransition();
  return (
    <span className="inline-flex items-center gap-1.5">
      {status === "open" && <button type="button" disabled={pending} onClick={() => start(async () => { await markAlert(alertKey, "seen"); })} className={btn} data-testid="alert-seen"><Eye className="size-3.5" />Seen</button>}
      {clearable && <button type="button" disabled={pending} onClick={() => start(async () => { await markAlert(alertKey, "resolved"); })} className={btn} data-testid="alert-clear"><Trash2 className="size-3.5" />Clear</button>}
      {pending && <Loader2 className="size-4 animate-spin text-ink-3" />}
    </span>
  );
}

export function AlertToolbar() {
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState<"idle" | "ok" | "fail">("idle");
  const copy = async () => {
    try {
      const r = await fetch("/api/alerts/report", { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      await navigator.clipboard.writeText(await r.text());
      setCopied("ok");
    } catch { setCopied("fail"); }
    setTimeout(() => setCopied("idle"), 2500);
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" disabled={pending} onClick={() => start(async () => { await checkAlertsNow(); })} className={btn} data-testid="alerts-check">{pending ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}Check Now</button>
      <button type="button" onClick={copy} className={btn} data-testid="alerts-report">{copied === "ok" ? <Check className="size-3.5 text-good" /> : <ClipboardCopy className="size-3.5" />}{copied === "ok" ? "Copied. Paste it to the developer" : copied === "fail" ? "Could not copy" : "Copy Diagnostic Report"}</button>
    </div>
  );
}

/** "Keep alerts for N days": how long an alert stays in the history after its problem has gone. */
export function RetentionForm({ days }: { days: number }) {
  const [v, setV] = useState(String(days));
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const n = Number(v);
  const valid = Number.isFinite(n) && n >= 1 && n <= 365;
  return (
    <form className="flex items-center gap-2 text-[13px] text-ink-2" data-testid="retention-form"
      onSubmit={(e) => { e.preventDefault(); if (!valid) return; start(async () => { const r = await saveAlertRetention(n); if (r.ok) { setV(String(r.days)); setSaved(true); setTimeout(() => setSaved(false), 2000); } }); }}>
      <label htmlFor="retention-days">Keep alerts for</label>
      <input id="retention-days" data-testid="retention-input" type="number" min={1} max={365} value={v} onChange={(e) => { setV(e.target.value); setSaved(false); }} className="h-8 w-[68px] rounded-md border border-line-strong bg-surface px-2 text-center text-[13px] text-ink" />
      <span>days</span>
      <button type="submit" disabled={pending || !valid} data-testid="retention-save" className={btn}>{pending ? <Loader2 className="size-3.5 animate-spin" /> : saved ? <Check className="size-3.5 text-good" /> : null}{saved ? "Saved" : "Save"}</button>
    </form>
  );
}
