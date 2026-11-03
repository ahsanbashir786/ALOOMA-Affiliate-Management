import "server-only";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { staffEvents, users } from "@/db/schema";
import { getWorkflowSettings } from "./settings";
import { replayEvents, type EventKind, type StaffEvent, type WorkflowState } from "./replay";

export type { EventKind, StaffEvent, WorkflowState } from "./replay";

const toEvent = (r: typeof staffEvents.$inferSelect): StaffEvent => ({
  id: r.id,
  username: r.username,
  kind: r.kind as EventKind,
  at: r.at,
  userId: r.userId,
  details: (r.details as Record<string, unknown> | null) ?? null,
  batchId: r.batchId,
  synthetic: r.synthetic,
  revertedAt: r.revertedAt,
});

/** All staff events (optionally for some creators), oldest first. Reverted events are included – replay ignores them. */
export async function loadEvents(usernames?: string[]): Promise<StaffEvent[]> {
  const rows = await db
    .select()
    .from(staffEvents)
    .where(usernames ? inArray(staffEvents.username, usernames) : undefined)
    .orderBy(asc(staffEvents.at), asc(staffEvents.id));
  return rows.map(toEvent);
}

/** Current workflow state of every creator that has staff events (or just the given ones). */
export async function getWorkflowStates(usernames?: string[]): Promise<Map<string, WorkflowState>> {
  if (usernames && !usernames.length) return new Map();
  const [cfg, events] = await Promise.all([getWorkflowSettings(), loadEvents(usernames)]);
  const by = new Map<string, StaffEvent[]>();
  for (const e of events) by.set(e.username, [...(by.get(e.username) ?? []), e]);
  const out = new Map<string, WorkflowState>();
  for (const [u, list] of by) out.set(u, replayEvents(u, list, cfg));
  return out;
}

export async function addEvent(e: {
  username: string;
  kind: EventKind;
  userId: string | null;
  details?: Record<string, unknown>;
  batchId?: string | null;
  at?: Date;
  synthetic?: boolean;
}): Promise<number> {
  const [row] = await db
    .insert(staffEvents)
    .values({
      username: e.username,
      kind: e.kind,
      userId: e.userId,
      details: e.details ?? null,
      batchId: e.batchId ?? null,
      ...(e.at ? { at: e.at } : {}),
      synthetic: e.synthetic ?? false,
    })
    .returning({ id: staffEvents.id });
  return row.id;
}

/** Undo: the event stays in the history (who, when) but no longer counts. */
export async function revertEvent(id: number, byUserId: string | null): Promise<void> {
  await db
    .update(staffEvents)
    .set({ revertedAt: new Date(), revertedBy: byUserId })
    .where(and(eq(staffEvents.id, id), isNull(staffEvents.revertedAt)));
}

export async function revertBatch(batchId: string, byUserId: string | null): Promise<number> {
  const rows = await db
    .update(staffEvents)
    .set({ revertedAt: new Date(), revertedBy: byUserId })
    .where(and(eq(staffEvents.batchId, batchId), isNull(staffEvents.revertedAt)))
    .returning({ id: staffEvents.id });
  return rows.length;
}

/** Newest first, with the person's name – for the creator timeline and audit. */
export async function creatorEventLog(username: string, limit = 50) {
  return db
    .select({
      id: staffEvents.id,
      kind: staffEvents.kind,
      at: staffEvents.at,
      details: staffEvents.details,
      batchId: staffEvents.batchId,
      synthetic: staffEvents.synthetic,
      revertedAt: staffEvents.revertedAt,
      userName: users.name,
      userId: staffEvents.userId,
    })
    .from(staffEvents)
    .leftJoin(users, eq(users.id, staffEvents.userId))
    .where(eq(staffEvents.username, username))
    .orderBy(desc(staffEvents.at), desc(staffEvents.id))
    .limit(limit);
}

