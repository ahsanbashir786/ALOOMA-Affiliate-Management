import "server-only";
import { sql } from "drizzle-orm";
import { rows } from "@/lib/analytics/sql";
import { getSampleLines } from "@/lib/samples/analysis";
import { LINE_STATES } from "@/lib/samples/states";
import { fmtDateTimeKL, fmtDayLabel, todayKL, daysBetweenISO } from "@/lib/time";
import { getCommitments } from "./commitments";
import { getWorkflowStates } from "./events";
import { RELATIONSHIP } from "./relationship";
import { loadRelationships } from "./relationships";
import { getCreatorWorkspace } from "./timeline";

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
  canAct: boolean;
};

export async function getCreatorPanel(username: string, canAct: boolean): Promise<PanelData> {
  const today = todayKL();
  const [rel, comms, lines, ws, states, contact] = await Promise.all([
    loadRelationships([username]),
    getCommitments([username]),
    getSampleLines([username]),
    getCreatorWorkspace(username),
    getWorkflowStates([username]),
    rows<{ phone: string | null }>(sql`select phone from creators where username = ${username}`),
  ]);
  const st = states.get(username);
  const r = rel.get(username)?.status ?? "prospect";
  const open = comms.filter((c) => c.state !== "fulfilled").sort((a, b) => a.dueOn.localeCompare(b.dueOn));
  const next = open[0]
    ? `${open[0].dueOn < today ? `Promise ${daysBetweenISO(open[0].dueOn, today)}d overdue` : `Promise due ${fmtDayLabel(open[0].dueOn)}`}`
    : st?.nextOn
      ? `Follow-up ${fmtDayLabel(st.nextOn)}`
      : null;
  const sampleLines = lines.get(username) ?? [];

  // evidence: pieces counted for promises, plus videos found for samples – each piece once
  const seen = new Map<string, PanelData["evidence"][number]>();
  const ids = [...new Set(comms.flatMap((c) => c.contentIds))];
  const items = ids.length
    ? await rows<{ content_id: string; kind: string; link: string | null; posted: string | null; first: string | null; source: string }>(sql`
        select content_id, kind, link, to_char(posted_at, 'YYYY-MM-DD') as posted, to_char(first_observed_on, 'YYYY-MM-DD') as first, source
        from content_items where content_id in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`)
    : [];
  for (const i of items)
    seen.set(i.content_id, { id: i.content_id, kind: i.kind, when: i.posted ? `posted ${fmtDayLabel(i.posted)}` : `first seen ${i.first ? fmtDayLabel(i.first) : "?"} · posting date unknown`, link: i.link, source: "counts for a promise" });
  for (const l of sampleLines)
    for (const v of l.videos.filter((x) => x.product)) if (!seen.has(v.id)) seen.set(v.id, { id: v.id, kind: "video", when: v.postedAt ? `posted ${fmtDayLabel(v.postedAt)}` : "posting date unknown", link: v.link, source: "found for a sample" });

  return {
    username,
    relationship: { key: r, ...RELATIONSHIP[r] },
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
    samples: sampleLines.map((l) => ({
      id: l.id,
      product: l.name ?? l.variation ?? l.sku ?? "Sample",
      qty: l.quantity,
      approvedLabel: l.approvedAt ? fmtDayLabel(l.approvedAt) : null,
      shippedLabel: l.shippedAt ? fmtDayLabel(l.shippedAt) : null,
      deliveredLabel: l.deliveredAt ? fmtDayLabel(l.deliveredAt) : null,
      postByLabel: l.dueAt ? fmtDayLabel(l.dueAt) : null,
      agreed: l.postBySource === "agreed",
      stateLabel: LINE_STATES[l.state].label,
      stateTone: LINE_STATES[l.state].tone as Tone,
      result: l.result,
    })),
    evidence: [...seen.values()],
    history: ws.entries.slice(0, 30).map((e) => ({ at: fmtDateTimeKL(e.at), text: e.text, by: e.by, undone: !!e.undone, eventId: e.eventId })),
    canAct,
  };
}
