import "server-only";
import { readFile } from "node:fs/promises";
import { sql as pg } from "@/db";
import { tiktokConfig, connectionInfo } from "@/lib/tiktok/client";
import { adsConfig, adsConnectionInfo } from "@/lib/tiktok-ads/client";
import { shopeeConfig, shopeeConnectionInfo } from "@/lib/shopee/client";
import { DATASETS, getSyncSettings } from "@/lib/tiktok/sync";
import { ADS_DATASETS, getAdsSyncSettings } from "@/lib/tiktok-ads/sync";
import { diskUsage } from "@/lib/storage/usage";
import { parseMeminfo } from "@/lib/storage/server";
import os from "node:os";
import { connectionCandidates, errorCandidates, isAuthError, RANK, serverCandidates, syncCandidates, type Candidate, type SyncSource } from "./checks";
import { load5PerCore, readSamples, sampleServer } from "./sampler";

const ms = (d: unknown) => (d ? new Date(d as Date).getTime() : null);

async function syncSource(name: string, id: string, table: "tt_sync_state" | "ads_sync_state", runs: "tt_sync_runs" | "ads_sync_runs", labels: Map<string, string>, connected: boolean, settings: { enabled: boolean; everyMinutes: number }): Promise<{ src: SyncSource; auth: string[] }> {
  const states = await pg.unsafe(`select dataset, last_error, last_error_at, last_success_at from ${table} where dataset <> '_all'`);
  const running = await pg.unsafe(`select dataset, started_at from ${runs} where status = 'running' and dataset <> '_all'`);
  const auth: string[] = [];
  const failed: SyncSource["failed"] = [];
  for (const r of states) {
    const err = r.last_error as string | null;
    if (!err) continue;
    // a later good run clears last_error, so a stored error is a current one
    if (isAuthError(err)) auth.push(err); else failed.push({ key: String(r.dataset), label: labels.get(String(r.dataset)) ?? String(r.dataset), error: err, atMs: ms(r.last_error_at) });
  }
  const last = Math.max(0, ...states.map((r) => ms(r.last_success_at) ?? 0));
  return { auth, src: { name, id, connected, enabled: settings.enabled, everyMinutes: settings.everyMinutes, lastSuccessMs: last || null, failed, running: running.map((r) => ({ dataset: String(r.dataset), label: labels.get(String(r.dataset)) ?? String(r.dataset), startedMs: ms(r.started_at) ?? Date.now() })) } };
}

/** Everything that is wrong right now, from the database and the server itself. */
export async function collectCandidates(): Promise<Candidate[]> {
  const [tt, ads, shopee, ttSet, adsSet] = await Promise.all([connectionInfo(), adsConnectionInfo(), shopeeConnectionInfo(), getSyncSettings(), getAdsSyncSettings()]);
  const [t, a] = await Promise.all([
    syncSource("TikTok Shop", "tiktok", "tt_sync_state", "tt_sync_runs", new Map(DATASETS.map((d) => [d.key as string, d.label])), tt.connected, ttSet),
    syncSource("TikTok Ads", "ads", "ads_sync_state", "ads_sync_runs", new Map(ADS_DATASETS.map((d) => [d.key as string, d.label])), ads.connected, adsSet),
  ]);
  const sc = shopeeConfig();
  const out: Candidate[] = [
    ...connectionCandidates({
      nowSec: Math.floor(Date.now() / 1000),
      tiktok: { configured: !!tiktokConfig(), connected: tt.connected, authErrors: t.auth },
      ads: { configured: !!adsConfig(), connected: ads.connected, authErrors: a.auth },
      shopee: { configured: !!sc, connected: shopee.connected, savedEnv: shopee.env, configEnv: sc?.env ?? null, refreshExpiresAt: shopee.refreshExpiresAt },
    }),
    ...syncCandidates([t.src, a.src], Date.now()),
  ];
  // server
  let memPct: number | null = null;
  try { const m = parseMeminfo(await readFile("/proc/meminfo", "utf8")); if (m && m.total > 0) memPct = ((m.total - m.available) / m.total) * 100; } catch { memPct = ((os.totalmem() - os.freemem()) / os.totalmem()) * 100; }
  let diskPct: number | null = null;
  try { const d = await diskUsage(); diskPct = d.total > 0 ? (d.used / d.total) * 100 : null; } catch { /* no disk reading */ }
  if (readSamples().length === 0) await sampleServer();
  const samples = readSamples();
  out.push(...serverCandidates({ diskPct, memPct, cpu: samples.map((s) => s.cpu).filter((v): v is number => v != null), loadPerCore: load5PerCore(), lagMs: samples.map((s) => s.lagMs) }));
  // errors
  const groups = await pg`
    select signature, max(source) as source, max(route) as route, (array_agg(message order by at desc))[1] as message, max(at) as last_at, count(*)::int as c24, (count(*) filter (where at > now() - interval '1 hour'))::int as ch
    from app_error_log where at > now() - interval '24 hours' group by signature order by max(at) desc limit 40`;
  out.push(...errorCandidates(groups.map((g) => ({ signature: String(g.signature), source: String(g.source), route: (g.route as string) ?? null, message: String(g.message), count24h: Number(g.c24), countHour: Number(g.ch), lastAtMs: ms(g.last_at) ?? undefined }))));
  return out;
}

