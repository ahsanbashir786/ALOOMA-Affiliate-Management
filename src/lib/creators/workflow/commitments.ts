import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { commitmentChanges, commitments } from "@/db/schema";
import { rows } from "@/lib/sql";
import { productName } from "@/lib/products/catalog";
import { allocate, effectiveDecision, type CommitmentInput, type ContentPiece, type DecisionInput } from "./fulfilment";

/**
 * A commitment is a promise a creator made: a date, and optionally a content type, a product and a quantity.
 * It exists on its own – a sample is only context. "Contact the creator" is a staff task; a commitment is only fulfilled by
 * content (see fulfilment.ts), never by a button. The deadline can be rescheduled; the original stays on record and only the
 * current deadline drives reminders.
 */
export type CommitmentState = "open" | "partial" | "review" | "fulfilled";

export type CommitmentRow = {
  id: number;
  /** The staff "promised" event that created it. */
  eventId: number;
  username: string;
  /** The original promised date (never overwritten). */
  promisedOn: string;
  /** The current deadline – the only date reminders, queues and sample deadlines use. */
  dueOn: string;
  rescheduled: number;
  /** Legacy / free text. Read-only; never interpreted. */
  details: string | null;
  contentType: "video" | "live" | null;
  quantity: number | null;
  productId: string | null;
  productName: string | null;
  recordedAt: string;
  recordedBy: string | null;
  state: CommitmentState;
  needed: number;
  done: number;
  completedOn: string | null;
  timing: "on_time" | "late" | "unknown" | null;
  contentIds: string[];
  /** "system" when matched automatically, "staff" when a person verified at least one counted piece. */
  contentSource: "system" | "staff" | null;
  candidates: { contentId: string; kind: string; link: string | null; postedOn: string | null }[];
};

export async function createCommitment(input: {
  username: string;
  eventId: number;
  promisedOn: string;
  details?: string | null;
  productId?: string | null;
  contentType?: "video" | "live" | null;
  quantity?: number | null;
}): Promise<{ productId: string | null }> {
  const productId = input.productId || null;
  await db.insert(commitments).values({
    username: input.username,
    eventId: input.eventId,
    promisedOn: input.promisedOn,
    details: input.details?.trim() || null,
    contentType: input.contentType ?? null,
    quantity: input.quantity && input.quantity > 0 ? Math.min(input.quantity, 50) : null,
    productId,
  });
  await refreshCommitments();
  return { productId };
}

/** Move a commitment's deadline. The original date stays; this is a change record, not a new commitment. */
export async function rescheduleCommitment(input: { commitmentId: number; eventId: number; toOn: string }): Promise<{ fromOn: string } | null> {
  const cur = await rows<{ due_on: string }>(sql`
    select to_char(coalesce((select ch.to_on from commitment_changes ch join staff_events ce on ce.id = ch.event_id and ce.reverted_at is null
      where ch.commitment_id = c.id order by ce.at desc, ch.id desc limit 1), c.promised_on), 'YYYY-MM-DD') as due_on
    from commitments c where c.id = ${input.commitmentId}`);
  if (!cur[0]) return null;
  await db.insert(commitmentChanges).values({ commitmentId: input.commitmentId, eventId: input.eventId, fromOn: cur[0].due_on, toOn: input.toOn });
  await refreshCommitments();
  return { fromOn: cur[0].due_on };
}

