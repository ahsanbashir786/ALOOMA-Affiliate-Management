"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Loader2, Plug, RefreshCw, ShieldCheck, Unplug, XCircle } from "lucide-react";
import { disconnectTikTok } from "@/app/actions/tiktok";
import { cn } from "@/lib/utils";

type Check = { name: string; ok: boolean; message: string; count: number | null };
export type TikTokView = { configured: boolean; hasAuthLink: boolean; connected: boolean; sellerName: string | null; shopName: string | null; region: string | null; scopes: string[]; connectedLabel: string | null; expiresLabel: string | null };

/** What each permission TikTok granted lets the system read, in plain words. */
const SCOPE_LABEL: Record<string, string> = {
  "seller.order.info": "Orders",
  "seller.product.basic": "Products",
  "seller.return_refund.basic": "Returns and refunds",
  "seller.logistics": "Shipping and logistics",
  "seller.fulfillment.basic": "Fulfilment",
  "seller.authorization.info": "Shop authorization",
  "seller.affiliate_collaboration.read": "Affiliate collaborations",
  "seller.creator_marketplace.read": "Creator marketplace",
  "data.shop_analytics.public.read": "Shop analytics (videos, LIVE, products)",
  "data.bestselling.public.read": "Best sellers",
};
const scopeLabel = (s: string) => SCOPE_LABEL[s] ?? s;

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return <li className="flex gap-3"><span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[12.5px] font-semibold text-brand-strong">{n}</span><span className="pt-0.5 text-[14px] text-ink-2">{children}</span></li>;
}

