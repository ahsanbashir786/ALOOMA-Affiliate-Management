"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, BarChart3, Building2, CheckCircle2, ChevronDown, Film, Loader2, Package, RefreshCw, Rocket, Store, Target, Video } from "lucide-react";
import { setAdsSyncSchedule } from "@/app/actions/tiktok-ads";
import { DOT, EVERY, ago, dmy, dur, fresh, inMin, span } from "@/components/sync/format";
import { cn } from "@/lib/utils";
import type { AdsOverview } from "@/lib/tiktok-ads/sync";

/** A note that only says how a result was read (not a problem): shown calmly, not as a warning. */
const isInfoNote = (note: string | null | undefined) => !!note && note.split(" · ").every((p) => /^Used dimensions /.test(p));

const ICON: Record<string, React.ComponentType<{ className?: string }>> = { building: Building2, store: Store, target: Target, chart: BarChart3, video: Video, package: Package, film: Film, rocket: Rocket };

export function AdsSyncBoard({ initial, connected, configured, canAdmin, canRun, canConnect, serverNow }: { initial: AdsOverview; connected: boolean; configured: boolean; canAdmin: boolean; canRun: boolean; canConnect: boolean; serverNow: number }) {
  const [ov, setOv] = useState(initial);
  const [now, setNow] = useState(serverNow);
  const [starting, setStarting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const startedAt = useRef(0);

  const refresh = useCallback(async () => {
    try { const r = await fetch("/api/tiktok-ads/sync", { cache: "no-store" }); if (r.ok) setOv((await r.json()) as AdsOverview); } catch {}
    setNow(Date.now());
  }, []);
  useEffect(() => {
    if (!connected) return;
    const t = setInterval(refresh, ov.running || starting ? 2000 : 30000);
    return () => clearInterval(t);
  }, [connected, ov.running, starting, refresh]);
  useEffect(() => { if (starting && (ov.running || Date.now() - startedAt.current > 8000)) setStarting(false); }, [ov.running, starting, now]);

  const run = async (dataset?: string, history = false) => {
    setErr(null); setStarting(true); startedAt.current = Date.now();
    const r = await fetch("/api/tiktok-ads/sync", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ dataset, history }) });
    if (!r.ok) { setStarting(false); setErr(((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? "Could not start the sync."); }
    else setTimeout(refresh, 600);
  };

  if (!connected)
    return (
      <div className="grid place-items-center rounded-2xl border border-line bg-surface px-6 py-20 text-center" data-testid="ads-offline">
        <span className="grid size-14 place-items-center rounded-2xl bg-brand-soft text-brand"><Target className="size-7" /></span>
        <h2 className="mt-5 text-[22px] font-semibold text-ink">Connect TikTok Ads</h2>
        <p className="mt-1 max-w-md text-[14.5px] text-ink-3">{configured ? "One click in Settings, and your GMV Max results sync by themselves." : "The TikTok Ads app ID and secret are not on the server yet. Add them, then connect in Settings."}</p>
        {canConnect
          ? <Link href="/settings?tab=connection&src=ads" className="mt-6 inline-flex h-10 items-center rounded-lg bg-brand px-5 text-[14.5px] font-medium text-white hover:opacity-90">Open Connection</Link>
          : <p className="mt-5 text-[13.5px] text-ink-3">Ask an admin to connect it in Settings.</p>}
      </div>
    );

  const busy = ov.running || starting;
  const failed = ov.datasets.filter((d) => d.lastError);
  const never = ov.datasets.every((d) => !d.lastSuccessAt);
  const state = busy ? "busy" : ov.needsReconnect || failed.length ? "warn" : never ? "new" : "ok";
  const runningNow = ov.datasets.find((d) => d.running)?.label;
  const newest = ov.datasets.find((d) => d.key === "campaign_daily")?.newest ?? null;
  const stale = ov.datasets.filter((d) => d.lastSuccessAt && now - new Date(d.lastSuccessAt).getTime() > 24 * 3600_000);
  const notes = ov.datasets.filter((d) => d.note && /skipped|only keeps|No GMV Max shop/.test(d.note));
  const health: { title: string; text: string; tone: "good" | "warn" | "bad" }[] = [
    ov.needsReconnect ? { title: "TikTok Login Refused", text: "TikTok no longer accepts the saved login. Press Reconnect in Settings.", tone: "bad" }
      : failed.length ? { title: `${failed.length} Dataset${failed.length === 1 ? "" : "s"} Failed`, text: failed.map((d) => d.label).join(", "), tone: "bad" }
        : never ? { title: "Nothing Synced Yet", text: "Press Sync Now to load your ads data.", tone: "warn" } : { title: `All ${ov.datasets.length} Datasets Synced`, text: "No errors in the latest syncs.", tone: "good" },
    stale.length ? { title: "Out Of Date", text: `${stale.map((d) => d.label).join(", ")} not synced for over a day.`, tone: "warn" } : { title: "Up To Date", text: ov.lastFullAt ? `Last full sync ${ago(ov.lastFullAt, now).toLowerCase()}.` : "Waiting for the first sync.", tone: ov.lastFullAt ? "good" : "warn" },
    { title: "Latest Results", text: newest ? `Campaign results up to ${dmy(newest)}. The last 14 days are re-read every sync, because TikTok adjusts ad numbers after the day ends.` : "No campaign results yet.", tone: newest ? "good" : "warn" },
    ov.shops === 0 && !never ? { title: "No GMV Max Shop", text: "TikTok lists no shop linked to your ad account, so there are no results to read. Link the shop in TikTok Ads Manager.", tone: "warn" } : { title: "Shops And Campaigns", text: `${ov.shops} shop${ov.shops === 1 ? "" : "s"} · ${ov.activeCampaigns} active campaign${ov.activeCampaigns === 1 ? "" : "s"}.`, tone: ov.shops ? "good" : "warn" },
    notes.length ? { title: "Some Parts Skipped", text: `${notes.map((d) => d.label).join(", ")}: see the note on the card.`, tone: "warn" } : { title: "Nothing Skipped", text: "TikTok returned everything we asked for.", tone: "good" },
    { title: ov.settings.enabled ? "Auto-Sync Is On" : "Auto-Sync Is Off", text: ov.settings.enabled ? `Runs by itself every ${ov.settings.everyMinutes >= 60 ? `${ov.settings.everyMinutes / 60} h` : `${ov.settings.everyMinutes} min`}.` : "Data only updates when you press Sync Now.", tone: ov.settings.enabled ? "good" : "warn" },
  ];

  return (
    <div className="space-y-5" data-testid="ads-board">
      <section data-testid="ads-hero" data-state={state} className="relative rounded-2xl bg-brand p-6 text-white sm:p-7">
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl"><div className="absolute -top-24 -right-16 size-72 rounded-full bg-white/10 blur-2xl" /></div>
        <div className="relative flex flex-wrap items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            <span className={cn("grid size-14 shrink-0 place-items-center rounded-2xl bg-white/15", busy && "animate-pulse")}>
              {busy ? <Loader2 className="size-7 animate-spin" /> : state === "warn" ? <AlertTriangle className="size-7 text-amber-200" /> : <CheckCircle2 className="size-7" />}
            </span>
            <div>
              <h2 className="text-[24px] leading-tight font-semibold">{busy ? `Syncing${runningNow ? ` ${runningNow}` : ""}…` : ov.needsReconnect ? "Reconnect TikTok Ads" : state === "warn" ? "Needs Attention" : state === "new" ? "Ready For The First Sync" : "Everything Is Up To Date"}</h2>
              <p className="mt-0.5 text-[14px] text-white/75">
                {busy ? (ov.datasets.some((d) => d.progress) ? `${ov.datasets.reduce((a, d) => a + (d.progress ?? 0), 0).toLocaleString("en-MY")} records so far · you can keep working` : "You can keep working") : ov.accounts.length ? `${ov.accounts.map((a) => a.name ?? a.id).slice(0, 2).join(", ")}${ov.accounts.length > 2 ? ` +${ov.accounts.length - 2}` : ""} · last sync ${ago(ov.lastFullAt, now).toLowerCase()}` : `Last sync ${ago(ov.lastFullAt, now).toLowerCase()}`}
                {!busy && ov.settings.enabled && ov.nextAt ? ` · next in ${inMin(ov.nextAt, now)}` : !busy && !ov.settings.enabled ? " · auto-sync off" : ""}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            {canAdmin && (
              <select aria-label="Auto-sync" value={ov.settings.enabled ? ov.settings.everyMinutes : 0} disabled={pending}
                onChange={(e) => { const v = Number(e.target.value); start(async () => { await setAdsSyncSchedule(v); await refresh(); }); }}
                className="h-10 rounded-lg border border-white/30 bg-white/10 px-3 text-[14px] text-white focus:outline-none [&>option]:text-ink">
                {EVERY.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
            )}
            {ov.needsReconnect && canConnect && <Link href="/settings?tab=connection&src=ads" className="inline-flex h-10 items-center rounded-lg border border-white/40 px-4 text-[14px] font-medium text-white hover:bg-white/10">Reconnect</Link>}
            <button data-testid="ads-sync-now" disabled={busy || !canRun} title={canRun ? undefined : "Your role cannot run a sync"} onClick={() => run()} className="inline-flex h-10 items-center gap-2 rounded-lg bg-white px-5 text-[14.5px] font-semibold text-brand hover:bg-white/90 disabled:opacity-60">
              <RefreshCw className={cn("size-4", busy && "animate-spin")} /> Sync Now
            </button>
          </div>
        </div>
        {err && <p role="alert" className="relative mt-4 rounded-lg bg-white/15 px-3 py-2 text-[13.5px]">{err}</p>}
      </section>

      <section aria-label="Data" className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        {ov.datasets.map((d) => {
          const Icon = ICON[d.icon] ?? Package;
          const f = fresh(d.lastSuccessAt, now);
          return (
            <article key={d.key} data-testid={`ads-ds-${d.key}`} className={cn("group relative rounded-2xl border bg-surface p-4 transition-shadow hover:shadow-card", d.lastError ? "border-critical/40" : "border-line")}>
              <div className="flex items-start justify-between">
                <span className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand"><Icon className="size-5" /></span>
                <button aria-label={`Sync ${d.label}`} disabled={busy || !canRun} onClick={() => run(d.key)} className="rounded-lg p-1.5 text-ink-3 opacity-0 transition-opacity hover:bg-surface-2 hover:text-brand focus:opacity-100 group-hover:opacity-100 disabled:opacity-40">
                  <RefreshCw className={cn("size-4", d.running && "animate-spin")} />
                </button>
              </div>
              <p className="mt-3 text-[14px] font-medium text-ink-2">{d.label}</p>
              <p className="tnum text-[30px] leading-tight font-semibold text-ink">{d.records.toLocaleString("en-MY")}<span className="ml-1.5 text-[12.5px] font-normal text-ink-3">{d.what}</span></p>
              {d.distinct && <p className="text-[12.5px] font-medium text-ink-2" data-testid={`ads-distinct-${d.key}`}>{d.distinct}</p>}
              <div className="mt-2 flex items-center gap-2 text-[13px] text-ink-3">
                <span className={cn("size-2 rounded-full", DOT[f], d.running && "animate-pulse")} />
                {d.running ? `Syncing${d.progress ? ` · ${d.progress.toLocaleString("en-MY")}` : "…"}` : d.lastError ? <span className="text-critical" title={d.lastError}>Failed</span> : ago(d.lastSuccessAt, now)}
              </div>
              {d.oldest && <p className="mt-0.5 text-[12px] text-ink-3">{span(d.oldest, d.newest)}</p>}
              {d.lastError && <p className="mt-1 line-clamp-4 text-[12px] leading-snug break-words text-critical">{d.lastError}</p>}
              {!d.lastError && d.note && !isInfoNote(d.note) && <p className="mt-1 text-[12px] font-medium text-warn" title={d.note} data-testid={`ads-note-${d.key}`}>Note (hover to read)</p>}
              {d.sample && (
                <details className="mt-2.5 text-[12.5px]">
                  <summary className="cursor-pointer text-ink-3 hover:text-brand">What TikTok sent</summary>
                  <pre className="mt-1.5 max-h-48 overflow-auto rounded-lg bg-surface-2 p-2.5 text-[11.5px] leading-snug break-all whitespace-pre-wrap text-ink-2">{d.sample}</pre>
                </details>
              )}
            </article>
          );
        })}
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section className="min-w-0 rounded-2xl border border-line bg-surface" aria-label="Sync history">
          <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-2">
            <div>
              <h3 className="text-[15px] font-semibold text-ink">Sync History</h3>
              <p className="text-[12.5px] text-ink-3">The latest runs, one line per dataset.</p>
            </div>
            <button disabled={busy || !canRun} onClick={() => run(undefined, true)} title="Read the whole history again (campaigns and products up to a year, videos about six months)" className="rounded-lg border border-line-strong px-3 py-1.5 text-[12.5px] font-medium text-ink-2 hover:bg-surface-2 disabled:opacity-50">Re-Read History</button>
          </div>
          {ov.runs.length === 0 ? <p className="px-5 pb-6 text-[14px] text-ink-3">Nothing yet.</p> : (
            <ul className="divide-y divide-line" data-testid="ads-runs">
              {ov.runs.slice(0, 12).map((r) => (
                <li key={r.id} className="flex items-start gap-3 px-5 py-2.5">
                  <span className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", r.status === "failed" ? "bg-critical" : r.status === "running" ? "animate-pulse bg-brand" : r.error && !isInfoNote(r.error) ? "bg-warn" : "bg-good")} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium text-ink">{r.label}</span>
                    <span className="block truncate text-[12.5px] text-ink-3">{r.trigger === "schedule" ? "Automatic" : `By ${r.by ?? "a team member"}`} · {ago(r.startedAt, now)}{r.durationSec != null ? ` · took ${dur(r.durationSec)}` : ""}</span>
                    {r.error && <span className={cn("mt-0.5 line-clamp-3 block text-[12.5px] leading-snug break-words", r.status === "failed" ? "text-critical" : isInfoNote(r.error) ? "text-ink-3" : "text-warn")}>{r.error}</span>}
                  </span>
                  <span className="tnum shrink-0 rounded-full bg-surface-2 px-2.5 py-0.5 text-[12.5px] font-medium text-ink-2">{r.status === "running" ? "Running…" : r.changed > 0 ? `${r.changed.toLocaleString("en-MY")} Updated` : "Nothing New"}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="min-w-0 rounded-2xl border border-line bg-surface p-5" aria-label="Data health" data-testid="ads-health">
          <h3 className="text-[15px] font-semibold text-ink">Data Health</h3>
          <p className="text-[12.5px] text-ink-3">Is everything arriving from TikTok Ads?</p>
          <ul className="mt-4 space-y-3.5">
            {health.map((h) => (
              <li key={h.title} className="flex items-start gap-3">
                {h.tone === "good" ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-good" /> : <AlertTriangle className={cn("mt-0.5 size-5 shrink-0", h.tone === "bad" ? "text-critical" : "text-warn")} />}
                <span className="min-w-0"><span className="block text-[14px] font-medium text-ink">{h.title}</span><span className="block text-[13px] text-ink-3">{h.text}</span></span>
              </li>
            ))}
          </ul>
          <details className="mt-4 text-[12.5px] text-ink-3"><summary className="flex cursor-pointer items-center gap-1 hover:text-brand">How this stays correct <ChevronDown className="size-3.5" /></summary>
            <p className="mt-1.5 leading-relaxed">Rows are inserted or updated, never duplicated. The last 14 days are read again every sync, and the last 60 days once a day, because TikTok restates ad numbers after the day ends. Each row also keeps TikTok&apos;s full answer.</p>
          </details>
        </section>
      </div>
    </div>
  );
}