/** Rebuilds the derived commitment_status table from commitments, the content layer and staff decisions. Never changes staff data. */
export async function refreshCommitments(): Promise<void> {
  const cs = await rows<{
    id: number; username: string; recorded_on: string; seq: number; original_on: string; due_on: string;
    content_type: string | null; quantity: number | null; product_id: string | null;
  }>(sql`
    select c.id, c.username, to_char(e.at at time zone 'Asia/Kuala_Lumpur', 'YYYY-MM-DD') as recorded_on, c.id as seq,
      to_char(c.promised_on, 'YYYY-MM-DD') as original_on,
      to_char(coalesce((select ch.to_on from commitment_changes ch join staff_events ce on ce.id = ch.event_id and ce.reverted_at is null
        where ch.commitment_id = c.id order by ce.at desc, ch.id desc limit 1), c.promised_on), 'YYYY-MM-DD') as due_on,
      c.content_type, c.quantity, c.product_id
    from commitments c join staff_events e on e.id = c.event_id and e.reverted_at is null`);
  await db.execute(sql`delete from commitment_status`);
  if (!cs.length) return;
  const users = [...new Set(cs.map((c) => c.username))];
  const inUsers = sql.join(users.map((u) => sql`${u}`), sql`, `);
  const items = await rows<{ content_id: string; creator: string; kind: string; product_ids: string[]; posted_on: string | null; first_on: string | null }>(sql`
    select content_id, creator, kind, product_ids, to_char(posted_at, 'YYYY-MM-DD') as posted_on, to_char(first_observed_on, 'YYYY-MM-DD') as first_on
    from content_items where creator in (${inUsers})`);
  const decs = await rows<{ id: number; at: Date | string; username: string; content_id: string | null; decision: string; commitment_id: number | null; shared: boolean; decided_on: string }>(sql`
    select id, at, username, content_id, decision, commitment_id, shared, to_char(at at time zone 'Asia/Kuala_Lumpur', 'YYYY-MM-DD') as decided_on
    from content_decisions where reverted_at is null and content_id is not null and username in (${inUsers})`);

  const out: (typeof import("@/db/schema").commitmentStatus.$inferInsert)[] = [];
  for (const u of users) {
    const mine = cs.filter((c) => c.username === u);
    const inputs: CommitmentInput[] = mine.map((c) => ({
      id: c.id,
      recordedOn: c.recorded_on,
      recordedSeq: c.seq,
      originalOn: c.original_on,
      dueOn: c.due_on,
      contentType: c.content_type === "video" || c.content_type === "live" ? c.content_type : null,
      quantity: c.quantity,
      productIds: c.product_id ? [c.product_id] : [],
    }));
    const pieces: ContentPiece[] = items
      .filter((i) => i.creator === u)
      .map((i) => ({ contentId: i.content_id, kind: i.kind === "live" ? "live" : "video", productIds: i.product_ids ?? [], postedOn: i.posted_on, firstObservedOn: i.first_on }));
    const decisions: DecisionInput[] = decs
      .filter((d) => d.username === u && d.content_id)
      .map((d) => ({
        id: d.id,
        at: new Date(d.at).toISOString(),
        contentId: d.content_id!,
        decision: d.decision === "verified" ? "verified" : "rejected",
        commitmentId: d.commitment_id,
        sampleLinked: false,
        shared: d.shared,
        decidedOn: d.decided_on,
        appliesTo: d.commitment_id != null ? [d.commitment_id] : [],
      }));
    for (const r of allocate(inputs, pieces, decisions)) {
      out.push({
        commitmentId: r.id,
        state: r.state,
        needed: r.needed,
        done: r.done,
        originalOn: r.originalOn,
        dueOn: r.dueOn,
        completedOn: r.completedOn,
        timing: r.timing,
        contentIds: r.contentIds,
        candidateIds: r.candidateIds,
      });
    }
  }
  const { commitmentStatus } = await import("@/db/schema");
  for (let i = 0; i < out.length; i += 500) await db.insert(commitmentStatus).values(out.slice(i, i + 500));
}

