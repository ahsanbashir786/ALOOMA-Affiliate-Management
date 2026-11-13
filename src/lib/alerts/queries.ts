import "server-only";
import { sql as pg } from "@/db";
import type { Area, Severity } from "./checks";

export type AlertRow = { key: string; area: Area; severity: Severity; title: string; detail: string | null; advice: string | null; href: string | null; status: "open" | "seen" | "resolved"; firstSeen: string; lastSeen: string; count: number; resolvedAt: string | null; handledBy: string | null };

const map = (r: Record<string, unknown>): AlertRow => ({
  key: String(r.key), area: r.area as Area, severity: r.severity as Severity, title: String(r.title), detail: (r.detail as string) ?? null, advice: (r.advice as string) ?? null, href: (r.href as string) ?? null,
  status: r.status as AlertRow["status"], firstSeen: new Date(r.first_seen as Date).toISOString(), lastSeen: new Date(r.last_seen as Date).toISOString(), count: Number(r.count), resolvedAt: r.resolved_at ? new Date(r.resolved_at as Date).toISOString() : null, handledBy: (r.handled_by as string) ?? null,
});

const ORDER = pg`case severity when 'critical' then 0 when 'warning' then 1 else 2 end`;

export async function listAlerts(): Promise<{ open: AlertRow[]; resolved: AlertRow[] }> {
  const [open, resolved] = await Promise.all([
    pg`select * from system_alerts where status <> 'resolved' order by ${ORDER}, last_seen desc`,
    pg`select * from system_alerts where status = 'resolved' order by resolved_at desc limit 15`,
  ]);
  return { open: open.map(map), resolved: resolved.map(map) };
}

export type AlertSummary = { open: number; unseen: number; worst: Severity | null; byArea: Record<Area, Severity | null> };
const RANKS: Record<Severity, number> = { critical: 3, warning: 2, info: 1 };

/** The numbers for the bell and the health tiles. A seen alert still counts for its tile (the problem is still there) but not for the bell. */
export async function alertSummary(): Promise<AlertSummary> {
  const rows = await pg`select area, severity, status from system_alerts where status <> 'resolved'`;
  const byArea: AlertSummary["byArea"] = { connections: null, sync: null, server: null, errors: null };
  let worst: Severity | null = null, unseen = 0;
  for (const r of rows) {
    const sev = r.severity as Severity, area = r.area as Area;
    if (!byArea[area] || RANKS[sev] > RANKS[byArea[area]!]) byArea[area] = sev;
    if (!worst || RANKS[sev] > RANKS[worst]) worst = sev;
    if (r.status === "open" && sev !== "info") unseen++;
  }
  return { open: rows.length, unseen, worst, byArea };
}

export async function setAlertStatus(key: string, status: "seen" | "resolved", by: string): Promise<void> {
  await pg`update system_alerts set status = ${status}, handled_by = ${by}, resolved_at = ${status === "resolved" ? pg`now()` : pg`null`} where key = ${key}`;
}
