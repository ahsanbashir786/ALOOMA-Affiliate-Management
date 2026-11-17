"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, Banknote, CalendarCheck, CheckCircle2, Loader2, Package, RefreshCw, Rocket, ShoppingBag, Undo2, Wallet, XCircle } from "lucide-react";
import { setShopeeSyncSchedule } from "@/app/actions/shopee";
import { DOT, EVERY, ago, dmy, dur, fresh, inMin, span } from "@/components/sync/format";
import { InfoTip } from "@/components/ui/info-tip";
import { cn } from "@/lib/utils";
import type { ShopeeOverview } from "@/lib/shopee/sync";

type Access = { name: string; ok: boolean; message: string; count: number | null; fields: string[] | null };
const ICON: Record<string, React.ComponentType<{ className?: string }>> = { bag: ShoppingBag, wallet: Wallet, calendar: CalendarCheck, undo: Undo2, rocket: Rocket, bank: Banknote, package: Package };
const rm = (n: number) => `RM ${n.toLocaleString("en-MY", { maximumFractionDigits: 2 })}`;

/** Data Sync → Shopee. Same look as the TikTok and Ads boards: a status banner with Sync Now, one card per part, the history of runs, and data health. */
export function ShopeeSyncBoard({ initial, connected, configured, canAdmin, canRun, canConnect }: { initial: ShopeeOverview; connected: boolean; configured: boolean; canAdmin: boolean; canRun: boolean; canConnect: boolean }) {
  const [ov, setOv] = useState(initial);
  const [now, setNow] = useState(initial.now);
  const [starting, setStarting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [days, setDays] = useState("670");
  const [askDays, setAskDays] = useState(false);
  const [access, setAccess] = useState<{ checks: Access[] } | null>(null);
  const [checking, setChecking] = useState(false);
  const [pending, start] = useTransition();
  const startedAt = useRef(0);

  const refresh = useCallback(async () => {
    try { const r = await fetch("/api/shopee/sync", { cache: "no-store" }); if (r.ok) setOv((await r.json()) as ShopeeOverview); } catch {}
    setNow(Date.now());
  }, []);
  useEffect(() => {
    if (!connected) return;
    const t = setInterval(refresh, ov.running || starting ? 2000 : 30000);
    return () => clearInterval(t);
  }, [connected, ov.running, starting, refresh]);
  useEffect(() => { if (starting && (ov.running || Date.now() - startedAt.current > 8000)) setStarting(false); }, [ov.running, starting, now]);

  const run = async (dataset?: string, historyDays?: number) => {
    setErr(null); setStarting(true); startedAt.current = Date.now(); setAskDays(false);
    const r = await fetch("/api/shopee/sync", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ dataset, historyDays }) });
    if (!r.ok) { setStarting(false); setErr(((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? "Could not start the sync."); }
    else setTimeout(refresh, 600);
  };
  const check = async () => {
    setChecking(true); setAccess(null);
    const r = await fetch("/api/shopee/access", { method: "POST" });
    const j = (await r.json().catch(() => null)) as { checks?: Access[]; error?: string } | null;
    if (j?.checks) setAccess({ checks: j.checks }); else setErr(j?.error ?? "The check could not run.");
    setChecking(false);
  };

  if (!connected)
    return (
      <div className="grid place-items-center rounded-2xl border border-line bg-surface px-6 py-20 text-center" data-testid="shopee-not-connected">
        <span className="grid size-14 place-items-center rounded-2xl bg-brand-soft text-brand"><ShoppingBag className="size-7" /></span>
        <h2 className="mt-5 text-[22px] font-semibold text-ink">Connect Shopee</h2>
        <p className="mt-1 max-w-md text-[14.5px] text-ink-3">{configured ? "One click in Settings, and your Shopee orders, payments and ads sync by themselves." : "The Shopee keys are not on the server yet. Finish the setup in Settings → Connection → Shopee."}</p>
        {canConnect
          ? <Link href="/settings?tab=connection&src=shopee" className="mt-6 inline-flex h-10 items-center rounded-lg bg-brand px-5 text-[14.5px] font-medium text-white hover:opacity-90">Open Connection</Link>
          : <p className="mt-5 text-[13.5px] text-ink-3">Ask an admin to connect it in Settings.</p>}
      </div>
    );

  const busy = ov.running || starting;
  const failed = ov.datasets.filter((d) => d.lastError);
  const never = ov.datasets.every((d) => !d.lastSuccessAt);
  const state = busy ? "busy" : ov.needsReconnect || failed.length ? "warn" : never ? "new" : "ok";
  const runningNow = ov.datasets.find((d) => d.running)?.label;
  const orders = ov.datasets.find((d) => d.key === "orders");
  const stale = ov.datasets.filter((d) => d.lastSuccessAt && now - new Date(d.lastSuccessAt).getTime() > 24 * 3600_000);
  const refused = access?.checks.filter((c) => !c.ok) ?? [];
  const health: { title: string; text: string; tone: "good" | "warn" | "bad" }[] = [
    ov.needsReconnect ? { title: "Shopee Login Refused", text: "Shopee no longer accepts the saved login. Press Reconnect in Settings.", tone: "bad" }
      : failed.length ? { title: `${failed.length} Part${failed.length === 1 ? "" : "s"} Failed`, text: failed.map((d) => d.label).join(", "), tone: "bad" }
        : never ? { title: "Nothing Synced Yet", text: "Press Sync Now to read your Shopee data.", tone: "warn" } : { title: `All ${ov.datasets.length} Parts Synced`, text: "No errors in the latest syncs.", tone: "good" },
    stale.length ? { title: "Out Of Date", text: `${stale.map((d) => d.label).join(", ")} not synced for over a day.`, tone: "warn" } : { title: "Up To Date", text: ov.lastFullAt ? `Last sync ${ago(ov.lastFullAt, now).toLowerCase()}.` : "Waiting for the first sync.", tone: ov.lastFullAt ? "good" : "warn" },
    { title: "Orders", text: orders?.oldest ? `${orders.records.toLocaleString("en-MY")} orders from ${dmy(orders.oldest)} to ${dmy(orders.newest ?? orders.oldest)}.` : "No orders read yet. Use Load History to go back to February 2025.", tone: orders?.oldest ? "good" : "warn" },
    ov.walletSummary ? { title: "Wallet, Last 30 Days", text: `In ${rm(ov.walletSummary.moneyIn)} · out ${rm(ov.walletSummary.moneyOut)}${ov.walletSummary.balance != null ? ` · balance ${rm(ov.walletSummary.balance)}` : ""}.`, tone: "good" } : { title: "Wallet", text: "No wallet lines yet.", tone: "warn" },
    access ? (refused.length ? { title: `${refused.length} Part${refused.length === 1 ? "" : "s"} Not Open To This App`, text: refused.map((c) => c.name).join(", "), tone: "warn" } : { title: "Shopee Allows Everything We Read", text: "Every part answered the test.", tone: "good" }) : { title: "Access Not Checked", text: "Press Check What Shopee Allows to test each part.", tone: "warn" },
    { title: ov.settings.enabled ? "Auto-Sync Is On" : "Auto-Sync Is Off", text: ov.settings.enabled ? `Runs by itself every ${ov.settings.everyMinutes >= 60 ? `${ov.settings.everyMinutes / 60} h` : `${ov.settings.everyMinutes} min`}.` : "Data only updates when you press Sync Now.", tone: ov.settings.enabled ? "good" : "warn" },
  ];

  return (
    <div className="space-y-5" data-testid="shopee-sync">
      <section data-testid="shopee-hero" data-state={state} className="relative rounded-2xl bg-brand p-6 text-white sm:p-7">
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl"><div className="absolute -top-24 -right-16 size-72 rounded-full bg-white/10 blur-2xl" /></div>
        <div className="relative flex flex-wrap items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            <span className={cn("grid size-14 shrink-0 place-items-center rounded-2xl bg-white/15", busy && "animate-pulse")}>
              {busy ? <Loader2 className="size-7 animate-spin" /> : state === "warn" ? <AlertTriangle className="size-7 text-amber-200" /> : <CheckCircle2 className="size-7" />}
            </span>
            <div>
              <h2 className="text-[24px] leading-tight font-semibold">{busy ? `Syncing${runningNow ? ` ${runningNow}` : ""}…` : ov.needsReconnect ? "Reconnect Shopee" : state === "warn" ? "Needs Attention" : state === "new" ? "Ready For The First Sync" : "Everything Is Up To Date"}</h2>
              <p className="mt-0.5 text-[14px] text-white/75">
                {busy ? (ov.datasets.some((d) => d.progress) ? `${ov.datasets.reduce((a, d) => a + (d.progress ?? 0), 0).toLocaleString("en-MY")} records so far · you can keep working` : "You can keep working") : [ov.shop.name ?? (ov.shop.id ? `Shop ${ov.shop.id}` : null), ov.shop.region, ov.shop.env === "live" ? "Live" : "Sandbox"].filter(Boolean).join(" · ")}
                {!busy && ov.settings.enabled && ov.nextAt ? ` · next in ${inMin(ov.nextAt, now)}` : !busy && !ov.settings.enabled ? " · auto-sync off" : ""}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            {canAdmin && (
              <select aria-label="Auto-sync" value={ov.settings.enabled ? ov.settings.everyMinutes : 0} disabled={pending}
                onChange={(e) => { const v = Number(e.target.value); start(async () => { await setShopeeSyncSchedule(v); await refresh(); }); }}
                className="h-10 rounded-lg border border-white/30 bg-white/10 px-3 text-[14px] text-white focus:outline-none [&>option]:text-ink">
                {EVERY.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
            )}
            {ov.needsReconnect && canConnect && <Link href="/settings?tab=connection&src=shopee" className="inline-flex h-10 items-center rounded-lg border border-white/40 px-4 text-[14px] font-medium text-white hover:bg-white/10">Reconnect</Link>}
            <button data-testid="shopee-sync-now" disabled={busy || !canRun} title={canRun ? undefined : "Your role cannot run a sync"} onClick={() => run()} className="inline-flex h-10 items-center gap-2 rounded-lg bg-white px-5 text-[14.5px] font-semibold text-brand hover:bg-white/90 disabled:opacity-60">
              <RefreshCw className={cn("size-4", busy && "animate-spin")} /> Sync Now
            </button>
          </div>
        </div>
        {err && <p role="alert" className="relative mt-4 rounded-lg bg-white/15 px-3 py-2 text-[13.5px]">{err}</p>}
      </section>

      <section aria-label="Shopee data" className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        {ov.datasets.map((d) => {
          const Icon = ICON[d.icon] ?? Package;
          const f = fresh(d.lastSuccessAt, now);
          return (
            <article key={d.key} data-testid={`shopee-ds-${d.key}`} className={cn("group relative rounded-2xl border bg-surface p-4 transition-shadow hover:shadow-card", d.lastError ? "border-critical/40" : "border-line")}>
              <div className="flex items-start justify-between">
                <span className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand"><Icon className="size-5" /></span>
                <button aria-label={`Sync ${d.label}`} disabled={busy || !canRun} onClick={() => run(d.key)} className="rounded-lg p-1.5 text-ink-3 opacity-0 transition-opacity hover:bg-surface-2 hover:text-brand focus:opacity-100 group-hover:opacity-100 disabled:opacity-40">
                  <RefreshCw className={cn("size-4", d.running && "animate-spin")} />
                </button>
              </div>
              <p className="mt-3 flex items-center gap-1 text-[14px] font-medium text-ink-2">{d.label}<InfoTip>{d.what}</InfoTip></p>
              <p className="tnum text-[30px] leading-tight font-semibold text-ink" data-testid={`shopee-ds-${d.key}-count`}>{d.records.toLocaleString("en-MY")}</p>
              <div className="mt-2 flex items-center gap-2 text-[13px] text-ink-3">
                <span className={cn("size-2 rounded-full", DOT[f], d.running && "animate-pulse")} />
                {d.running ? `Syncing${d.progress ? ` · ${d.progress.toLocaleString("en-MY")}` : "…"}` : d.lastError ? <span className="text-critical" title={d.lastError}>Failed</span> : ago(d.lastSuccessAt, now)}
              </div>
              {d.oldest && <p className="mt-0.5 text-[12px] text-ink-3">{span(d.oldest, d.newest)}</p>}
              {d.lastError && <p role="alert" className="mt-1 line-clamp-4 text-[12px] leading-snug break-words text-critical">{d.lastError}</p>}
              {!d.lastError && d.note && <p className="mt-1 line-clamp-5 text-[12px] leading-snug break-words text-warn" title={d.note} data-testid={`shopee-note-${d.key}`}>{d.note}</p>}
              {d.key === "stock" && d.records > 0 && <p className="mt-1 text-[12px] text-ink-3">Shown in Stock And Costing</p>}
            </article>
          );
        })}
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section className="min-w-0 rounded-2xl border border-line bg-surface" aria-label="Sync history">
          <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-2">
            <div>
              <h3 className="text-[15px] font-semibold text-ink">Sync History</h3>
              <p className="text-[12.5px] text-ink-3">The latest runs, one line per part.</p>
            </div>
            {askDays ? (
              <span className="flex items-center gap-2 text-[12.5px] text-ink-2">Read back
                <input value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ""))} inputMode="numeric" aria-label="Days to read back" data-testid="shopee-history-days" className="h-8 w-[64px] rounded-md border border-line-strong bg-surface px-2 text-center text-[13px]" />days
                <button data-testid="shopee-history-go" disabled={busy || !canRun || !Number(days)} onClick={() => run(undefined, Number(days))} className="rounded-lg bg-brand px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-brand-strong disabled:opacity-50">Go</button>
              </span>
            ) : (
              <button data-testid="shopee-history" disabled={busy || !canRun} onClick={() => setAskDays(true)} title="Read the orders, payments, returns, ads and wallet further back (670 days goes back to February 2025)" className="rounded-lg border border-line-strong px-3 py-1.5 text-[12.5px] font-medium text-ink-2 hover:bg-surface-2 disabled:opacity-50">Load History</button>
            )}
          </div>
          {ov.runs.length === 0 ? <p className="px-5 pb-6 text-[14px] text-ink-3">Nothing yet.</p> : (
            <ul className="divide-y divide-line" data-testid="shopee-runs">
              {ov.runs.slice(0, 14).map((r) => (
                <li key={r.id} className="flex items-start gap-3 px-5 py-2.5">
                  <span className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", r.status === "failed" ? "bg-critical" : r.status === "running" ? "animate-pulse bg-brand" : r.error ? "bg-warn" : "bg-good")} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium text-ink">{r.label}</span>
                    <span className="block truncate text-[12.5px] text-ink-3">{r.trigger === "schedule" ? "Automatic" : `By ${r.by ?? "a team member"}`} · {ago(r.startedAt, now)}{r.durationSec != null ? ` · took ${dur(r.durationSec)}` : ""}</span>
                    {r.error && <span className={cn("mt-0.5 line-clamp-3 block text-[12.5px] leading-snug break-words", r.status === "failed" ? "text-critical" : "text-warn")}>{r.error}</span>}
                  </span>
                  <span className="tnum shrink-0 rounded-full bg-surface-2 px-2.5 py-0.5 text-[12.5px] font-medium text-ink-2">{r.status === "running" ? "Running…" : r.changed > 0 ? `${r.changed.toLocaleString("en-MY")} Updated` : "Nothing New"}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="min-w-0 rounded-2xl border border-line bg-surface p-5" aria-label="Data health" data-testid="shopee-health">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-[15px] font-semibold text-ink">Data Health</h3>
              <p className="text-[12.5px] text-ink-3">Is everything arriving from Shopee?</p>
            </div>
            <button data-testid="shopee-access" disabled={checking} onClick={check} className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong px-2.5 py-1.5 text-[12.5px] font-medium text-ink-2 hover:bg-surface-2 disabled:opacity-60">
              {checking ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}Check What Shopee Allows
            </button>
          </div>
          <ul className="mt-4 space-y-3.5">
            {health.map((h) => (
              <li key={h.title} className="flex items-start gap-3">
                {h.tone === "good" ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-good" /> : <AlertTriangle className={cn("mt-0.5 size-5 shrink-0", h.tone === "bad" ? "text-critical" : "text-warn")} />}
                <span className="min-w-0"><span className="block text-[14px] font-medium text-ink">{h.title}</span><span className="block text-[13px] text-ink-3">{h.text}</span></span>
              </li>
            ))}
          </ul>
          {access && (
            <ul className="mt-4 divide-y divide-line rounded-xl border border-line" data-testid="shopee-access-result">
              {access.checks.map((c) => (
                <li key={c.name} className="flex items-start gap-2.5 px-3 py-2">
                  {c.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-good" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-critical" />}
                  <span className="min-w-0"><span className="block text-[13.5px] font-medium text-ink">{c.name}</span>{!c.ok && <span className="block text-[12.5px] break-words text-critical">{c.message}</span>}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 flex items-center gap-1.5 text-[12.5px] text-ink-3">How this stays correct <InfoTip side="top" label="How this stays correct">Rows are saved by order, return or day, so nothing is counted twice. Orders changed in the last 2 days are read again every sync, so a late status change is never missed. Several date ranges are read at the same time, which makes the first big read much faster.</InfoTip></p>
        </section>
      </div>
    </div>
  );
}
