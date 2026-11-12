"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, BarChart3, CheckCircle2, ChevronDown, Clock, Gift, Handshake, ListOrdered, Loader2, Package, Radio, Receipt, RefreshCw, ShoppingCart, Truck, Undo2, Video, Wallet, XCircle } from "lucide-react";
import { resetStuckSync, setSyncSchedule } from "@/app/actions/sync";
import { cn } from "@/lib/utils";
import type { RunView, SyncOverview } from "@/lib/tiktok/sync";

const ICON: Record<string, React.ComponentType<{ className?: string }>> = { package: Package, receipt: Receipt, gift: Gift, video: Video, radio: Radio, undo: Undo2, x: XCircle, chart: BarChart3, truck: Truck, cart: ShoppingCart, handshake: Handshake, wallet: Wallet, list: ListOrdered, clock: Clock };
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
const dur = (sec: number) => {
  const t = Math.max(1, Math.round(sec));
  if (t < 60) return `${t} sec`;
  if (t < 3600) return t % 60 ? `${Math.floor(t / 60)} min ${t % 60} sec` : `${t / 60} min`;
  const m = Math.round((t % 3600) / 60);
  return m ? `${Math.floor(t / 3600)} h ${m} min` : `${t / 3600} h`;
};

type RunGroup = { items: RunView[]; title: string; who: string; startedAt: string; durationSec: number | null; changed: number; skipped: number; failed: number; state: "running" | "failed" | "ok" };
/** Runs that started within 20 minutes of each other are one sync (Sync now, auto-sync or a card's own button). */
function groupRuns(runs: RunView[], total: number): RunGroup[] {
  const sorted = [...runs].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
  const out: RunView[][] = [];
  for (const r of sorted) {
    const g = out[out.length - 1];
    if (g && Date.parse(g[0].startedAt) - Date.parse(r.startedAt) < 20 * 60_000 && g[0].trigger === r.trigger && g[0].by === r.by) g.push(r);
    else out.push([r]);
  }
  return out.map((items) => {
    const first = items[items.length - 1];
    const ends = items.map((r) => (r.durationSec != null ? Date.parse(r.startedAt) + r.durationSec * 1000 : null));
    const running = items.some((r) => r.status === "running");
    const failed = items.filter((r) => r.status === "failed").length;
    return {
      items: [...items].sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt)),
      title: items.length >= Math.max(6, total - 2) ? "Full Sync" : items.length === 1 ? items[0].label : `${items.length} Datasets`,
      who: first.trigger === "schedule" ? "Automatic" : `By ${first.by ?? "a team member"}`,
      startedAt: first.startedAt,
      durationSec: running || ends.some((e) => e == null) ? null : (Math.max(...(ends as number[])) - Date.parse(first.startedAt)) / 1000,
      changed: items.reduce((n, r) => n + r.changed, 0),
      skipped: items.filter((r) => r.status === "ok" && r.error).length,
      failed,
      state: running ? "running" : failed ? "failed" : "ok",
    } satisfies RunGroup;
  });
}

