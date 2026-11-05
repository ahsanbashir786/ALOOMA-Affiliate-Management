import "server-only";
import { sql } from "drizzle-orm";
import { rows } from "@/lib/sql";
import { fmtDateTimeKL, fmtDayLabel, todayKL, daysBetweenISO } from "@/lib/time";
import { getCommitments } from "./commitments";
import { getWorkflowStates } from "./events";
import { getCreatorWorkspace } from "./timeline";
import { getCreatorProfile } from "@/lib/creators/profile";

type Tone = "neutral" | "brand" | "good" | "warn" | "critical" | "serious";

/** Everything the creator side panel shows – composed from the same records as the rest of the app (nothing new is stored). */
export type PanelData = {
  username: string;
  relationship: { key: string; label: string; tone: Tone; hint: string };
  phone: string | null;
  paused: boolean;
  next: string | null;
  obligations: {
    id: number; label: string; contentType: "video" | "live" | null; done: number; needed: number; dueLabel: string; originalLabel: string | null;
    lateDays: number | null; state: string; timing: string | null;
    candidates: { contentId: string; kind: string; link: string | null; postedLabel: string | null }[];
  }[];
  samples: { id: number; product: string; qty: number; approvedLabel: string | null; shippedLabel: string | null; deliveredLabel: string | null; postByLabel: string | null; agreed: boolean; stateLabel: string; stateTone: Tone; result: string }[];
  evidence: { id: string; kind: string; when: string; link: string | null; source: string }[];
  history: { at: string; text: string; by: string | null; undone: boolean; eventId?: number }[];
  /** Plain track record from the records: promises kept, recent output, last sale. */
  profile: { promisesJudged: number; promisesOnTime: number; videos28: number; lastSaleLabel: string | null };
  /** How this creator is doing: 8 weekly GMV points, 28-day change, posting rate for samples, last action and next follow-up. */
  performance: {
    weeks: number[];
    gmv28: number;
    prev28: number;
    postingRate: { posted: number; judged: number } | null;
    avgDaysToPost: number | null;
    lastAction: { text: string; by: string | null; at: string } | null;
    nextFollowUp: string | null;
    contacts: number;
  };
  canAct: boolean;
};

const STATUS_TONE: Record<string, Tone> = { Winner: "good", Rising: "good", Steady: "neutral", Slipping: "warn", Quiet: "warn", Silent: "critical", Waiting: "neutral", Posted: "brand", New: "brand", Paused: "neutral" };
/** With synced data the badge on top is the creator's headline status, the same word the Creators table shows. */
function synRelationship(lines: { status: string; reason: string }[]): PanelData["relationship"] {
  const l = lines.find((x) => x.status !== "Steady") ?? lines[0];
  return { key: l.status.toLowerCase(), label: l.status, tone: STATUS_TONE[l.status] ?? "neutral", hint: l.reason };
}

