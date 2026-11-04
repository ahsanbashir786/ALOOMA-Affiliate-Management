"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, BarChart3, CheckCircle2, Gift, Handshake, Loader2, Package, Radio, Receipt, RefreshCw, Truck, Undo2, Video, XCircle } from "lucide-react";
import { resetStuckSync, setSyncSchedule } from "@/app/actions/sync";
import { cn } from "@/lib/utils";
import type { SyncOverview, TrustCheck } from "@/lib/tiktok/sync";

const ICON: Record<string, React.ComponentType<{ className?: string }>> = { package: Package, receipt: Receipt, gift: Gift, video: Video, radio: Radio, undo: Undo2, x: XCircle, chart: BarChart3, truck: Truck, handshake: Handshake };
const EVERY = [{ v: 0, l: "Off" }, { v: 30, l: "Every 30 min" }, { v: 60, l: "Every hour" }, { v: 180, l: "Every 3 hours" }, { v: 720, l: "Every 12 hours" }, { v: 1440, l: "Daily" }];

function ago(iso: string | null, now: number): string {
  if (!iso) return "Never";
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 45) return "Just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}
const inMin = (iso: string | null, now: number) => {
  if (!iso) return null;
  const m = Math.round((new Date(iso).getTime() - now) / 60000);
  return m <= 0 ? "any moment" : m < 90 ? `${m} min` : `${Math.round(m / 60)} h`;
};
const fresh = (iso: string | null, now: number) => (!iso ? "none" : now - new Date(iso).getTime() < 2 * 3600_000 ? "good" : now - new Date(iso).getTime() < 26 * 3600_000 ? "warn" : "bad");
const DOT = { good: "bg-good", warn: "bg-warn", bad: "bg-critical", none: "bg-line-strong" } as const;
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dmy = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return `${d} ${MON[m - 1]} ${y}`; };
const span = (a: string, b: string | null) => (b && b !== a ? `${dmy(a)} – ${dmy(b)}` : dmy(a));
const rm = (n: number) => `RM ${Math.round(n).toLocaleString("en-MY")}`;

