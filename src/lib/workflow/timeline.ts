import "server-only";
import { sql } from "drizzle-orm";
import { AL, rows } from "@/lib/analytics/sql";
import { dayKL, fmtDayLabel } from "@/lib/time";
import { getCommitments } from "./commitments";
import { creatorEventLog, getWorkflowStates } from "./events";

export type TimelineEntry = {
  at: string; // ISO instant (sorting) – displayed in Kuala Lumpur
  day: string;
  kind: "contacted" | "promised" | "rescheduled" | "needs_help" | "paused" | "resumed" | "sample" | "content" | "legacy";
  text: string;
  by: string | null;
  link?: string | null;
  eventId?: number;
  undone?: boolean;
  batch?: boolean;
  synthetic?: boolean;
};

export type CreatorWorkspace = {
  summary: {
    status: "active" | "paused";
    lastContactedAt: string | null;
    lastContactedBy: string | null;
    nextOn: string | null;
    nextKind: string | null;
    promiseOn: string | null;
    promiseState: string | null;
    samples: number;
    verifiedContent: number;
    gmvSinceContact: number | null;
    gmv28: number;
  };
  entries: TimelineEntry[];
};

/** Everything that happened with one creator, from the records themselves (nothing is typed twice). */
export async function getCreatorWorkspace(username: string): Promise<CreatorWorkspace> {
  const [log, states, comms, samples, content, [sales], legacy] = await Promise.all([
    creatorEventLog(username, 80),
    getWorkflowStates([username]),
    getCommitments([username]),
    rows<{ product: string; delivered: Date | null; approved: Date | null; result: string }>(sql`
      select coalesce(k.name, s.variation, s.seller_sku, 'Sample') as product, s.delivered_at as delivered, s.approved_at as approved,
        coalesce(s.result_override, s.result) as result
      from samples s left join sku_items k on upper(k.sku) = upper(s.seller_sku)
      where s.creator = ${username} and s.source = 'orders' and coalesce(s.result_override, s.result) <> 'cancelled'`),
    rows<{ content_id: string; kind: string; link: string | null; at: Date | null; source: string }>(sql`
      select sc.content_id, sc.kind, sc.link, min(sc.posted_at) as at, 'system' as source
      from sample_content sc join samples s on s.id = sc.sample_id
      where s.creator = ${username} and sc.confidence = 'confirmed'
        and coalesce((select d.decision from content_decisions d where d.reverted_at is null and d.sample_id = sc.sample_id and d.content_id = sc.content_id order by d.at desc, d.id desc limit 1), '') <> 'rejected'
      group by sc.content_id, sc.kind, sc.link
      union all
      select d.content_id, 'video', d.link, d.at, 'staff' from (
        select distinct on (content_id, commitment_id, sample_id) * from content_decisions
        where username = ${username} and reverted_at is null and content_id is not null
        order by content_id, commitment_id, sample_id, at desc, id desc) d
      where d.decision = 'verified'`),
    rows<{ since: number | null; g28: number }>(sql`
      select
        (select coalesce(sum(al.pay) filter (where al.valid), 0)::float8 from ${AL} where al.creator = ${username}
          and al.created_at >= (select max(at) from staff_events where username = ${username} and kind = 'contacted' and reverted_at is null)) as since,
        coalesce((select coalesce(sum(al.pay) filter (where al.valid), 0)::float8 from ${AL} where al.creator = ${username}
          and al.created_at >= (select max(created_at) from order_lines) - interval '28 days'), 0) as g28`),
    rows<{ title: string; status: string; note: string | null; at: Date; dated: boolean }>(sql`
      select title, status::text as status, note, coalesce(completed_at at time zone 'UTC', created_at at time zone 'UTC') as at, completed_at is not null as dated
      from actions where username = ${username} and (note is not null or status::text in ('sent', 'done', 'dismissed'))`),
  ]);
  const st = states.get(username);
  const entries: TimelineEntry[] = [];
  const LABEL: Record<string, string> = {
    contacted: "Contacted",
    promised: "Promised to post",
    rescheduled: "Moved the promised date",
    needs_help: "Needs help",
    paused: "Paused",
    resumed: "Resumed",
  };
  for (const e of log) {
    const d = (e.details ?? {}) as Record<string, string | null>;
    if (e.kind === "note") continue;
    let text = LABEL[e.kind] ?? e.kind;
    if (e.kind === "contacted" && d.action) text += ` – ${d.action}${d.product ? ` (${d.product})` : ""}`;
    if (e.kind === "promised") {
      text += d.promisedOn ? ` by ${fmtDayLabel(d.promisedOn)}` : "";
      const bits = [d.quantity ? `${d.quantity}` : null, d.contentType === "live" ? "LIVE" : d.contentType === "video" ? "video" : null].filter(Boolean).join(" ");
      if (bits) text += ` (${bits})`;
      if (d.details) text += ` – ${d.details}`;
    }
    if (e.kind === "rescheduled") text += d.fromOn && d.toOn ? `: ${fmtDayLabel(d.fromOn)} → ${fmtDayLabel(d.toOn)}` : "";
    if ((e.details as Record<string, unknown> | null)?.legacy === true) text += " (recorded in the old Action centre)";
    if (e.kind === "needs_help") text += `: ${d.reason ?? ""}${d.nextOn ? ` (next ${fmtDayLabel(d.nextOn)})` : ""}`;
    if (e.kind === "paused") text += `: ${d.reason ?? ""}${d.resumeOn ? ` (until ${fmtDayLabel(d.resumeOn)})` : ""}`;
    entries.push({
      at: e.at.toISOString(), day: dayKL(e.at), kind: e.kind as TimelineEntry["kind"], text, by: e.userName ?? null,
      eventId: e.id, undone: !!e.revertedAt, batch: !!e.batchId, synthetic: e.synthetic,
    });
  }
  for (const s of samples) {
    const at = s.delivered ?? s.approved;
    if (!at) continue;
    entries.push({ at: new Date(at).toISOString(), day: dayKL(at), kind: "sample", text: `${s.delivered ? "Sample delivered" : "Sample approved"}: ${s.product}`, by: null });
  }
  for (const c of content) {
    if (!c.at) continue;
    entries.push({
      at: new Date(c.at).toISOString(), day: dayKL(c.at), kind: "content",
      text: `${c.source === "staff" ? "Content confirmed by staff" : "Content seen in the reports"} (${c.kind === "live" ? "LIVE" : "video"})`, by: null, link: c.link,
    });
  }
  // The old Action centre: shown as it was recorded. Only the dates it really has are used (open items show when they were created).
  for (const l of legacy) {
    entries.push({
      at: new Date(l.at).toISOString(), day: dayKL(l.at), kind: "legacy",
      text: `Earlier Action centre – ${l.title}: ${l.status}${l.dated ? "" : " (no completion date recorded; shown at creation)"}${l.note ? ` – “${l.note}”` : ""}`, by: null,
    });
  }
  entries.sort((a, b) => b.at.localeCompare(a.at));
  const open = comms.find((c) => c.state !== "fulfilled") ?? comms[comms.length - 1] ?? null; // earliest outstanding current deadline
  return {
    summary: {
      status: st?.status ?? "active",
      lastContactedAt: st?.lastContactedAt?.toISOString() ?? null,
      lastContactedBy: null,
      nextOn: st?.nextOn ?? null,
      nextKind: st?.nextKind ?? null,
      promiseOn: open?.dueOn ?? null,
      promiseState: open ? (open.needed > 1 ? `${open.state}:${open.done}/${open.needed}` : open.state) : null,
      samples: samples.length,
      verifiedContent: new Set(content.map((c) => c.content_id)).size,
      gmvSinceContact: sales?.since ?? null,
      gmv28: sales?.g28 ?? 0,
    },
    entries,
  };
}
