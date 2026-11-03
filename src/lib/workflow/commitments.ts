import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { commitments } from "@/db/schema";
import { rows } from "@/lib/analytics/sql";

/**
 * A commitment is a promise the creator made (a date, and optionally what). It is separate from staff tasks:
 * "contact the creator" can be completed by staff, but a commitment is only fulfilled by verified content –
 * never by a click or a button.
 */
export type CommitmentState = "open" | "review" | "fulfilled";

export type CommitmentRow = {
  id: number;
  username: string;
  promisedOn: string;
  details: string | null;
  sampleIds: number[];
  recordedAt: string;
  recordedBy: string | null;
  state: CommitmentState;
  /** The content that fulfilled it (if any). */
  contentId: string | null;
  contentLink: string | null;
  contentAt: string | null;
  contentSource: "system" | "staff" | null;
  /** True when the content appeared on or before the promised date. */
  onTime: boolean | null;
};

/** Open samples of a creator that a new promise is about (delivered or on the way, not cancelled, not already posted). */
export async function openSampleIds(username: string): Promise<number[]> {
  const r = await rows<{ id: number }>(sql`
    select id from samples where creator = ${username} and source = 'orders'
      and coalesce(result_override, result) in ('in_transit', 'in_window', 'not_posted', 'uncertain')`);
  return r.map((x) => x.id);
}

export async function createCommitment(input: { username: string; eventId: number; promisedOn: string; details?: string | null }): Promise<number[]> {
  const sampleIds = await openSampleIds(input.username);
  await db.insert(commitments).values({
    username: input.username,
    eventId: input.eventId,
    promisedOn: input.promisedOn,
    details: input.details?.trim() || null,
    sampleIds,
  });
  return sampleIds;
}

/**
 * Commitments that still count (their "promised" event was not undone), with fulfilment derived from content:
 *  • system-confirmed content for one of the commitment's own samples, posted on/after the day it was recorded;
 *  • or content staff verified for that commitment/sample.
 * Content for another product or creator never fulfils it. Possible (uncertain) matches only make it "review".
 */
export async function getCommitments(usernames?: string[]): Promise<CommitmentRow[]> {
  const filter = usernames ? sql`and c.username in (${sql.join(usernames.map((u) => sql`${u}`), sql`, `)})` : sql``;
  if (usernames && !usernames.length) return [];
  const r = await rows<{
    id: number; username: string; promised_on: string; details: string | null; sample_ids: number[]; recorded_at: string; recorded_by: string | null;
    sys_id: string | null; sys_link: string | null; sys_at: string | null;
    man_id: string | null; man_link: string | null; man_at: string | null;
    unc: number;
  }>(sql`
    select c.id, c.username, to_char(c.promised_on, 'YYYY-MM-DD') as promised_on, c.details, c.sample_ids,
      to_char(e.at at time zone 'Asia/Kuala_Lumpur', 'YYYY-MM-DD') as recorded_at, u.name as recorded_by,
      sys.content_id as sys_id, sys.link as sys_link, to_char(sys.posted_at, 'YYYY-MM-DD') as sys_at,
      man.content_id as man_id, man.link as man_link, to_char(man.at at time zone 'Asia/Kuala_Lumpur', 'YYYY-MM-DD') as man_at,
      coalesce(unc.n, 0)::int as unc
    from commitments c
    join staff_events e on e.id = c.event_id and e.reverted_at is null
    left join users u on u.id = e.user_id
    left join lateral (
      select sc.content_id, sc.link, sc.posted_at from sample_content sc
      where sc.sample_id = any(c.sample_ids) and sc.confidence = 'confirmed'
        and sc.posted_at::date >= (e.at at time zone 'Asia/Kuala_Lumpur')::date
        and not exists (select 1 from content_decisions d where d.decision = 'rejected' and d.reverted_at is null
          and d.sample_id = sc.sample_id and d.content_id = sc.content_id)
      order by sc.posted_at limit 1) sys on true
    left join lateral (
      select d.content_id, d.link, d.at from content_decisions d
      where d.decision = 'verified' and d.reverted_at is null and d.username = c.username
        and (d.commitment_id = c.id or d.sample_id = any(c.sample_ids))
        and (d.at at time zone 'Asia/Kuala_Lumpur')::date >= (e.at at time zone 'Asia/Kuala_Lumpur')::date
      order by d.at limit 1) man on true
    left join lateral (
      select count(*) as n from sample_content sc
      where sc.sample_id = any(c.sample_ids) and sc.confidence = 'uncertain'
        and not exists (select 1 from content_decisions d where d.decision = 'rejected' and d.reverted_at is null
          and d.sample_id = sc.sample_id and d.content_id = sc.content_id)) unc on true
    where true ${filter}
    order by c.promised_on, c.id`);
  return r.map((x) => {
    const hasSys = x.sys_id != null;
    const hasMan = x.man_id != null;
    const state: CommitmentState = hasSys || hasMan ? "fulfilled" : x.unc > 0 ? "review" : "open";
    const at = hasSys ? x.sys_at : x.man_at;
    return {
      id: x.id,
      username: x.username,
      promisedOn: x.promised_on,
      details: x.details,
      sampleIds: x.sample_ids,
      recordedAt: x.recorded_at,
      recordedBy: x.recorded_by,
      state,
      contentId: hasSys ? x.sys_id : x.man_id,
      contentLink: hasSys ? x.sys_link : x.man_link,
      contentAt: at,
      contentSource: hasSys ? "system" : hasMan ? "staff" : null,
      onTime: at ? at <= x.promised_on : null,
    };
  });
}