export function SyncBoard({ initial, connected, canAdmin, canRun, serverNow }: { initial: SyncOverview; connected: boolean; canAdmin: boolean; canRun: boolean; serverNow: number }) {
  const [ov, setOv] = useState(initial);
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
        setOv((await r.json()) as SyncOverview);
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
  const groups = groupRuns(ov.runs, ov.datasets.length);
  const dayMs = 24 * 3600_000;
  const stale = ov.datasets.filter((d) => d.lastSuccessAt && now - new Date(d.lastSuccessAt).getTime() > dayMs);
  const skippedNotes = ov.datasets.filter((d) => d.note && /skipped/.test(d.note));
  const newest = ov.datasets.find((d) => d.key === "affiliate_orders")?.newest ?? ov.datasets.find((d) => d.key === "orders")?.newest ?? null;
  const health: { title: string; text: string; tone: "good" | "warn" | "bad" }[] = [
    failed.length
      ? { title: `${failed.length} Dataset${failed.length === 1 ? "" : "s"} Failed`, text: failed.map((d) => d.label).join(", "), tone: "bad" }
      : never ? { title: "Nothing Synced Yet", text: "Press Sync now to load your data.", tone: "warn" } : { title: `All ${ov.datasets.length} Datasets Synced`, text: "No errors in the latest syncs.", tone: "good" },
    stale.length
      ? { title: "Out Of Date", text: `${stale.map((d) => d.label).join(", ")} not synced for over a day.`, tone: "warn" }
      : { title: "Up To Date", text: ov.lastFullAt ? `Last full sync ${ago(ov.lastFullAt, now).toLowerCase()}.` : "Waiting for the first sync.", tone: ov.lastFullAt ? "good" : "warn" },
    { title: "Latest Order Data", text: newest ? `Orders up to ${dmy(newest)}.` : "No orders yet.", tone: newest ? "good" : "warn" },
    ov.samples.orders === 0
      ? { title: "Samples Tally", text: "No sample orders found yet.", tone: "warn" }
      : ov.samples.matched === ov.samples.orders
        ? { title: "Samples Tally", text: `All ${ov.samples.orders.toLocaleString("en-MY")} sample orders belong to a creator.`, tone: "good" }
        : { title: "Samples Tally", text: `${ov.samples.matched.toLocaleString("en-MY")} of ${ov.samples.orders.toLocaleString("en-MY")} sample orders belong to a creator. ${(ov.samples.orders - ov.samples.matched).toLocaleString("en-MY")} have no sample request, so we cannot tell who received them.`, tone: "warn" },
    skippedNotes.length
      ? { title: "Some Records Skipped", text: `${skippedNotes.map((d) => d.label).join(", ")}: TikTok would not return a few records. They are tried again on the next sync.`, tone: "warn" }
      : { title: "Nothing Skipped", text: "TikTok returned every record we asked for.", tone: "good" },
    { title: ov.settings.enabled ? "Auto-Sync Is On" : "Auto-Sync Is Off", text: ov.settings.enabled ? `Runs by itself every ${ov.settings.everyMinutes >= 60 ? `${ov.settings.everyMinutes / 60} h` : `${ov.settings.everyMinutes} min`}.` : "Data only updates when you press Sync now.", tone: ov.settings.enabled ? "good" : "warn" },
  ];

  if (!connected)
    return (
      <div className="grid place-items-center rounded-2xl border border-line bg-surface px-6 py-20 text-center" data-testid="sync-offline">
        <span className="grid size-14 place-items-center rounded-2xl bg-brand-soft text-brand"><RefreshCw className="size-7" /></span>
        <h2 className="mt-5 text-[22px] font-semibold text-ink">Connect TikTok Shop</h2>
        <p className="mt-1 text-[14.5px] text-ink-3">One click, and your data syncs by itself.</p>
        <Link href="/settings" className="mt-6 inline-flex h-10 items-center rounded-lg bg-brand px-5 text-[14.5px] font-medium text-white hover:opacity-90">Open Connection</Link>
      </div>
    );

  return (
    <div className="space-y-5">
      {/* status */}
      <section data-testid="sync-hero" data-state={state} className="relative rounded-2xl bg-brand p-6 text-white sm:p-7">
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl"><div className="absolute -top-24 -right-16 size-72 rounded-full bg-white/10 blur-2xl" /></div>
        <div className="relative flex flex-wrap items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            <span className={cn("grid size-14 shrink-0 place-items-center rounded-2xl bg-white/15", busy && "animate-pulse")}>
              {busy ? <Loader2 className="size-7 animate-spin" /> : state === "warn" ? <AlertTriangle className="size-7 text-amber-200" /> : <CheckCircle2 className="size-7" />}
            </span>
            <div>
              <h2 className="text-[24px] leading-tight font-semibold">{busy ? `Syncing${runningNow ? ` ${runningNow}` : ""}…` : state === "warn" ? "Needs Attention" : state === "new" ? "Ready For The First Sync" : "Everything Is Up To Date"}</h2>
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
            <button data-testid="sync-now" disabled={busy || !canRun} title={canRun ? undefined : "Your role cannot run a sync"} onClick={() => run()} className="inline-flex h-10 items-center gap-2 rounded-lg bg-white px-5 text-[14.5px] font-semibold text-brand hover:bg-white/90 disabled:opacity-60">
              <RefreshCw className={cn("size-4", busy && "animate-spin")} /> Sync Now
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
                <button aria-label={`Sync ${d.label}`} disabled={busy || !canRun} onClick={() => run(d.key)} className="rounded-lg p-1.5 text-ink-3 opacity-0 transition-opacity hover:bg-surface-2 hover:text-brand focus:opacity-100 group-hover:opacity-100 disabled:opacity-40">
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
              {d.detail && <p className="mt-0.5 text-[12px] text-ink-3">{d.detail}</p>}
              {d.lastError && <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-critical">{d.lastError}</p>}
              {!d.lastError && d.note && <p className="mt-1 line-clamp-6 text-[12px] leading-snug text-warn" title={d.note} data-testid={`note-${d.key}`}>{d.note}</p>}
            </article>
          );
        })}
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        {/* history */}
        <section className="min-w-0 rounded-2xl border border-line bg-surface" aria-label="Sync history">
          <div className="px-5 pt-4 pb-2">
            <h3 className="text-[15px] font-semibold text-ink">Sync History</h3>
            <p className="text-[12.5px] text-ink-3">Each line is one sync. Open it to see every dataset.</p>
          </div>
          {groups.length === 0 ? (
            <p className="px-5 pb-6 text-[14px] text-ink-3">Nothing yet.</p>
          ) : (
            <ul className="divide-y divide-line" data-testid="sync-runs">
              {groups.slice(0, 6).map((g, i) => (
                <li key={g.items[0].id}>
                  <details open={i === 0} className="group/run">
                    <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-3 hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
                      <span className={cn("size-2.5 shrink-0 rounded-full", g.state === "failed" ? "bg-critical" : g.state === "running" ? "animate-pulse bg-brand" : g.skipped > 0 ? "bg-warn" : "bg-good")} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14.5px] font-medium text-ink">{g.title}</span>
                        <span className="block truncate text-[12.5px] text-ink-3">{g.who} · {ago(g.startedAt, now)}{g.durationSec != null ? ` · took ${dur(g.durationSec)}` : ""}</span>
                      </span>
                      <span className="flex shrink-0 flex-wrap items-center justify-end gap-1.5 text-[12.5px]">
                        {g.state === "running" ? <span className="rounded-full bg-brand-soft px-2.5 py-0.5 font-medium text-brand">Running…</span> : (
                          <>
                            {g.failed > 0 && <span className="rounded-full bg-critical-soft px-2.5 py-0.5 font-medium text-critical">{g.failed} Failed</span>}
                            {g.skipped > 0 && <span className="rounded-full bg-warn-soft px-2.5 py-0.5 font-medium text-warn">{g.skipped} Skipped</span>}
                            <span className="tnum rounded-full bg-surface-2 px-2.5 py-0.5 font-medium text-ink-2">{g.changed > 0 ? `${g.changed.toLocaleString("en-MY")} Updated` : "Nothing New"}</span>
                          </>
                        )}
                      </span>
                      <ChevronDown className="size-4 shrink-0 text-ink-3 transition-transform group-open/run:rotate-180" aria-hidden />
                    </summary>
                    <ul className="space-y-1 bg-surface-2/50 px-5 pt-1 pb-3">
                      {g.items.map((r) => (
                        <li key={r.id} className="flex items-center gap-2.5 py-1 pl-5 text-[13.5px]">
                          <span className={cn("size-1.5 shrink-0 rounded-full", r.status === "ok" ? "bg-good" : r.status === "failed" ? "bg-critical" : "animate-pulse bg-brand")} />
                          <span className="w-52 shrink-0 truncate text-ink">{r.label}</span>
                          <span className="min-w-0 flex-1 truncate text-ink-3" title={r.error ?? undefined}>
                            {r.status === "failed" ? <span className="text-critical">{r.error}</span> : r.status === "running" ? "Running…" : <>{r.changed > 0 ? `${r.changed.toLocaleString("en-MY")} Updated` : "Nothing New"}{r.error && <span className="ml-2 text-warn">{r.error}</span>}</>}
                          </span>
                          <span className="tnum w-20 shrink-0 text-right text-[12.5px] whitespace-nowrap text-ink-3">{r.durationSec != null ? dur(r.durationSec) : ""}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* health */}
        <section className="min-w-0 rounded-2xl border border-line bg-surface p-5" aria-label="Data health" data-testid="health">
          <h3 className="text-[15px] font-semibold text-ink">Data Health</h3>
          <p className="text-[12.5px] text-ink-3">Is everything arriving from TikTok?</p>
          <ul className="mt-4 space-y-3.5">
            {health.map((h) => (
              <li key={h.title} className="flex items-start gap-3">
                {h.tone === "good" ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-good" /> : <AlertTriangle className={cn("mt-0.5 size-5 shrink-0", h.tone === "bad" ? "text-critical" : "text-warn")} />}
                <span className="min-w-0">
                  <span className="block text-[14px] font-medium text-ink">{h.title}</span>
                  <span className="block text-[13px] text-ink-3">{h.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
