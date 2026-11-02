import "server-only";
import { sql } from "drizzle-orm";
import { diffDays } from "@/lib/period-core";
import type { Kind } from "@/lib/ingest/kinds";
import { rows } from "./sql";

export type SnapshotRef = {
  uploadId: number;
  start: string;
  end: string;
  days: number;
  /** share of the requested window covered by this snapshot (0–1) */
  coverage: number;
};

/**
 * Snapshot exports describe a fixed window. Pick the upload of `kind` that
 * overlaps the requested window the most (shorter windows win ties).
 */
export async function pickSnapshot(kind: Kind, start: string, end: string): Promise<SnapshotRef | null> {
  const found = await rows<{ id: number; ps: string; pe: string; overlap: number }>(sql`
    select id, to_char(period_start,'YYYY-MM-DD') as ps, to_char(period_end,'YYYY-MM-DD') as pe,
           (least(period_end, ${end}::date) - greatest(period_start, ${start}::date) + 1)::int as overlap
    from uploads
    where kind = ${kind} and period_start is not null and period_end is not null
      and period_start <= ${end}::date and period_end >= ${start}::date
    order by overlap desc, (period_end - period_start) asc, id desc
    limit 1`);
  const r = found[0];
  if (!r) return null;
  const wanted = diffDays(start, end);
  return {
    uploadId: r.id,
    start: r.ps,
    end: r.pe,
    days: diffDays(r.ps, r.pe),
    coverage: Math.min(1, r.overlap / wanted),
  };
}

/** Which snapshot kinds exist at all – drives empty states. */
export async function availableKinds(): Promise<Set<Kind>> {
  const r = await rows<{ kind: Kind }>(sql`select distinct kind from uploads`);
  return new Set(r.map((x) => x.kind));
}
