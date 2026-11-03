import "server-only";
import { sql } from "drizzle-orm";
import { AL, rows } from "@/lib/analytics/sql";
import { dayKL, fmtDayLabel } from "@/lib/time";
import { getCommitments } from "./commitments";
import { creatorEventLog, getWorkflowStates } from "./events";

export type TimelineEntry = {
  at: string; // ISO instant (sorting) – displayed in Kuala Lumpur
  day: string;
  kind: "contacted" | "promised" | "needs_help" | "paused" | "resumed" | "sample" | "content" | "promise_kept";
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
  const [log, states, comms, samples, content, [sales]] = await Promise.all([
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
        and not exists (select 1 from content_decisions d where d.decision = 'rejected' and d.reverted_at is null and d.sample_id = sc.sample_id and d.content_id = sc.content_id)
      group by sc.content_id, sc.kind, sc.link
      union all
      select d.content_id, 'video', d.link, d.at, 'staff' from content_decisions d
      where d.username = ${username} and d.decision = 'verified' and d.reverted_at is null`),
    rows<{ since: number | null; g28: number }>(sql`
      select
        (select coalesce(sum(al.pay) filter (where al.valid), 0)::float8 from ${AL} where al.creator = ${username}
          and al.created_at >= (select max(at) from staff_events where username = ${username} and kind = 'contacted' and reverted_at is null)) as since,
        coalesce((select coalesce(sum(al.pay) filter (where al.valid), 0)::float8 from ${AL} where al.creator = ${username}
          and al.created_at >= (select max(created_at) from order_lines) - interval '28 days'), 0) as g28`),
  ]);
  const st = states.get(username);
  const entries: TimelineEntry[] = [];
  const LABEL: Record<string, string> = {
    contacted: "Contacted",
    promised: "Promised to post",
    needs_help: "Needs help",
    paused: "Paused",
    resumed: "Resumed",
  };
  for (const e of log) {
    const d = (e.details ?? {}) as Record<string, string | null>;
    if (e.kind === "note") continue;
    let text = LABEL[e.kind] ?? e.kind;
    if (e.kind === "promised") text += d.promisedOn ? ` by ${fmtDayLabel(d.promisedOn)}${d.details ? ` – ${d.details}` : ""}` : "";
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
  entries.sort((a, b) => b.at.localeCompare(a.at));
  const open = comms.find((c) => c.state !== "fulfilled") ?? comms[comms.length - 1] ?? null;
  return {
    summary: {
      status: st?.status ?? "active",
      lastContactedAt: st?.lastContactedAt?.toISOString() ?? null,
      lastContactedBy: null,
      nextOn: st?.nextOn ?? null,
      nextKind: st?.nextKind ?? null,
      promiseOn: open?.promisedOn ?? null,
      promiseState: open?.state ?? null,
      samples: samples.length,
      verifiedContent: new Set(content.map((c) => c.content_id)).size,
      gmvSinceContact: sales?.since ?? null,
      gmv28: sales?.g28 ?? 0,
    },
    entries,
  };
}