/** Writes the current problems into the alert list: new ones are added, repeats are refreshed, ones that are gone are marked resolved. */
export async function syncAlerts(cands: Candidate[]): Promise<void> {
  await pg.begin(async (tx) => {
    const existing = new Map((await tx`select key, status, severity, handled_by, resolved_at from system_alerts`).map((r) => [String(r.key), r]));
    const active = new Set<string>();
    for (const c of cands) {
      active.add(c.key);
      const ex = existing.get(c.key);
      // An error someone cleared stays cleared until it happens again.
      if (ex && ex.status === "resolved" && ex.handled_by && c.lastAtMs != null && ex.resolved_at && c.lastAtMs <= new Date(ex.resolved_at as Date).getTime()) continue;
      if (!ex) {
        await tx`insert into system_alerts (key, area, severity, title, detail, advice, href, count) values (${c.key}, ${c.area}, ${c.severity}, ${c.title}, ${c.detail ?? null}, ${c.advice ?? null}, ${c.href ?? null}, ${c.count ?? 1})`;
        continue;
      }
      const reopen = ex.status === "resolved" || (ex.status === "seen" && RANK[c.severity] > RANK[ex.severity as keyof typeof RANK]);
      await tx`update system_alerts set severity = ${c.severity}, title = ${c.title}, detail = ${c.detail ?? null}, advice = ${c.advice ?? null}, href = ${c.href ?? null}, last_seen = now(),
        count = ${c.count ?? 1}, ${reopen ? tx`status = 'open', resolved_at = null, handled_by = null, first_seen = case when status = 'resolved' then now() else first_seen end` : tx`status = status`} where key = ${c.key}`;
    }
    const gone = [...existing.entries()].filter(([k, r]) => !active.has(k) && r.status !== "resolved").map(([k]) => k);
    if (gone.length) await tx`update system_alerts set status = 'resolved', resolved_at = now() where key = any(${gone})`;
    await tx`delete from system_alerts where status = 'resolved' and resolved_at < now() - interval '14 days'`;
    await tx`delete from app_error_log where at < now() - interval '7 days'`;
  });
}

let last = 0;
/** Looks at everything and updates the alert list. At most once a minute unless `force`. */
export async function evaluateAlerts(force = false): Promise<void> {
  if (!force && Date.now() - last < 60_000) return;
  last = Date.now();
  try { await syncAlerts(await collectCandidates()); } catch (e) { console.error("alert check failed", e); }
}
