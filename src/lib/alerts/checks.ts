// What counts as a problem. Pure (no database, no clock of its own) so every rule can be tested.
export type Severity = "critical" | "warning" | "info";
export type Area = "connections" | "sync" | "server" | "errors";
export type Candidate = { key: string; area: Area; severity: Severity; title: string; detail?: string; advice?: string; href?: string; /** Overrides the "times seen" counter (errors count their own repeats). */ count?: number; /** The latest time the problem happened (errors): a person who cleared the alert only sees it again if it happens after that. */ lastAtMs?: number };

export const RANK: Record<Severity, number> = { critical: 3, warning: 2, info: 1 };

/** The login or a permission was refused (as opposed to TikTok having a hiccup or an API version change). */
export const isAuthError = (msg: string | null | undefined) => !!msg && /(105005|access denied|access.?token|does not include any|token.*(expired|invalid|revoked)|invalid.*token|40101|40102|40104|40105|not authorized|unauthori[sz]ed)/i.test(msg);

const HOUR = 3600_000;

type Conn = { configured: boolean; connected: boolean; authErrors: string[] };
export type ConnectionInput = {
  nowSec: number;
  tiktok: Conn;
  ads: Conn;
  shopee: { configured: boolean; connected: boolean; savedEnv: "sandbox" | "live" | null; configEnv: "sandbox" | "live" | null; refreshExpiresAt: number | null };
};

export function connectionCandidates(i: ConnectionInput): Candidate[] {
  const out: Candidate[] = [];
  const conn = (id: string, name: string, c: Conn, where: string, permNote: string) => {
    if (c.configured && !c.connected) out.push({ key: `conn:${id}:off`, area: "connections", severity: "warning", title: `${name} is not connected`, detail: "The app has its keys, but nobody has connected it yet, or the connection was removed.", advice: `Open Settings → Connection → ${where} and press Connect.`, href: "/settings?tab=connection" });
    if (c.connected && c.authErrors.length) out.push({ key: `conn:${id}:auth`, area: "connections", severity: "critical", title: `${name} refused the login or a permission is missing`, detail: `${c.authErrors[0]}${c.authErrors.length > 1 ? ` (${c.authErrors.length} data cards affected)` : ""}`, advice: `Press Reconnect in Settings → Connection → ${where}, and tick every permission. ${permNote}`, href: "/settings?tab=connection" });
  };
  conn("tiktok-shop", "TikTok Shop", i.tiktok, "Affiliate (TikTok Shop)", "If a permission is missing, switch it on in TikTok Partner Center first.");
  conn("tiktok-ads", "TikTok Ads", i.ads, "Ad Management (GMV Max)", "");
  const s = i.shopee;
  if (s.configured && s.connected) {
    if (s.savedEnv && s.configEnv && s.savedEnv !== s.configEnv) out.push({ key: "conn:shopee:env", area: "connections", severity: "warning", title: "Shopee is connected to the wrong environment", detail: `The saved login is for ${s.savedEnv}, but the server is set to ${s.configEnv}.`, advice: "Press Reconnect in Settings → Connection → Shopee.", href: "/settings?tab=connection&src=shopee" });
    if (s.refreshExpiresAt != null) {
      const days = (s.refreshExpiresAt - i.nowSec) / 86400;
      if (days < 0) out.push({ key: "conn:shopee:expiry", area: "connections", severity: "critical", title: "The Shopee login has run out", detail: "Shopee logins last 30 days and renew when they are used. This one was not used in time.", advice: "Press Reconnect in Settings → Connection → Shopee.", href: "/settings?tab=connection&src=shopee" });
      else if (days < 7) out.push({ key: "conn:shopee:expiry", area: "connections", severity: "warning", title: `The Shopee login runs out in ${Math.max(1, Math.ceil(days))} day${Math.ceil(days) === 1 ? "" : "s"}`, detail: "Shopee logins last 30 days and renew when they are used.", advice: "Press Check Connection in Settings → Connection → Shopee. That renews it.", href: "/settings?tab=connection&src=shopee" });
    }
  }
  return out;
}

export type SyncSource = {
  name: string; id: string; connected: boolean; enabled: boolean; everyMinutes: number; lastSuccessMs: number | null;
  failed: { key: string; label: string; error: string; atMs: number | null }[];
  running: { dataset: string; label: string; startedMs: number }[];
};

