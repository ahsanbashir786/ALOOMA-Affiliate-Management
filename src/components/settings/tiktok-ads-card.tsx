"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Copy, Loader2, Plug, RefreshCw, ShieldCheck, Unplug, XCircle } from "lucide-react";
import { disconnectTikTokAds } from "@/app/actions/tiktok-ads";
import { cn } from "@/lib/utils";

type Check = { name: string; ok: boolean; message: string; count: number | null; fields: string[] | null; sample: string | null };
export type TikTokAdsView = { configured: boolean; connected: boolean; connectedLabel: string | null; accounts: { id: string; name: string | null; currency: string | null }[]; shops: number; permissions: number; redirectUri: string };

const Code = ({ children }: { children: React.ReactNode }) => <code className="rounded bg-surface px-1.5 py-0.5 text-[12.5px]">{children}</code>;

export function TikTokAdsActions({ v }: { v: TikTokAdsView }) {
  const [pending, start] = useTransition();
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [copied, setCopied] = useState(false);

  const check = () => start(async () => {
    setErr(null); setChecks(null);
    const r = await fetch("/api/tiktok-ads/test", { method: "POST" });
    const j = (await r.json().catch(() => null)) as { checks?: Check[]; at?: string; error?: string } | null;
    if (!r.ok || !j?.checks) setErr(j?.error ?? "The check could not run.");
    else { setChecks(j.checks); setCheckedAt(j.at ?? null); }
  });
  const failed = checks?.filter((c) => !c.ok).length ?? 0;
  const names = v.accounts.map((a) => a.name ?? a.id);
  const title = v.connected ? (names.length ? names.slice(0, 2).join(", ") + (names.length > 2 ? ` +${names.length - 2}` : "") : "TikTok Ads") : "TikTok Ads is not connected";

  return (
    <div className="space-y-5" data-testid="tiktok-ads-card">
      <div className="flex flex-wrap items-center gap-4">
        <span className={cn("flex size-12 items-center justify-center rounded-2xl", v.connected ? "bg-good-soft text-good" : "bg-surface-2 text-ink-3")}>{v.connected ? <ShieldCheck className="size-6" /> : <Plug className="size-6" />}</span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2.5">
            <span className="text-[17px] font-semibold text-ink">{title}</span>
            <span data-testid="tiktok-ads-status" className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12.5px] font-semibold", v.connected ? "bg-good-soft text-good" : v.configured ? "bg-warn-soft text-warn" : "bg-critical-soft text-critical")}>
              <span className={cn("size-1.5 rounded-full", v.connected ? "bg-good" : v.configured ? "bg-warn" : "bg-critical")} />{v.connected ? "Connected" : v.configured ? "Not connected" : "Setup needed"}
            </span>
          </p>
          <p className="mt-0.5 text-[13.5px] text-ink-3">{v.connected ? "The system reads your GMV Max campaigns, creatives and daily results from TikTok Ads." : "Connect once; your GMV Max results then sync by themselves."}</p>
        </div>
      </div>

      {v.connected && (
        <dl className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-line p-3.5"><dt className="text-[12.5px] text-ink-3">Connected on</dt><dd className="mt-0.5 text-[15px] font-semibold text-ink">{v.connectedLabel ?? "–"}</dd></div>
          <div className="rounded-xl border border-line p-3.5"><dt className="text-[12.5px] text-ink-3">Ad accounts</dt><dd className="mt-0.5 text-[15px] font-semibold text-ink">{v.accounts.length}{v.shops > 0 && <span className="ml-1.5 text-[12.5px] font-normal text-ink-3">· {v.shops} shop{v.shops === 1 ? "" : "s"}</span>}</dd></div>
          <div className="rounded-xl border border-line p-3.5"><dt className="text-[12.5px] text-ink-3">Login</dt><dd className="mt-0.5 text-[15px] font-semibold text-ink">Saved, encrypted<span className="ml-1.5 text-[12.5px] font-normal text-ink-3">no expiry date</span></dd></div>
        </dl>
      )}
      {v.connected && v.accounts.length > 0 && (
        <ul className="flex flex-wrap gap-2" data-testid="tiktok-ads-accounts">
          {v.accounts.map((a) => <li key={a.id} title={a.id} className="rounded-full border border-line-strong bg-surface-2 px-3 py-1 text-[13px] text-ink-2">{a.name ?? a.id}{a.currency ? ` · ${a.currency}` : ""}</li>)}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {v.configured && <a href="/api/tiktok-ads/connect" data-testid="tiktok-ads-connect" className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand px-4 text-[14px] font-medium text-white hover:bg-brand-strong">{v.connected ? <RefreshCw className="size-4" /> : <Plug className="size-4" />}{v.connected ? "Reconnect" : "Connect TikTok Ads"}</a>}
        {v.connected && <button data-testid="tiktok-ads-check" disabled={pending} onClick={check} className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong bg-surface px-4 text-[14px] font-medium text-ink hover:bg-surface-2 disabled:opacity-60">{pending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}{pending ? "Checking…" : "Check Connection"}</button>}
        {v.connected && !confirm && <button onClick={() => setConfirm(true)} className="ml-auto inline-flex h-10 items-center gap-2 rounded-lg px-3 text-[14px] font-medium text-ink-3 hover:bg-critical-soft hover:text-critical"><Unplug className="size-4" />Disconnect</button>}
        {v.connected && confirm && (
          <span className="ml-auto inline-flex items-center gap-2 rounded-lg border border-critical/30 bg-critical-soft/60 px-3 py-1.5 text-[13.5px] text-critical">
            Stop syncing from TikTok Ads?
            <button disabled={pending} onClick={() => start(async () => { await disconnectTikTokAds(); setChecks(null); setConfirm(false); })} className="rounded-md bg-critical px-2.5 py-1 text-[13px] font-semibold text-white">Yes, disconnect</button>
            <button onClick={() => setConfirm(false)} className="rounded-md px-2 py-1 text-[13px] text-ink-2 hover:bg-surface">Cancel</button>
          </span>
        )}
      </div>

      {err && <p role="alert" className="flex items-center gap-2 rounded-lg bg-critical-soft px-3.5 py-2.5 text-[13.5px] text-critical"><AlertTriangle className="size-4" />{err}</p>}
      {checks && (
        <div data-testid="tiktok-ads-checks" className="overflow-hidden rounded-xl border border-line">
          <p className={cn("flex items-center gap-2 px-4 py-2.5 text-[14px] font-semibold", failed ? "bg-warn-soft text-warn" : "bg-good-soft text-good")}>
            {failed ? <AlertTriangle className="size-4" /> : <CheckCircle2 className="size-4" />}{failed ? `${failed} of ${checks.length} checks failed` : "Everything answered"}
            {checkedAt && <span className="ml-auto text-[12.5px] font-normal text-ink-3">{new Date(checkedAt).toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit" })}</span>}
          </p>
          <ul className="divide-y divide-line">
            {checks.map((c) => (
              <li key={c.name} className="px-4 py-2.5">
                <div className="flex items-start gap-3">
                  {c.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-good" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-critical" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-medium text-ink">{c.name}{c.ok && c.count != null && <span className="ml-2 text-[12.5px] font-normal text-ink-3">{c.count} record{c.count === 1 ? "" : "s"}</span>}</p>
                    {!c.ok && <p className="mt-0.5 text-[13px] break-words text-critical">{c.message}</p>}
                    {c.ok && c.fields && c.fields.length > 0 && (
                      <details className="mt-1 text-[12.5px]">
                        <summary className="flex cursor-pointer items-center gap-1 text-ink-3 hover:text-brand">What TikTok sent <ChevronDown className="size-3.5" /></summary>
                        <p className="mt-1.5 flex flex-wrap gap-1.5">{c.fields.map((f) => <span key={f} className="rounded bg-surface-2 px-1.5 py-0.5 text-[11.5px] text-ink-2">{f}</span>)}</p>
                        {c.sample && <pre className="mt-1.5 max-h-48 overflow-auto rounded-lg bg-surface-2 p-2.5 text-[11.5px] leading-snug break-all whitespace-pre-wrap text-ink-2">{c.sample}</pre>}
                      </details>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!v.configured && (
        <div className="rounded-xl border border-line bg-surface-2/60 p-4">
          <p className="mb-2.5 text-[14px] font-semibold text-ink">Finish the setup on the server</p>
          <ol className="space-y-2.5 text-[14px] text-ink-2">
            <li>1. Add <Code>TIKTOK_ADS_APP_ID</Code> and <Code>TIKTOK_ADS_APP_SECRET</Code> (from the app page in TikTok API for Business) to the private <Code>.env</Code> file.</li>
            <li>2. Restart the app, then come back here and press <b>Connect TikTok Ads</b>.</li>
          </ol>
          <p className="mt-3 text-[12.5px] text-ink-3">Never paste the app secret anywhere except the server&apos;s <code>.env</code> file. Details: docs/TIKTOK-ADS-API.md.</p>
        </div>
      )}
      <details className="rounded-xl border border-line px-4 py-3 text-[13.5px] text-ink-2">
        <summary className="cursor-pointer font-medium text-ink">Redirect address for the TikTok app</summary>
        <p className="mt-2 text-[13px] text-ink-3">TikTok sends you back to this address after you approve. It must be saved in your app in TikTok API for Business exactly as written (no extra slash).</p>
        <div className="mt-2 flex items-center gap-2">
          <code data-testid="tiktok-ads-redirect" className="min-w-0 flex-1 rounded-lg bg-surface-2 px-3 py-2 text-[12.5px] break-all">{v.redirectUri}</code>
          <button type="button" onClick={() => { void navigator.clipboard?.writeText(v.redirectUri); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line-strong px-3 text-[13px] font-medium hover:bg-surface-2"><Copy className="size-3.5" />{copied ? "Copied" : "Copy"}</button>
        </div>
      </details>
    </div>
  );
}
