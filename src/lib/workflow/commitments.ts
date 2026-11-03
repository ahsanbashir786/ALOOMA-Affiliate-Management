import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { commitmentChanges, commitments } from "@/db/schema";
import { rows } from "@/lib/analytics/sql";
import { sampleProducts } from "@/lib/samples/pid";
import { allocate, type CommitmentInput, type ContentPiece, type DecisionInput } from "./fulfilment";

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
  sampleIds: number[];
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

/** Open samples of a creator a new promise may relate to (delivered or on the way, not cancelled, not already posted). */
export async function openSampleIds(username: string): Promise<number[]> {
  const r = await rows<{ id: number }>(sql`
    select id from samples where creator = ${username} and source = 'orders'
      and coalesce(result_override, result) in ('in_transit', 'in_window', 'not_posted', 'uncertain')`);
  return r.map((x) => x.id);
}

export async function createCommitment(input: {
  username: string;
  eventId: number;
  promisedOn: string;
  details?: string | null;
  productId?: string | null;
  contentType?: "video" | "live" | null;
  quantity?: number | null;
}): Promise<{ sampleIds: number[]; productId: string | null }> {
  const sampleIds = await openSampleIds(input.username);
  let productId = input.productId || null;
  if (!productId && sampleIds.length) {
    // the promise is naturally about the sample – only when all open samples are one product
    const pids = new Set([...(await sampleProducts(sampleIds)).values()].filter((x): x is string => !!x));
    if (pids.size === 1) productId = [...pids][0];
  }
  await db.insert(commitments).values({
    username: input.username,
    eventId: input.eventId,
    promisedOn: input.promisedOn,
    details: input.details?.trim() || null,
    contentType: input.contentType ?? null,
    quantity: input.quantity && input.quantity > 0 ? Math.min(input.quantity, 50) : null,
    productId,
    sampleIds,
  });
  await refreshCommitments();
  return { sampleIds, productId };
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
    content_type: string | null; quantity: number | null; product_id: string | null; sample_ids: number[]; sample_products: string[];
  }>(sql`
    select c.id, c.username, to_char(e.at at time zone 'Asia/Kuala_Lumpur', 'YYYY-MM-DD') as recorded_on, c.id as seq,
      to_char(c.promised_on, 'YYYY-MM-DD') as original_on,
      to_char(coalesce((select ch.to_on from commitment_changes ch join staff_events ce on ce.id = ch.event_id and ce.reverted_at is null
        where ch.commitment_id = c.id order by ce.at desc, ch.id desc limit 1), c.promised_on), 'YYYY-MM-DD') as due_on,
      c.content_type, c.quantity, c.product_id, c.sample_ids,
      coalesce((select array_agg(distinct s.product_id) from samples s where s.id = any(c.sample_ids) and s.product_id is not null), '{}') as sample_products
    from commitments c join staff_events e on e.id = c.event_id and e.reverted_at is null`);
  await db.execute(sql`delete from commitment_status`);
  if (!cs.length) return;
  const users = [...new Set(cs.map((c) => c.username))];
  const inUsers = sql.join(users.map((u) => sql`${u}`), sql`, `);
  const items = await rows<{ content_id: string; creator: string; kind: string; product_ids: string[]; posted_on: string | null; first_on: string | null }>(sql`
    select content_id, creator, kind, product_ids, to_char(posted_at, 'YYYY-MM-DD') as posted_on, to_char(first_observed_on, 'YYYY-MM-DD') as first_on
    from content_items where creator in (${inUsers})`);
  const decs = await rows<{ username: string; content_id: string | null; decision: string; commitment_id: number | null; sample_id: number | null; shared: boolean; decided_on: string }>(sql`
    select username, content_id, decision, commitment_id, sample_id, shared, to_char(at at time zone 'Asia/Kuala_Lumpur', 'YYYY-MM-DD') as decided_on
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
      productIds: c.product_id ? [c.product_id] : c.sample_products,
    }));
    const pieces: ContentPiece[] = items
      .filter((i) => i.creator === u)
      .map((i) => ({ contentId: i.content_id, kind: i.kind === "live" ? "live" : "video", productIds: i.product_ids ?? [], postedOn: i.posted_on, firstObservedOn: i.first_on }));
    const decisions: DecisionInput[] = decs
      .filter((d) => d.username === u && d.content_id)
      .map((d) => ({
        contentId: d.content_id!,
        decision: d.decision === "verified" ? "verified" : "rejected",
        commitmentId: d.commitment_id,
        sampleLinked: d.sample_id != null,
        shared: d.shared,
        decidedOn: d.decided_on,
        appliesTo: d.commitment_id != null ? [d.commitment_id] : d.sample_id != null ? mine.filter((c) => c.sample_ids.includes(d.sample_id!)).map((c) => c.id) : [],
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
    quantity: number | null; product_id: string | null; product_name: string | null; sample_ids: number[]; recorded_at: string; recorded_by: string | null;
    state: string; needed: number; done: number; completed_on: string | null; timing: string | null; content_ids: string[]; candidate_ids: string[];
  }>(sql`
    select c.id, c.event_id, c.username, to_char(c.promised_on, 'YYYY-MM-DD') as original_on, to_char(st.due_on, 'YYYY-MM-DD') as due_on,
      (select count(*) from commitment_changes ch join staff_events ce on ce.id = ch.event_id and ce.reverted_at is null where ch.commitment_id = c.id)::int as changes,
      c.details, c.content_type, c.quantity, c.product_id, p.short_name as product_name, c.sample_ids,
      to_char(e.at at time zone 'Asia/Kuala_Lumpur', 'YYYY-MM-DD') as recorded_at, u.name as recorded_by,
      st.state, st.needed, st.done, to_char(st.completed_on, 'YYYY-MM-DD') as completed_on, st.timing, st.content_ids, st.candidate_ids
    from commitments c
    join staff_events e on e.id = c.event_id and e.reverted_at is null
    join commitment_status st on st.commitment_id = c.id
    left join users u on u.id = e.user_id
    left join products p on p.product_id = c.product_id
    where true ${filter}
    order by st.due_on, c.id`);
  const ids = [...new Set(r.flatMap((x) => [...x.content_ids, ...x.candidate_ids]))];
  const items = ids.length
    ? await rows<{ content_id: string; kind: string; link: string | null; posted_on: string | null }>(sql`
        select content_id, kind, link, to_char(posted_at, 'YYYY-MM-DD') as posted_on from content_items where content_id in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`)
    : [];
  const byItem = new Map(items.map((i) => [i.content_id, i]));
  const verified = r.length
    ? await rows<{ commitment_id: number | null; sample_id: number | null; content_id: string }>(sql`
        select commitment_id, sample_id, content_id from content_decisions where decision = 'verified' and reverted_at is null and content_id is not null
          and username in (${sql.join([...new Set(r.map((x) => x.username))].map((x) => sql`${x}`), sql`, `)})`)
    : [];
  return r.map((x) => {
    const staff = verified.some((v) => x.content_ids.includes(v.content_id) && (v.commitment_id === x.id || (v.commitment_id == null && v.sample_id != null && x.sample_ids.includes(v.sample_id))));
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
      productName: x.product_name,
      sampleIds: x.sample_ids,
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