export async function getCreatorPanel(username: string, canAct: boolean): Promise<PanelData> {
  const today = todayKL();
  const [comms, ws, states, contact, syn] = await Promise.all([
    getCommitments([username]),
    getCreatorWorkspace(username),
    getWorkflowStates([username]),
    rows<{ phone: string | null }>(sql`select phone from creators where username = ${username}`),
    getCreatorProfile(username),
  ]);
  const st = states.get(username);
  const open = comms.filter((c) => c.state !== "fulfilled").sort((a, b) => a.dueOn.localeCompare(b.dueOn));
  const next = open[0]
    ? `${open[0].dueOn < today ? `Promise ${daysBetweenISO(open[0].dueOn, today)}d overdue` : `Promise due ${fmtDayLabel(open[0].dueOn)}`}`
    : st?.nextOn
      ? `Follow-up ${fmtDayLabel(st.nextOn)}`
      : null;
  const sj = syn?.samples.filter((x) => x.result === "posted" || x.result === "not_posted") ?? [];
  const sd = syn?.samples.map((x) => x.daysToPost).filter((x): x is number => x != null) ?? [];
  const lastA = ws.entries.find((e) => !e.undone && e.kind === "contacted");
  const judged = comms.filter((c) => c.state === "fulfilled" || c.dueOn < today);
  const extra = syn?.row.extra;

  // evidence: the videos and LIVEs counted for promises, each once
  const ids = [...new Set(comms.flatMap((c) => c.contentIds))];
  const items = ids.length
    ? await rows<{ content_id: string; kind: string; link: string | null; posted: string | null; first: string | null; source: string }>(sql`
        select content_id, kind, link, to_char(posted_at, 'YYYY-MM-DD') as posted, to_char(first_observed_on, 'YYYY-MM-DD') as first, source
        from content_items where content_id in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`)
    : [];
  const evidence: PanelData["evidence"] = items.map((i) => ({
    id: i.content_id, kind: i.kind, when: i.posted ? `posted ${fmtDayLabel(i.posted)}` : `first seen ${i.first ? fmtDayLabel(i.first) : "?"} · posting date unknown`, link: i.link, source: i.source,
  }));

  return {
    username,
    relationship: syn ? synRelationship(syn.row.lines) : { key: "new", label: "New", tone: "brand", hint: "No sales or sample yet" },
    phone: contact[0]?.phone ?? null,
    paused: st?.status === "paused",
    next,
    obligations: comms
      .sort((a, b) => Number(a.state === "fulfilled") - Number(b.state === "fulfilled") || a.dueOn.localeCompare(b.dueOn))
      .map((c) => ({
        id: c.id,
        label: c.productName ?? (c.contentType ? (c.contentType === "live" ? "LIVE" : "Video") : "Content"),
        contentType: c.contentType,
        done: c.done,
        needed: c.needed,
        dueLabel: fmtDayLabel(c.dueOn),
        originalLabel: c.dueOn !== c.promisedOn ? fmtDayLabel(c.promisedOn) : null,
        lateDays: c.state !== "fulfilled" && c.dueOn < today ? daysBetweenISO(c.dueOn, today) : null,
        state: c.state,
        timing: c.timing,
        candidates: c.candidates.map((x) => ({ contentId: x.contentId, kind: x.kind, link: x.link, postedLabel: x.postedOn ? fmtDayLabel(x.postedOn) : null })),
      })),
    samples: (syn?.samples ?? []).map((x, i) => ({
      id: i + 1, product: x.product, qty: 1, approvedLabel: x.requestedOn ? fmtDayLabel(x.requestedOn) : null, shippedLabel: x.shippedOn ? fmtDayLabel(x.shippedOn) : null,
      deliveredLabel: x.deliveredOn ? fmtDayLabel(x.deliveredOn) : null, postByLabel: x.postByOn ? fmtDayLabel(x.postByOn) : null, agreed: false, stateLabel: x.stage,
      stateTone: (x.result === "posted" ? "good" : x.result === "not_posted" ? "critical" : x.result === "waiting" ? "brand" : x.result === "pending" ? "warn" : "neutral") as Tone,
      result: x.result === "posted" ? "posted_video" : x.result,
    })),
    evidence,
    history: ws.entries.slice(0, 30).map((e) => ({ at: fmtDateTimeKL(e.at), text: e.text, by: e.by, undone: !!e.undone, eventId: e.eventId })),
    profile: {
      promisesJudged: judged.length,
      promisesOnTime: judged.filter((c) => c.state === "fulfilled" && c.timing === "on_time").length,
      videos28: extra?.videos28 ?? 0,
      lastSaleLabel: extra?.lastSaleOn ? fmtDayLabel(extra.lastSaleOn) : null,
    },
    performance: {
      weeks: extra?.weeks ?? new Array(8).fill(0),
      gmv28: extra?.gmv28 ?? 0,
      prev28: extra?.prev28 ?? 0,
      postingRate: sj.length ? { posted: sj.filter((x) => x.result === "posted").length, judged: sj.length } : null,
      avgDaysToPost: sd.length ? Math.round(sd.reduce((a, b) => a + b, 0) / sd.length) : null,
      lastAction: lastA ? { text: lastA.text, by: lastA.by ?? null, at: fmtDayLabel(lastA.day) } : null,
      nextFollowUp: st?.nextOn ? fmtDayLabel(st.nextOn) : null,
      contacts: st?.contactTimes.length ?? 0,
    },
    canAct,
  };
}