export function TikTokActions({ v }: { v: TikTokView }) {
  const [pending, start] = useTransition();
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [showScopes, setShowScopes] = useState(false);

  const check = () => start(async () => {
    setErr(null); setChecks(null);
    const r = await fetch("/api/tiktok/test", { method: "POST" });
    const j = (await r.json().catch(() => null)) as { checks?: Check[]; at?: string; error?: string } | null;
    if (!r.ok || !j?.checks) setErr(j?.error ?? "The check could not run.");
    else { setChecks(j.checks); setCheckedAt(j.at ?? null); }
  });
  const failed = checks?.filter((c) => !c.ok).length ?? 0;
  const shop = [v.shopName ?? v.sellerName, v.region].filter(Boolean).join(" · ");

  return (
    <div className="space-y-5" data-testid="tiktok-card">
      {/* status */}
      <div className="flex flex-wrap items-center gap-4">
        <span className={cn("flex size-12 items-center justify-center rounded-2xl", v.connected ? "bg-good-soft text-good" : "bg-surface-2 text-ink-3")}>{v.connected ? <ShieldCheck className="size-6" /> : <Plug className="size-6" />}</span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2.5">
            <span className="text-[17px] font-semibold text-ink">{v.connected ? (shop || "TikTok Shop") : "TikTok Shop is not connected"}</span>
            <span data-testid="tiktok-status" className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12.5px] font-semibold", v.connected ? "bg-good-soft text-good" : v.configured ? "bg-warn-soft text-warn" : "bg-critical-soft text-critical")}>
              <span className={cn("size-1.5 rounded-full", v.connected ? "bg-good" : v.configured ? "bg-warn" : "bg-critical")} />{v.connected ? "Connected" : v.configured ? "Not connected" : "Setup needed"}
            </span>
          </p>
          <p className="mt-0.5 text-[13.5px] text-ink-3">{v.connected ? "The system reads your shop's data. It can never change anything in your shop." : "Connect once; orders, products, videos and samples then sync by themselves."}</p>
        </div>
      </div>

      {v.connected && (
        <dl className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-line p-3.5"><dt className="text-[12.5px] text-ink-3">Connected on</dt><dd className="mt-0.5 text-[15px] font-semibold text-ink">{v.connectedLabel ?? "–"}</dd></div>
          <div className="rounded-xl border border-line p-3.5"><dt className="text-[12.5px] text-ink-3">Access renews</dt><dd className="mt-0.5 text-[15px] font-semibold text-ink">{v.expiresLabel ?? "–"}<span className="ml-1.5 text-[12.5px] font-normal text-ink-3">automatic</span></dd></div>
          <button type="button" onClick={() => setShowScopes((x) => !x)} aria-expanded={showScopes} className="rounded-xl border border-line p-3.5 text-left hover:bg-surface-2">
            <dt className="text-[12.5px] text-ink-3">Allowed to read</dt>
            <dd className="mt-0.5 flex items-center justify-between text-[15px] font-semibold text-ink">{v.scopes.length} permission{v.scopes.length === 1 ? "" : "s"}<ChevronDown className={cn("size-4 text-ink-3 transition-transform", showScopes && "rotate-180")} /></dd>
          </button>
        </dl>
      )}
      {v.connected && showScopes && (
        <ul className="flex flex-wrap gap-2" data-testid="tiktok-scopes">
          {v.scopes.map((s) => <li key={s} title={s} className="rounded-full border border-line-strong bg-surface-2 px-3 py-1 text-[13px] text-ink-2">{scopeLabel(s)}</li>)}
        </ul>
      )}

      {/* actions */}
      <div className="flex flex-wrap items-center gap-2">
        {v.configured && v.hasAuthLink && <a href="/api/tiktok/connect" className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand px-4 text-[14px] font-medium text-white hover:bg-brand-strong">{v.connected ? <RefreshCw className="size-4" /> : <Plug className="size-4" />}{v.connected ? "Reconnect" : "Connect TikTok Shop"}</a>}
        {v.connected && <button data-testid="tiktok-check" disabled={pending} onClick={check} className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong bg-surface px-4 text-[14px] font-medium text-ink hover:bg-surface-2 disabled:opacity-60">{pending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}{pending ? "Checking…" : "Check Connection"}</button>}
        {v.connected && !confirm && <button onClick={() => setConfirm(true)} className="ml-auto inline-flex h-10 items-center gap-2 rounded-lg px-3 text-[14px] font-medium text-ink-3 hover:bg-critical-soft hover:text-critical"><Unplug className="size-4" />Disconnect</button>}
        {v.connected && confirm && (
          <span className="ml-auto inline-flex items-center gap-2 rounded-lg border border-critical/30 bg-critical-soft/60 px-3 py-1.5 text-[13.5px] text-critical">
            Stop syncing from TikTok?
            <button disabled={pending} onClick={() => start(async () => { await disconnectTikTok(); setChecks(null); setConfirm(false); })} className="rounded-md bg-critical px-2.5 py-1 text-[13px] font-semibold text-white">Yes, disconnect</button>
            <button onClick={() => setConfirm(false)} className="rounded-md px-2 py-1 text-[13px] text-ink-2 hover:bg-surface">Cancel</button>
          </span>
        )}
      </div>

      {err && <p role="alert" className="flex items-center gap-2 rounded-lg bg-critical-soft px-3.5 py-2.5 text-[13.5px] text-critical"><AlertTriangle className="size-4" />{err}</p>}
      {checks && (
        <div data-testid="tiktok-checks" className="overflow-hidden rounded-xl border border-line">
          <p className={cn("flex items-center gap-2 px-4 py-2.5 text-[14px] font-semibold", failed ? "bg-warn-soft text-warn" : "bg-good-soft text-good")}>
            {failed ? <AlertTriangle className="size-4" /> : <CheckCircle2 className="size-4" />}{failed ? `${failed} of ${checks.length} checks failed` : "Everything answered"}
            {checkedAt && <span className="ml-auto text-[12.5px] font-normal text-ink-3">{new Date(checkedAt).toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit" })}</span>}
          </p>
          <ul className="divide-y divide-line">
            {checks.map((c) => (
              <li key={c.name} className="flex items-start gap-3 px-4 py-2.5">
                {c.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-good" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-critical" />}
                <div className="min-w-0"><p className="text-[14px] font-medium text-ink">{c.name}</p>{!c.ok && <p className="mt-0.5 text-[13px] break-words text-critical">{c.message}</p>}</div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* setup help, only when something is missing */}
      {(!v.configured || !v.hasAuthLink) && (
        <div className="rounded-xl border border-line bg-surface-2/60 p-4">
          <p className="mb-2.5 text-[14px] font-semibold text-ink">Finish the setup on the server</p>
          <ol className="space-y-2.5">
            {!v.configured && <Step n={1}>Add <code className="rounded bg-surface px-1.5 py-0.5 text-[12.5px]">TIKTOK_APP_KEY</code> and <code className="rounded bg-surface px-1.5 py-0.5 text-[12.5px]">TIKTOK_APP_SECRET</code> to the private <code className="rounded bg-surface px-1.5 py-0.5 text-[12.5px]">.env</code> file.</Step>}
            {v.configured && !v.hasAuthLink && <Step n={1}>Add <code className="rounded bg-surface px-1.5 py-0.5 text-[12.5px]">TIKTOK_SERVICE_ID</code> (the app ID in TikTok Partner Center) to <code className="rounded bg-surface px-1.5 py-0.5 text-[12.5px]">.env</code>.</Step>}
            <Step n={2}>Restart the app, then come back here and press <b>Connect TikTok Shop</b>.</Step>
          </ol>
          <p className="mt-3 text-[12.5px] text-ink-3">Never paste the app secret anywhere except the server&apos;s <code>.env</code> file. Details: docs/TIKTOK-API.md.</p>
        </div>
      )}
    </div>
  );
}
