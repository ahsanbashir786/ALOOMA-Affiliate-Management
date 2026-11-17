"use client";

import { useEffect, useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Copy, Loader2, Plug, RefreshCw, ShieldCheck, Unplug, XCircle } from "lucide-react";
import { disconnectShopee, getShopeeSyncView, startShopeeSync, type ShopeeSyncView } from "@/app/actions/shopee";
import { cn } from "@/lib/utils";
import { InfoTip } from "@/components/ui/info-tip";

type Check = { name: string; ok: boolean; message: string; count: number | null; fields: string[] | null; sample: string | null };
export type ShopeeView = {
  configured: boolean; connected: boolean; env: "sandbox" | "live"; shopName: string | null; shopId: string | null; region: string | null;
  connectedLabel: string | null; accessLabel: string | null; refreshLabel: string | null; redirectUri: string; redirectDomain: string;
  sync: ShopeeSyncView | null;
};

const Code = ({ children }: { children: React.ReactNode }) => <code className="rounded bg-surface px-1.5 py-0.5 text-[12.5px]">{children}</code>;

export function ShopeeActions({ v }: { v: ShopeeView }) {
  const [pending, start] = useTransition();
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (id: string, text: string) => { void navigator.clipboard?.writeText(text); setCopied(id); setTimeout(() => setCopied(null), 1500); };

  const check = () => start(async () => {
    setErr(null); setChecks(null);
    const r = await fetch("/api/shopee/test", { method: "POST" });
    const j = (await r.json().catch(() => null)) as { checks?: Check[]; at?: string; error?: string } | null;
    if (!r.ok || !j?.checks) setErr(j?.error ?? "The check could not run.");
    else { setChecks(j.checks); setCheckedAt(j.at ?? null); }
  });
  const failed = checks?.filter((c) => !c.ok).length ?? 0;
  const title = v.connected ? (v.shopName ?? (v.shopId ? `Shop ${v.shopId}` : "Shopee")) : "Shopee is not connected";

  return (
    <div className="space-y-5" data-testid="shopee-card">
      <div className="flex flex-wrap items-center gap-4">
        <span className={cn("flex size-12 items-center justify-center rounded-2xl", v.connected ? "bg-good-soft text-good" : "bg-surface-2 text-ink-3")}>{v.connected ? <ShieldCheck className="size-6" /> : <Plug className="size-6" />}</span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2.5">
            <span className="text-[17px] font-semibold text-ink">{title}</span>
            <span data-testid="shopee-status" className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12.5px] font-semibold", v.connected ? "bg-good-soft text-good" : v.configured ? "bg-warn-soft text-warn" : "bg-critical-soft text-critical")}>
              <span className={cn("size-1.5 rounded-full", v.connected ? "bg-good" : v.configured ? "bg-warn" : "bg-critical")} />{v.connected ? "Connected" : v.configured ? "Not connected" : "Setup needed"}
            </span>
            <span data-testid="shopee-env" className={cn("rounded-full px-2.5 py-0.5 text-[12.5px] font-semibold", v.env === "live" ? "bg-brand-soft text-brand-strong" : "bg-warn-soft text-warn")}>{v.env === "live" ? "Live" : "Sandbox (Test)"}</span>
          </p>
          <p className="mt-0.5 text-[13.5px] text-ink-3">{v.connected ? "The system reads this Shopee shop. Its orders and payments go into Profit And Loss next to TikTok." : "Connect once. The login then renews itself."}</p>
        </div>
      </div>

      {v.connected && (
        <dl className="grid gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-line p-3.5"><dt className="text-[12.5px] text-ink-3">Connected on</dt><dd className="mt-0.5 text-[15px] font-semibold text-ink">{v.connectedLabel ?? "–"}</dd></div>
          <div className="rounded-xl border border-line p-3.5"><dt className="text-[12.5px] text-ink-3">Shop ID</dt><dd className="mt-0.5 text-[15px] font-semibold text-ink">{v.shopId ?? "–"}{v.region && <span className="ml-1.5 text-[12.5px] font-normal text-ink-3">{v.region}</span>}</dd></div>
          <div className="rounded-xl border border-line p-3.5"><dt className="text-[12.5px] text-ink-3">Access login</dt><dd className="mt-0.5 text-[15px] font-semibold text-ink">{v.accessLabel ?? "–"}<span className="ml-1.5 text-[12.5px] font-normal text-ink-3">renews itself</span></dd></div>
          <div className="rounded-xl border border-line p-3.5"><dt className="text-[12.5px] text-ink-3">Valid until</dt><dd className="mt-0.5 text-[15px] font-semibold text-ink">{v.refreshLabel ?? "–"}<span className="ml-1.5 text-[12.5px] font-normal text-ink-3">extends on use</span></dd></div>
        </dl>
      )}

      {v.connected && v.sync && <ShopeeSyncPanel initial={v.sync} />}

      <div className="flex flex-wrap items-center gap-2">
        {v.configured && <a href="/api/shopee/connect" data-testid="shopee-connect" className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand px-4 text-[14px] font-medium text-white hover:bg-brand-strong">{v.connected ? <RefreshCw className="size-4" /> : <Plug className="size-4" />}{v.connected ? "Reconnect" : "Connect Shopee"}</a>}
        {v.connected && <button data-testid="shopee-check" disabled={pending} onClick={check} className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong bg-surface px-4 text-[14px] font-medium text-ink hover:bg-surface-2 disabled:opacity-60">{pending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}{pending ? "Checking…" : "Check Connection"}</button>}
        {v.connected && !confirm && <button onClick={() => setConfirm(true)} className="ml-auto inline-flex h-10 items-center gap-2 rounded-lg px-3 text-[14px] font-medium text-ink-3 hover:bg-critical-soft hover:text-critical"><Unplug className="size-4" />Disconnect</button>}
        {v.connected && confirm && (
          <span className="ml-auto inline-flex items-center gap-2 rounded-lg border border-critical/30 bg-critical-soft/60 px-3 py-1.5 text-[13.5px] text-critical">
            Stop reading from Shopee?
            <button disabled={pending} onClick={() => start(async () => { await disconnectShopee(); setChecks(null); setConfirm(false); })} className="rounded-md bg-critical px-2.5 py-1 text-[13px] font-semibold text-white">Yes, disconnect</button>
            <button onClick={() => setConfirm(false)} className="rounded-md px-2 py-1 text-[13px] text-ink-2 hover:bg-surface">Cancel</button>
          </span>
        )}
      </div>

      {err && <p role="alert" className="flex items-center gap-2 rounded-lg bg-critical-soft px-3.5 py-2.5 text-[13.5px] text-critical"><AlertTriangle className="size-4" />{err}</p>}
      {checks && (
        <div data-testid="shopee-checks" className="overflow-hidden rounded-xl border border-line">
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
                        <summary className="flex cursor-pointer items-center gap-1 text-ink-3 hover:text-brand">What Shopee sent <ChevronDown className="size-3.5" /></summary>
                        <p className="mt-1.5 flex flex-wrap gap-1.5">{c.fields.map((f) => <span key={f} className="rounded bg-surface-2 px-1.5 py-0.5 text-[11.5px] text-ink-2">{f}</span>)}</p>
                        {c.sample && <pre className="mt-1.5 max-h-72 overflow-auto rounded-lg bg-surface-2 p-2.5 text-[11.5px] leading-snug break-all whitespace-pre-wrap text-ink-2">{c.sample}</pre>}
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
          <p className="mb-2.5 flex items-center gap-1.5 text-[14px] font-semibold text-ink">Finish the setup on the server<InfoTip>Never paste the partner key anywhere except the server&apos;s .env file. Details: docs/SHOPEE.md.</InfoTip></p>
          <ol className="space-y-2.5 text-[14px] text-ink-2">
            <li>1. Add <Code>SHOPEE_PARTNER_ID</Code> and <Code>SHOPEE_PARTNER_KEY</Code> (from the app page in the Shopee Open Platform Console) to the private <Code>.env</Code> file. Use <Code>SHOPEE_ENV=sandbox</Code> while the app is Developing and <Code>live</Code> after Shopee approves it.</li>
            <li>2. Restart the app, then come back here and press <b>Connect Shopee</b>.</li>
          </ol>
        </div>
      )}
      <details className="rounded-xl border border-line px-4 py-3 text-[13.5px] text-ink-2">
        <summary className="cursor-pointer font-medium text-ink">Addresses for the Shopee app <InfoTip>Shopee&apos;s app page asks for the redirect <b>domain</b> (no path). Shopee sends you back to the full redirect address after you approve.</InfoTip></summary>
        {([["Redirect domain", "domain", v.redirectDomain], ["Redirect address used", "full", v.redirectUri]] as const).map(([label, id, value]) => (
          <div key={id} className="mt-2">
            <p className="text-[12.5px] text-ink-3">{label}</p>
            <div className="mt-1 flex items-center gap-2">
              <code data-testid={`shopee-${id}`} className="min-w-0 flex-1 rounded-lg bg-surface-2 px-3 py-2 text-[12.5px] break-all">{value}</code>
              <button type="button" onClick={() => copy(id, value)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line-strong px-3 text-[13px] font-medium hover:bg-surface-2"><Copy className="size-3.5" />{copied === id ? "Copied" : "Copy"}</button>
            </div>
          </div>
        ))}
      </details>
    </div>
  );
}

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-MY", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "Not yet");

/** Orders and payments: what has been read from Shopee, a Sync Now button, and a way to read further back. */
export function ShopeeSyncPanel({ initial }: { initial: ShopeeSyncView }) {
  const [v, setV] = useState(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [days, setDays] = useState("365");
  const [pending, start] = useTransition();
  // While a sync runs, look again every 3 seconds.
  useEffect(() => {
    if (!v.running) return;
    const t = setInterval(() => { getShopeeSyncView().then(setV).catch(() => {}); }, 3000);
    return () => clearInterval(t);
  }, [v.running]);
  const run = (d?: number) => start(async () => {
    setMsg(null);
    const r = await startShopeeSync(d);
    if (!r.started) setMsg(r.message);
    setV(await getShopeeSyncView());
  });
  const tile = "rounded-xl border border-line p-3.5";
  return (
    <div className="space-y-3" data-testid="shopee-sync">
      <p className="flex items-center gap-1.5 text-[14.5px] font-semibold text-ink">Orders And Payments
        <InfoTip>Orders are read every 30 minutes, with the SKU and quantity of each item. Payments are what Shopee pays out for each order and every fee it takes. Both go into Profit And Loss next to TikTok.</InfoTip>
      </p>
      <dl className="grid gap-3 sm:grid-cols-4">
        <div className={tile}><dt className="text-[12.5px] text-ink-3">Orders Read</dt><dd data-testid="shopee-orders-count" className="mt-0.5 text-[15px] font-semibold text-ink">{v.orders.toLocaleString("en-MY")}</dd><dd className="text-[12.5px] text-ink-3">{v.firstOrder ? `${v.firstOrder} to ${v.lastOrder}` : "None yet"}</dd></div>
        <div className={tile}><dt className="text-[12.5px] text-ink-3">Payments Read</dt><dd className="mt-0.5 text-[15px] font-semibold text-ink">{v.payments.toLocaleString("en-MY")}</dd><dd className="text-[12.5px] text-ink-3">{v.awaiting ? `${v.awaiting.toLocaleString("en-MY")} orders waiting for Shopee` : "Nothing waiting"}</dd></div>
        <div className={tile}><dt className="text-[12.5px] text-ink-3">Last Orders Sync</dt><dd className="mt-0.5 text-[15px] font-semibold text-ink">{when(v.ordersAt)}</dd></div>
        <div className={tile}><dt className="text-[12.5px] text-ink-3">Last Payments Sync</dt><dd className="mt-0.5 text-[15px] font-semibold text-ink">{when(v.escrowAt)}</dd></div>
      </dl>
      {v.error && <p role="alert" data-testid="shopee-sync-error" className="flex items-start gap-2 rounded-lg bg-critical-soft px-3.5 py-2.5 text-[13.5px] break-words text-critical"><AlertTriangle className="mt-0.5 size-4 shrink-0" />{v.error}</p>}
      {msg && <p className="text-[13.5px] text-ink-2">{msg}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button data-testid="shopee-sync-now" disabled={pending || v.running} onClick={() => run()} className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand px-4 text-[14px] font-medium text-white hover:bg-brand-strong disabled:opacity-60">
          {v.running ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}{v.running ? "Syncing…" : "Sync Now"}
        </button>
        <span className="ml-2 flex items-center gap-2 text-[13.5px] text-ink-2">Read back
          <input value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ""))} inputMode="numeric" aria-label="Days to read back" className="h-9 w-[72px] rounded-md border border-line-strong bg-surface px-2 text-center text-[13.5px]" />days
          <button data-testid="shopee-sync-older" disabled={pending || v.running || !Number(days)} onClick={() => run(Number(days))} className="inline-flex h-9 items-center rounded-lg border border-line-strong bg-surface px-3 text-[13.5px] font-medium text-ink-2 hover:bg-surface-2 disabled:opacity-60">Load History</button>
        </span>
      </div>
    </div>
  );
}
