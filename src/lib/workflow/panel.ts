import "server-only";
import { sql } from "drizzle-orm";
import { AL, rows } from "@/lib/analytics/sql";
import { getSampleLines } from "@/lib/samples/analysis";
import { LINE_STATES } from "@/lib/samples/states";
import { fmtDateTimeKL, fmtDayLabel, todayKL, daysBetweenISO } from "@/lib/time";
import { getCommitments } from "./commitments";
import { getWorkflowStates } from "./events";
import { RELATIONSHIP } from "./relationship";
import { loadRelationships } from "./relationships";
import { getCreatorWorkspace } from "./timeline";
import { hasSyncedData } from "@/lib/creators/load";
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
  const [vid] = await rows<{ n: number }>(sql`select count(*)::int as n from content_items where creator = ${username} and posted_at is not null and posted_at::date >= (${today}::date - 27)`);
  const [ref] = await rows<{ d: string | null }>(sql`select to_char(max(created_at), 'YYYY-MM-DD') as d from order_lines`);
  const wk = ref?.d
    ? await rows<{ w: number; g: number }>(sql`
        select floor((${ref.d}::date - al.created_at::date) / 7)::int as w, coalesce(sum(al.pay) filter (where al.valid), 0)::float8 as g
        from ${AL} where al.creator = ${username} and al.created_at::date > ${ref.d}::date - 56 and al.created_at::date <= ${ref.d}::date group by 1`)
    : [];
  const weeks = Array.from({ length: 8 }, (_, i) => wk.find((x) => x.w === 7 - i)?.g ?? 0);
  const posted = sampleLines.filter((l) => l.result === "posted_video" || l.result === "did_live");
  const judgedLines = sampleLines.filter((l) => ["posted_video", "did_live", "not_posted"].includes(l.result));
  const days = posted.map((l) => {
    const first = l.videos.map((v) => v.postedAt).filter(Boolean).sort()[0];
    return first && l.deliveredAt ? daysBetweenISO(String(l.deliveredAt).slice(0, 10), String(first).slice(0, 10)) : null;
  }).filter((x): x is number => x != null && x >= 0);
  // Once TikTok data is synced, the numbers come from it (the same as the Creators page).
  const syn = (await hasSyncedData()) ? await getCreatorProfile(username) : null;
  const sj = syn?.samples.filter((x) => x.result === "posted" || x.result === "not_posted") ?? [];
  const sd = syn?.samples.map((x) => x.daysToPost).filter((x): x is number => x != null) ?? [];
  const lastA = ws.entries.find((e) => !e.undone && e.kind === "contacted");
  const judged = comms.filter((c) => c.state === "fulfilled" || c.dueOn < today);

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
    relationship: syn ? synRelationship(syn.row.lines) : { key: r, ...RELATIONSHIP[r] },
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
    samples: syn
      ? syn.samples.map((x, i) => ({
          id: i + 1, product: x.product, qty: 1, approvedLabel: x.requestedOn ? fmtDayLabel(x.requestedOn) : null, shippedLabel: x.shippedOn ? fmtDayLabel(x.shippedOn) : null,
          deliveredLabel: x.deliveredOn ? fmtDayLabel(x.deliveredOn) : null, postByLabel: x.postByOn ? fmtDayLabel(x.postByOn) : null, agreed: false, stateLabel: x.stage,
          stateTone: (x.result === "posted" ? "good" : x.result === "not_posted" ? "critical" : x.result === "waiting" ? "brand" : x.result === "pending" ? "warn" : "neutral") as Tone,
          result: x.result === "posted" ? "posted_video" : x.result,
        }))
      : sampleLines.map((l) => ({
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
    profile: {
      promisesJudged: judged.length,
      promisesOnTime: judged.filter((c) => c.state === "fulfilled" && c.timing === "on_time").length,
      videos28: syn ? syn.row.extra!.videos28 : (vid?.n ?? 0),
      lastSaleLabel: syn ? (syn.row.extra!.lastSaleOn ? fmtDayLabel(syn.row.extra!.lastSaleOn) : null) : rel.get(username)?.lastSaleOn ? fmtDayLabel(rel.get(username)!.lastSaleOn!) : null,
    },
    performance: {
      weeks: syn ? syn.row.extra!.weeks : weeks,
      gmv28: syn ? syn.row.extra!.gmv28 : weeks.slice(4).reduce((a, b) => a + b, 0),
      prev28: syn ? syn.row.extra!.prev28 : weeks.slice(0, 4).reduce((a, b) => a + b, 0),
      postingRate: syn ? (sj.length ? { posted: sj.filter((x) => x.result === "posted").length, judged: sj.length } : null) : judgedLines.length ? { posted: posted.length, judged: judgedLines.length } : null,
      avgDaysToPost: syn ? (sd.length ? Math.round(sd.reduce((a, b) => a + b, 0) / sd.length) : null) : days.length ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) : null,
      lastAction: lastA ? { text: lastA.text, by: lastA.by ?? null, at: fmtDayLabel(lastA.day) } : null,
      nextFollowUp: st?.nextOn ? fmtDayLabel(st.nextOn) : null,
      contacts: st?.contactTimes.length ?? 0,
    },
    canAct,
  };
}