/** Commitments that still count (their "promised" event was not undone), with derived progress. */
export async function getCommitments(usernames?: string[]): Promise<CommitmentRow[]> {
  if (usernames && !usernames.length) return [];
  const filter = usernames ? sql`and c.username in (${sql.join(usernames.map((u) => sql`${u}`), sql`, `)})` : sql``;
  const r = await rows<{
    id: number; event_id: number; username: string; original_on: string; due_on: string; changes: number; details: string | null; content_type: string | null;
    quantity: number | null; product_id: string | null; product_name: string | null; recorded_at: string; recorded_by: string | null;
    state: string; needed: number; done: number; completed_on: string | null; timing: string | null; content_ids: string[]; candidate_ids: string[];
  }>(sql`
    select c.id, c.event_id, c.username, to_char(c.promised_on, 'YYYY-MM-DD') as original_on, to_char(st.due_on, 'YYYY-MM-DD') as due_on,
      (select count(*) from commitment_changes ch join staff_events ce on ce.id = ch.event_id and ce.reverted_at is null where ch.commitment_id = c.id)::int as changes,
      c.details, c.content_type, c.quantity, c.product_id, c.product_id as product_name,
      to_char(e.at at time zone 'Asia/Kuala_Lumpur', 'YYYY-MM-DD') as recorded_at, u.name as recorded_by,
      st.state, st.needed, st.done, to_char(st.completed_on, 'YYYY-MM-DD') as completed_on, st.timing, st.content_ids, st.candidate_ids
    from commitments c
    join staff_events e on e.id = c.event_id and e.reverted_at is null
    join commitment_status st on st.commitment_id = c.id
    left join users u on u.id = e.user_id
    where true ${filter}
    order by st.due_on, c.id`);
  const ids = [...new Set(r.flatMap((x) => [...x.content_ids, ...x.candidate_ids]))];
  const items = ids.length
    ? await rows<{ content_id: string; kind: string; link: string | null; posted_on: string | null }>(sql`
        select content_id, kind, link, to_char(posted_at, 'YYYY-MM-DD') as posted_on from content_items where content_id in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`)
    : [];
  const byItem = new Map(items.map((i) => [i.content_id, i]));
  const decRows = r.length
    ? await rows<{ id: number; at: Date | string; commitment_id: number | null; content_id: string; decision: string; shared: boolean }>(sql`
        select id, at, commitment_id, content_id, decision, shared from content_decisions where reverted_at is null and content_id is not null
          and username in (${sql.join([...new Set(r.map((x) => x.username))].map((x) => sql`${x}`), sql`, `)})`)
    : [];
  return r.map((x) => {
    // "staff" when at least one counted piece is held up by a verification that is still the latest decision for it
    const mine: DecisionInput[] = decRows.map((v) => ({
      id: v.id, at: new Date(v.at).toISOString(), contentId: v.content_id, decision: v.decision === "verified" ? "verified" : "rejected",
      commitmentId: v.commitment_id, sampleLinked: false, shared: v.shared, decidedOn: "",
      appliesTo: v.commitment_id != null ? [v.commitment_id] : [],
    }));
    const staff = x.content_ids.some((id) => effectiveDecision({ id: x.id }, id, mine)?.decision === "verified");
    return {
      id: x.id,
      eventId: x.event_id,
      username: x.username,
      promisedOn: x.original_on,
      dueOn: x.due_on,
      rescheduled: x.changes,
      details: x.details,
      contentType: x.content_type === "video" || x.content_type === "live" ? x.content_type : null,
      quantity: x.quantity,
      productId: x.product_id,
      productName: x.product_name ? productName(x.product_name) : null,
      recordedAt: x.recorded_at,
      recordedBy: x.recorded_by,
      state: x.state as CommitmentState,
      needed: x.needed,
      done: x.done,
      completedOn: x.completed_on,
      timing: x.timing as CommitmentRow["timing"],
      contentIds: x.content_ids,
      contentSource: x.done > 0 ? (staff ? "staff" : "system") : null,
      candidates: x.candidate_ids.map((id) => {
        const i = byItem.get(id);
        return { contentId: id, kind: i?.kind ?? "video", link: i?.link ?? null, postedOn: i?.posted_on ?? null };
      }),
    };
  });
}
