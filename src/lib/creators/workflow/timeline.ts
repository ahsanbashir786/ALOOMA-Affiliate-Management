import "server-only";
import { dayKL, fmtDayLabel } from "@/lib/time";
import { getCommitments } from "./commitments";
import { creatorEventLog, getWorkflowStates } from "./events";

export type TimelineEntry = {
  at: string; // ISO instant (sorting) – displayed in Kuala Lumpur
  day: string;
  kind: "contacted" | "promised" | "rescheduled" | "needs_help" | "paused" | "resumed";
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
  };
  entries: TimelineEntry[];
};

const LABEL: Record<string, string> = {
  contacted: "Contacted",
  promised: "Promised to post",
  rescheduled: "Moved the promised date",
  needs_help: "Needs help",
  paused: "Paused",
  resumed: "Resumed",
};

/** What staff did with one creator, from the event log (nothing is typed twice). */
export async function getCreatorWorkspace(username: string): Promise<CreatorWorkspace> {
  const [log, states, comms] = await Promise.all([creatorEventLog(username, 80), getWorkflowStates([username]), getCommitments([username])]);
  const st = states.get(username);
  const entries: TimelineEntry[] = [];
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
    if (e.kind === "needs_help") text += `: ${d.reason ?? ""}${d.nextOn ? ` (next ${fmtDayLabel(d.nextOn)})` : ""}`;
    if (e.kind === "paused") text += `: ${d.reason ?? ""}${d.resumeOn ? ` (until ${fmtDayLabel(d.resumeOn)})` : ""}`;
    entries.push({
      at: e.at.toISOString(), day: dayKL(e.at), kind: e.kind as TimelineEntry["kind"], text, by: e.userName ?? null,
      eventId: e.id, undone: !!e.revertedAt, batch: !!e.batchId, synthetic: e.synthetic,
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
    },
    entries,
  };
}