export function SyncBoard({ initial, trust, connected, canAdmin, serverNow }: { initial: SyncOverview; trust: TrustCheck | null; connected: boolean; canAdmin: boolean; serverNow: number }) {
  const [ov, setOv] = useState(initial);
  const [trustNow, setTrustNow] = useState(trust);
  // Starts from the server's clock so the first browser render matches the server's HTML exactly; it ticks with the live clock afterwards.
  const [now, setNow] = useState(serverNow);
  const [starting, setStarting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const startedAt = useRef(0);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/tiktok/sync", { cache: "no-store" });
      if (r.ok) {
        const j = (await r.json()) as SyncOverview & { trust: TrustCheck | null };
        setOv(j);
        setTrustNow(j.trust);
      }
    } catch {}
    setNow(Date.now());
  }, []);
  useEffect(() => {
    const t = setInterval(refresh, ov.running || starting ? 2000 : 30000);
    return () => clearInterval(t);
  }, [ov.running, starting, refresh]);
  useEffect(() => {
    if (starting && (ov.running || Date.now() - startedAt.current > 8000)) setStarting(false);
  }, [ov.running, starting, now]);

  const run = async (dataset?: string) => {
    setErr(null);
    setStarting(true);
    startedAt.current = Date.now();
    const r = await fetch("/api/tiktok/sync", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ dataset }) });
    if (!r.ok) {
      setStarting(false);
      setErr(((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? "Could not start the sync.");
    } else setTimeout(refresh, 600);
  };

  const busy = ov.running || starting;
  // "Stuck" = something says it is running but nothing has moved (no rows read, no run finished) for 90 seconds.
  const moveKey = `${ov.datasets.reduce((n, d) => n + (d.progress ?? 0), 0)}|${ov.runs[0]?.id ?? 0}|${ov.runs.filter((r) => r.status === "running").length}`;
  const lastKey = useRef(moveKey);
  const [movedAt, setMovedAt] = useState(serverNow);
  useEffect(() => {
    if (lastKey.current !== moveKey) {
      lastKey.current = moveKey;
      setMovedAt(Date.now());
    }
  }, [moveKey]);
  const stuck = ov.running && now - movedAt > 90_000;
  const failed = ov.datasets.filter((d) => d.lastError);
  const never = ov.datasets.every((d) => !d.lastSuccessAt);
  const state = !connected ? "off" : busy ? "busy" : failed.length ? "warn" : never ? "new" : "ok";
  const runningNow = ov.datasets.find((d) => d.running)?.label;

  if (!connected)
    return (
      <div className="grid place-items-center rounded-2xl border border-line bg-surface px-6 py-20 text-center" data-testid="sync-offline">
        <span className="grid size-14 place-items-center rounded-2xl bg-brand-soft text-brand"><RefreshCw className="size-7" /></span>
        <h2 className="mt-5 text-[22px] font-semibold text-ink">Connect TikTok Shop</h2>
        <p className="mt-1 text-[14.5px] text-ink-3">One click, and your data syncs by itself.</p>
        <Link href="/settings" className="mt-6 inline-flex h-10 items-center rounded-lg bg-brand px-5 text-[14.5px] font-medium text-white hover:opacity-90">Open connection</Link>
      </div>
    );

  return (
    <div className="space-y-5">
      {/* status */}
      <section data-testid="sync-hero" data-state={state} className="relative overflow-hidden rounded-2xl bg-brand p-6 text-white sm:p-7">
        <div aria-hidden className="pointer-events-none absolute -top-24 -right-16 size-72 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            <span className={cn("grid size-14 shrink-0 place-items-center rounded-2xl bg-white/15", busy && "animate-pulse")}>
              {busy ? <Loader2 className="size-7 animate-spin" /> : state === "warn" ? <AlertTriangle className="size-7 text-amber-200" /> : <CheckCircle2 className="size-7" />}
            </span>
            <div>
              <h2 className="text-[24px] leading-tight font-semibold">{busy ? `Syncing${runningNow ? ` ${runningNow}` : ""}…` : state === "warn" ? "Needs attention" : state === "new" ? "Ready for the first sync" : "Everything is up to date"}</h2>
              <p className="mt-0.5 text-[14px] text-white/75">
                {busy ? (ov.datasets.some((d) => d.progress) ? `${ov.datasets.reduce((a, d) => a + (d.progress ?? 0), 0).toLocaleString("en-MY")} records so far · you can keep working` : "You can keep working") : state === "warn" ? `${failed.length} of ${ov.datasets.length} failed` : `Last sync ${ago(ov.lastFullAt, now).toLowerCase()}`}
                {!busy && ov.settings.enabled && ov.nextAt ? ` · next in ${inMin(ov.nextAt, now)}` : !busy && !ov.settings.enabled ? " · auto-sync off" : ""}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            {canAdmin && (
              <select
                aria-label="Auto-sync"
                value={ov.settings.enabled ? ov.settings.everyMinutes : 0}
                disabled={pending}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  start(async () => {
                    await setSyncSchedule(v);
                    await refresh();
                  });
                }}
                className="h-10 rounded-lg border border-white/30 bg-white/10 px-3 text-[14px] text-white focus:outline-none [&>option]:text-ink"
              >
                {EVERY.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
            )}
            {stuck && (
              <button data-testid="sync-reset" disabled={pending} onClick={() => start(async () => { await resetStuckSync(); await refresh(); })} className="h-10 rounded-lg border border-white/40 px-4 text-[14px] font-medium text-white hover:bg-white/10">
                Stuck? Reset
              </button>
            )}
            <button data-testid="sync-now" disabled={busy} onClick={() => run()} className="inline-flex h-10 items-center gap-2 rounded-lg bg-white px-5 text-[14.5px] font-semibold text-brand hover:bg-white/90 disabled:opacity-60">
              <RefreshCw className={cn("size-4", busy && "animate-spin")} /> Sync now
            </button>
          </div>
        </div>
        {err && <p role="alert" className="relative mt-4 rounded-lg bg-white/15 px-3 py-2 text-[13.5px]">{err}</p>}
      </section>

      {/* datasets */}
      <section aria-label="Data" className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {ov.datasets.map((d) => {
          const Icon = ICON[d.icon] ?? Package;
          const f = fresh(d.lastSuccessAt, now);
          return (
            <article key={d.key} data-testid={`ds-${d.key}`} className={cn("group relative rounded-2xl border bg-surface p-4 transition-shadow hover:shadow-card", d.lastError ? "border-critical/40" : "border-line")}>
              <div className="flex items-start justify-between">
                <span className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand"><Icon className="size-5" /></span>
                <button aria-label={`Sync ${d.label}`} disabled={busy} onClick={() => run(d.key)} className="rounded-lg p-1.5 text-ink-3 opacity-0 transition-opacity hover:bg-surface-2 hover:text-brand focus:opacity-100 group-hover:opacity-100 disabled:opacity-40">
                  <RefreshCw className={cn("size-4", d.running && "animate-spin")} />
                </button>
              </div>
              <p className="mt-3 text-[14px] font-medium text-ink-2">{d.label}</p>
              <p className="tnum text-[30px] leading-tight font-semibold text-ink">{d.records.toLocaleString("en-MY")}</p>
              <div className="mt-2 flex items-center gap-2 text-[13px] text-ink-3">
                <span className={cn("size-2 rounded-full", DOT[f], d.running && "animate-pulse")} />
                {d.running ? `Syncing${d.progress ? ` · ${d.progress.toLocaleString("en-MY")}` : "…"}` : d.lastError ? <span className="text-critical" title={d.lastError}>Failed</span> : ago(d.lastSuccessAt, now)}
              </div>
              {d.oldest && <p className="mt-0.5 text-[12px] text-ink-3" data-testid={`span-${d.key}`}>{span(d.oldest, d.newest)}</p>}
              {d.lastError && <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-critical">{d.lastError}</p>}
              {!d.lastError && d.note && <p className="mt-1 line-clamp-3 text-[12px] leading-snug text-warn" title={d.note} data-testid={`note-${d.key}`}>{d.note}</p>}
            </article>
          );
        })}
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        {/* history */}
        <section className="min-w-0 rounded-2xl border border-line bg-surface" aria-label="Recent syncs">
          <h3 className="px-5 pt-4 pb-2 text-[15px] font-semibold text-ink">Recent syncs</h3>
          {ov.runs.length === 0 ? (
            <p className="px-5 pb-6 text-[14px] text-ink-3">Nothing yet.</p>
          ) : (
            <ul className="divide-y divide-line" data-testid="sync-runs">
              {ov.runs.slice(0, 10).map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-5 py-2.5 text-[14px]">
                  <span className={cn("size-2 shrink-0 rounded-full", r.status === "ok" ? "bg-good" : r.status === "failed" ? "bg-critical" : "animate-pulse bg-brand")} />
                  <span className="w-36 shrink-0 truncate font-medium text-ink">{r.label}</span>
                  <span className="min-w-0 flex-1 truncate text-ink-3">{r.status === "failed" ? <span className="text-critical">{r.error}</span> : r.status === "running" ? "Running…" : <>{r.changed > 0 ? `${r.changed.toLocaleString("en-MY")} updated` : "No changes"}{r.error && <span className="ml-2 text-warn" title={r.error}>· {r.error.split(" (")[0]}</span>}</>}</span>
                  <span className="hidden text-[12.5px] text-ink-3 sm:inline">{r.trigger === "schedule" ? "Auto" : (r.by ?? "Manual")}</span>
                  <span className="w-20 shrink-0 text-right text-[12.5px] text-ink-3">{ago(r.startedAt, now)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* trust */}
        <section className="min-w-0 rounded-2xl border border-line bg-surface p-5" aria-label="Trust check" data-testid="trust">
          <h3 className="text-[15px] font-semibold text-ink">Trust check</h3>
          <p className="text-[12.5px] text-ink-3">Affiliate sales, last 28 days</p>
          {!trustNow ? (
            <p className="mt-6 text-[14px] text-ink-3">Waiting for the first sync.</p>
          ) : (
            <div className="mt-4 space-y-3.5">
              {[{ l: "TikTok API", v: trustNow.api.gmv, o: trustNow.api.orders, c: "bg-brand" }, ...(trustNow.upload ? [{ l: "Uploaded files", v: trustNow.upload.gmv, o: trustNow.upload.orders, c: "bg-ink-3" }] : [])].map((x, _i, all) => {
                const max = Math.max(...all.map((y) => y.v), 1);
                return (
                  <div key={x.l}>
                    <div className="flex items-baseline justify-between text-[13.5px]">
                      <span className="text-ink-2">{x.l}</span>
                      <span className="tnum font-semibold text-ink">{rm(x.v)} <span className="font-normal text-ink-3">· {x.o} orders</span></span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2"><div className={cn("h-full rounded-full", x.c)} style={{ width: `${(x.v / max) * 100}%` }} /></div>
                  </div>
                );
              })}
              {trustNow.diffPct != null ? (
                <p className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-medium", Math.abs(trustNow.diffPct) < 3 ? "bg-good-soft text-good" : Math.abs(trustNow.diffPct) < 10 ? "bg-warn-soft text-warn" : "bg-serious-soft text-serious")}>
                  {Math.abs(trustNow.diffPct) < 3 ? <CheckCircle2 className="size-4" /> : <AlertTriangle className="size-4" />}
                  {trustNow.diffPct >= 0 ? "+" : ""}{trustNow.diffPct.toFixed(1)}% vs uploads
                </p>
              ) : (
                <p className="text-[13px] text-ink-3">No uploaded files to compare.</p>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