export function syncCandidates(sources: SyncSource[], nowMs: number): Candidate[] {
  const out: Candidate[] = [];
  for (const s of sources) {
    if (!s.connected) continue;
    for (const f of s.failed) {
      if (isAuthError(f.error)) continue; // reported once, under Connections
      const old = f.atMs != null && nowMs - f.atMs > 24 * HOUR;
      const version = /version/i.test(f.error);
      out.push({ key: `sync:${s.id}:${f.key}`, area: "sync", severity: old ? "critical" : "warning", title: `${s.name}: ${f.label} failed to sync`, detail: f.error,
        advice: version ? "TikTok has probably changed the API version for this data. Copy the diagnostic report and send it to the developer." : "Press the small sync button on the card. If it fails again, copy the diagnostic report and send it to the developer.", href: "/sync" });
    }
    const limit = Math.max(6 * HOUR, 3 * s.everyMinutes * 60_000);
    if (s.enabled && s.lastSuccessMs != null && nowMs - s.lastSuccessMs > limit) {
      const h = Math.round((nowMs - s.lastSuccessMs) / HOUR);
      out.push({ key: `sync:${s.id}:stale`, area: "sync", severity: "warning", title: `${s.name} data is old`, detail: `The last good sync was ${h} hours ago, but it should run every ${s.everyMinutes >= 60 ? `${s.everyMinutes / 60} hour${s.everyMinutes === 60 ? "" : "s"}` : `${s.everyMinutes} minutes`}.`, advice: "Press Sync Now in Data Sync. If nothing changes, check the failed cards there.", href: "/sync" });
    }
    for (const r of s.running) {
      if (nowMs - r.startedMs > 3 * HOUR) out.push({ key: `sync:${s.id}:stuck:${r.dataset}`, area: "sync", severity: "warning", title: `${s.name}: ${r.label} has been syncing for over 3 hours`, detail: "It may be stuck.", advice: "Wait a little, then press Sync Now. If it still shows Syncing, restart the app.", href: "/sync" });
    }
  }
  return out;
}

export type ServerInput = { diskPct: number | null; memPct: number | null; cpu: number[]; loadPerCore: number | null; lagMs: number[] };

export function serverCandidates(i: ServerInput): Candidate[] {
  const out: Candidate[] = [];
  const last = (a: number[], n: number) => (a.length >= n ? a.slice(-n) : null);
  if (i.diskPct != null && i.diskPct >= 80) out.push({ key: "server:disk", area: "server", severity: i.diskPct >= 90 ? "critical" : "warning", title: `The server disk is ${Math.round(i.diskPct)}% full`, detail: i.diskPct >= 90 ? "The app and database can stop when the disk is full." : "Plan to free space or upgrade the server.", advice: "See Settings → Storage for where the space goes. Delete old backups, or ask your hosting company to upgrade the disk.", href: "/settings?tab=storage" });
  if (i.memPct != null && i.memPct >= 85) out.push({ key: "server:memory", area: "server", severity: i.memPct >= 95 ? "critical" : "warning", title: `Memory is ${Math.round(i.memPct)}% used`, detail: "When memory runs out the server slows down or the app restarts.", advice: "Restart the app (docker compose restart app). If it keeps coming back, upgrade the server to more memory.", href: "/settings?tab=storage" });
  const c3 = last(i.cpu, 3), c5 = last(i.cpu, 5);
  if (c5 && c5.every((v) => v >= 95)) out.push({ key: "server:cpu", area: "server", severity: "critical", title: "The processor has been at its limit for 10 minutes", detail: `Busy ${Math.round(Math.min(...c5))}% or more in every check.`, advice: "A sync may be running. Wait for it to finish. If it stays like this, upgrade the server (more vCPU).", href: "/settings?tab=storage" });
  else if (c3 && c3.every((v) => v >= 90)) out.push({ key: "server:cpu", area: "server", severity: "warning", title: "The processor is very busy", detail: `Busy ${Math.round(Math.min(...c3))}% or more for the last 6 minutes.`, advice: "A sync may be running. Wait for it to finish. If it keeps happening, upgrade the server (more vCPU).", href: "/settings?tab=storage" });
  if (i.loadPerCore != null && i.loadPerCore >= 2) out.push({ key: "server:load", area: "server", severity: "warning", title: "The server has more work than it can do at once", detail: `The 5-minute load is ${i.loadPerCore.toFixed(1)} per processor core (normal is under 1).`, advice: "Pages will feel slow. Wait for syncs to finish. If it keeps happening, upgrade the server.", href: "/settings?tab=storage" });
  const l3 = last(i.lagMs, 3);
  if (l3 && l3.every((v) => v >= 500)) out.push({ key: "server:slow", area: "server", severity: "warning", title: "The app is slow to respond", detail: `It was held up by ${Math.round(Math.min(...l3))} ms or more in each of the last checks.`, advice: "Something heavy is running. Wait a few minutes. If it continues, restart the app or upgrade the server.", href: "/settings?tab=storage" });
  return out;
}

export type ErrorGroup = { signature: string; source: string; route: string | null; message: string; count24h: number; countHour: number; lastAtMs?: number };

export function errorCandidates(groups: ErrorGroup[]): Candidate[] {
  return groups.map((g) => ({
    key: `error:${g.signature}`, area: "errors" as const, severity: (g.countHour >= 10 ? "critical" : "warning") as Severity,
    title: `${g.source === "browser" ? "Browser error" : "Page error"} on ${g.route || "an unknown page"}`,
    detail: g.message, count: g.count24h, lastAtMs: g.lastAtMs,
    advice: "Copy the diagnostic report and send it to the developer. This clears by itself after 24 hours without a repeat.",
  }));
}

/** The same mistake with different numbers or ids is one problem: 12345 → #, long ids → #. */
export function errorSignature(source: string, route: string | null, message: string): string {
  const norm = message.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "#").replace(/\b[0-9a-f]{16,}\b/gi, "#").replace(/\d+/g, "#").slice(0, 160);
  return `${source}|${(route ?? "").replace(/\d+/g, "#").slice(0, 80)}|${norm}`;
}
