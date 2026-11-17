"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, ShieldQuestion, XCircle } from "lucide-react";
import { getShopeeSyncView, startShopeeSync, type ShopeeSyncView } from "@/app/actions/shopee";
import { Card } from "@/components/ui/primitives";
import { InfoTip } from "@/components/ui/info-tip";
import { cn } from "@/lib/utils";

type Access = { name: string; ok: boolean; message: string; count: number | null; fields: string[] | null };

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-MY", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "Not yet");

/** Data Sync → Shopee: every part of Shopee that is read, when it last ran, what went wrong, and which parts the app may use. */
export function ShopeeSyncBoard({ initial, connected, configured, canRun }: { initial: ShopeeSyncView; connected: boolean; configured: boolean; canRun: boolean }) {
  const [v, setV] = useState(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [days, setDays] = useState("365");
  const [access, setAccess] = useState<{ at: string; checks: Access[] } | null>(null);
  const [checking, setChecking] = useState(false);
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
  const check = async () => {
    setChecking(true); setAccess(null);
    const r = await fetch("/api/shopee/access", { method: "POST" });
    const j = (await r.json().catch(() => null)) as { at?: string; checks?: Access[]; error?: string } | null;
    if (j?.checks) setAccess({ at: j.at ?? "", checks: j.checks }); else setMsg(j?.error ?? "The check could not run.");
    setChecking(false);
  };

  if (!connected) {
    return (
      <Card className="grid place-items-center px-6 py-16 text-center" data-testid="shopee-not-connected">
        <span className="grid size-14 place-items-center rounded-2xl bg-brand-soft text-brand"><ShieldQuestion className="size-7" /></span>
        <h2 className="mt-5 text-[22px] font-semibold text-ink">Connect Shopee First</h2>
        <p className="mt-1 max-w-md text-[14.5px] text-ink-3">{configured ? "Connect your shop in Settings, then come back here to read its data." : "The Shopee keys are not on the server yet. Finish the setup in Settings → Connection → Shopee."}</p>
        <Link href="/settings?tab=connection&src=shopee" className="mt-6 inline-flex h-10 items-center rounded-lg bg-brand px-5 text-[14.5px] font-medium text-white hover:opacity-90">Open Connection</Link>
      </Card>
    );
  }
  const refused = access?.checks.filter((c) => !c.ok).length ?? 0;
  return (
    <div className="space-y-4" data-testid="shopee-sync">
      <div className="flex flex-wrap items-center gap-2">
        {canRun && (
          <button data-testid="shopee-sync-now" disabled={pending || v.running} onClick={() => run()} className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand px-4 text-[14px] font-medium text-white hover:bg-brand-strong disabled:opacity-60">
            {v.running ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}{v.running ? "Syncing…" : "Sync Now"}
          </button>
        )}
        {canRun && (
          <span className="ml-1 flex items-center gap-2 text-[13.5px] text-ink-2">Read back
            <input value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ""))} inputMode="numeric" aria-label="Days to read back" className="h-9 w-[72px] rounded-md border border-line-strong bg-surface px-2 text-center text-[13.5px]" />days
            <button data-testid="shopee-sync-older" disabled={pending || v.running || !Number(days)} onClick={() => run(Number(days))} className="inline-flex h-9 items-center rounded-lg border border-line-strong bg-surface px-3 text-[13.5px] font-medium text-ink-2 hover:bg-surface-2 disabled:opacity-60">Load History</button>
          </span>
        )}
        <button data-testid="shopee-access" disabled={checking} onClick={check} className="ml-auto inline-flex h-9 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 text-[13.5px] font-medium text-ink-2 hover:bg-surface-2 disabled:opacity-60">
          {checking ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}Check What Shopee Allows
        </button>
      </div>
      {msg && <p className="text-[13.5px] text-ink-2">{msg}</p>}

      {access && (
        <div data-testid="shopee-access-result" className="overflow-hidden rounded-xl border border-line bg-surface">
          <p className={cn("flex items-center gap-2 px-4 py-2.5 text-[14px] font-semibold", refused ? "bg-warn-soft text-warn" : "bg-good-soft text-good")}>
            {refused ? <AlertTriangle className="size-4" /> : <CheckCircle2 className="size-4" />}{refused ? `${refused} of ${access.checks.length} parts are not open to this app` : "Every part answered"}
          </p>
          <ul className="divide-y divide-line">
            {access.checks.map((c) => (
              <li key={c.name} className="flex items-start gap-3 px-4 py-2.5">
                {c.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-good" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-critical" />}
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium text-ink">{c.name}{c.ok && c.count != null && <span className="ml-2 text-[12.5px] font-normal text-ink-3">{c.count} record{c.count === 1 ? "" : "s"} in the test</span>}</p>
                  {!c.ok && <p className="mt-0.5 text-[13px] break-words text-critical">{c.message}</p>}
                  {c.ok && c.fields && c.fields.length > 0 && <p className="mt-1 flex flex-wrap gap-1.5">{c.fields.map((f) => <span key={f} className="rounded bg-surface-2 px-1.5 py-0.5 text-[11.5px] text-ink-2">{f}</span>)}</p>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <section aria-label="Shopee data" className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
        {v.datasets.map((d) => (
          <Card key={d.key} className="p-4" data-testid={`shopee-ds-${d.key}`}>
            <div className="flex items-start justify-between gap-2">
              <p className="flex items-center gap-1.5 text-[15px] font-semibold text-ink">{d.label}<InfoTip>{d.what}</InfoTip></p>
              {d.error ? <span className="inline-flex items-center gap-1 rounded-full bg-critical-soft px-2 py-0.5 text-[12px] font-semibold text-critical"><XCircle className="size-3.5" />Failed</span>
                : d.at ? <span className="inline-flex items-center gap-1 rounded-full bg-good-soft px-2 py-0.5 text-[12px] font-semibold text-good"><CheckCircle2 className="size-3.5" />OK</span>
                : <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[12px] font-semibold text-ink-3">Not Yet</span>}
            </div>
            <p className="tnum mt-2 text-[24px] leading-7 font-semibold tracking-tight text-ink" data-testid={`shopee-ds-${d.key}-count`}>{d.records.toLocaleString("en-MY")}</p>
            <p className="mt-0.5 text-[12.5px] text-ink-3">Last sync: {when(d.at)}</p>
            {d.key === "wallet" && v.wallet && <p className="mt-1.5 text-[12.5px] text-ink-2" data-testid="shopee-wallet-summary">Last 30 days: in RM {v.wallet.moneyIn.toLocaleString("en-MY", { maximumFractionDigits: 2 })} · out RM {v.wallet.moneyOut.toLocaleString("en-MY", { maximumFractionDigits: 2 })}{v.wallet.balance != null ? ` · balance RM ${v.wallet.balance.toLocaleString("en-MY", { maximumFractionDigits: 2 })}` : ""}</p>}
            {d.key === "stock" && d.records > 0 && <p className="mt-1.5 text-[12.5px] text-ink-2">Shown in Stock And Costing → In Shopee Warehouse</p>}
            {d.error && <p role="alert" className="mt-2 rounded-md bg-critical-soft px-2.5 py-1.5 text-[12.5px] leading-snug break-words text-critical">{d.error}</p>}
          </Card>
        ))}
      </section>
    </div>
  );
}
