"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ChevronDown, ExternalLink, Loader2, Pause, Play, Undo2, UserCheck } from "lucide-react";
import { addCommitmentLink, decideCommitmentContent, markContacted, markNeedsHelp, markPromised, pauseCreator, rescheduleCommitmentAction, resumeCreator, undoEvent } from "@/app/actions/workflow";
import { HELP_REASONS_LIST } from "@/lib/workflow/reasons";
import { Badge, Button, Input, Select } from "@/components/ui/primitives";
import { MessageBox } from "@/components/ui/message-box";
import { followUpMessage } from "@/lib/workflow/messages";
import { cn } from "@/lib/utils";

export type TodayItem = {
  username: string;
  phone: string | null;
  tier: 1 | 2 | 3 | 4;
  relationship: { key: string; label: string; tone: "neutral" | "brand" | "good" | "warn" | "critical"; hint: string };
  opportunity: "recruit" | "develop" | "reactivate" | null;
  obligations: { id: number; label: string; contentType: "video" | "live" | null; done: number; needed: number; dueLabel: string; lateDays: number | null; moved: boolean }[];
  deadline: { label: string; tone: "critical" | "warn" | "neutral" } | null;
  history: { at: string; text: string }[];
  reasons: { kind: string; text: string }[];
  recs: { type: string; title: string; instruction: string; instructionMs: string | null }[];
  status: "active" | "paused";
  nextLabel: string | null;
  lastContacted: string | null;
  commitment: {
    id: number;
    dueLabel: string;
    /** Set only when the deadline was moved. */
    originalLabel: string | null;
    state: string;
    done: number;
    needed: number;
    contentType: "video" | "live" | null;
    productName: string | null;
    details: string | null;
    candidates: { contentId: string; kind: string; link: string | null; postedLabel: string | null }[];
  } | null;
  otherCommitments: number;
  suggest: { products: { id: string; name: string }[]; kind: "video" | "live" | null };
  attempts: number;
  suggestPause: boolean;
  samples: { id: number; product: string; approvedLabel: string | null; shippedLabel: string | null; deliveredLabel: string | null; postByLabel: string | null; agreed: boolean; result: string }[];
  held: string | null;
  pausedLabel: string | null;
  followKind: "promise" | "follow_up" | "help" | "resume";
};

type Panel = null | "promise" | "help" | "pause" | "message" | "content";
type Tone = "critical" | "serious" | "warn" | "brand" | "good" | "neutral";
const OPP: Record<string, string> = { recruit: "Recruit", develop: "Develop", reactivate: "Reactivate" };

/** Short status chips (colour + words) derived from why the creator is on the list. */
function chipsOf(it: TodayItem): { label: string; tone: Tone }[] {
  const out: { label: string; tone: Tone }[] = [];
  const add = (label: string, tone: Tone) => { if (!out.some((c) => c.label === label)) out.push({ label, tone }); };
  for (const r of it.reasons) {
    if (r.kind === "promise_overdue") add("Promise overdue", "critical");
    else if (r.kind === "followup_due") add("Follow-up due", "serious");
    else if (r.kind === "help_due") add("Help follow-up", "serious");
    else if (r.kind === "resume_due") add("Resume?", "warn");
    else if (r.kind === "promise_review" || r.kind === "sample_review") add("To verify", "warn");
    else if (r.kind === "sample") add("Sample overdue", "warn");
    else if (r.kind === "new_creator") add("New creator", "brand");
    else if (r.kind === "development") add(it.opportunity ? OPP[it.opportunity] : "Opportunity", "brand");
  }
  return out;
}

function Bar({ done, needed, tone }: { done: number; needed: number; tone: string }) {
  return (
    <span className="inline-block h-1.5 w-12 overflow-hidden rounded-full bg-line align-middle" aria-hidden>
      <span className={cn("block h-full rounded-full", tone)} style={{ width: `${Math.min(100, Math.round((done / Math.max(1, needed)) * 100))}%` }} />
    </span>
  );
}

/** Sample delivery → posting timeline: approved · shipped · delivered · post by. */
function MiniTimeline({ s }: { s: TodayItem["samples"][number] }) {
  const steps = [
    { k: "Approved", d: s.approvedLabel, done: !!s.approvedLabel },
    { k: "Shipped", d: s.shippedLabel, done: !!s.shippedLabel },
    { k: "Delivered", d: s.deliveredLabel, done: !!s.deliveredLabel },
    { k: s.agreed ? "Post by (agreed)" : "Post by", d: s.postByLabel, done: false },
  ];
  const late = s.result === "not_posted";
  return (
    <div className="flex items-center gap-1 text-[11.5px] text-ink-3" aria-label={`Sample: ${s.product}`}>
      <span className="max-w-40 truncate font-medium text-ink-2" title={s.product}>{s.product}</span>
      {steps.map((st, i) => (
        <span key={st.k} className="inline-flex items-center gap-1">
          <span className={cn("size-2 rounded-full", st.done ? "bg-good" : i === 3 ? (late ? "bg-critical" : "bg-warn") : "bg-line-strong")} />
          <span className={cn(i === 3 && late && "font-medium text-critical")}>{st.k}{st.d ? ` ${st.d}` : ""}</span>
          {i < steps.length - 1 && <span className="text-line-strong">–</span>}
        </span>
      ))}
      {s.result === "uncertain" && <span className="font-medium text-warn">· possible content</span>}
    </div>
  );
}

export function TodayList({ items, today, helpDays, canAct }: { items: TodayItem[]; today: string; helpDays: number; canAct: boolean }) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [msg, setMsg] = useState<{ text: string; undoId?: number; error?: boolean } | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ ok?: true; error?: string; eventId?: number; count?: number }>, label: string) =>
    start(async () => {
      const r = await fn();
      if (r.error) setMsg({ text: r.error, error: true });
      else {
        setMsg({ text: label, undoId: r.eventId });
        setSel(new Set());
        setConfirmBulk(false);
      }
    });

  const toggle = (u: string) => {
    const n = new Set(sel);
    if (n.has(u)) n.delete(u);
    else n.add(u);
    setSel(n);
    setConfirmBulk(false);
  };

  return (
    <div className="space-y-3">
      {canAct && sel.size > 0 && (
        <div className="sticky top-2 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-line-strong bg-surface p-3 shadow-sm">
          <span className="text-[14px] font-medium">{sel.size} selected</span>
          {!confirmBulk ? (
            <Button size="sm" onClick={() => setConfirmBulk(true)}>Mark selected as contacted…</Button>
          ) : (
            <>
              <span className="text-[13.5px] text-ink-2">Confirm: you contacted all {sel.size} selected creators.</span>
              <Button size="sm" disabled={pending} onClick={() => run(() => markContacted([...sel], sel.size), `Marked ${sel.size} creators as contacted.`)}>
                Yes, {sel.size} contacted
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setConfirmBulk(false)}>Cancel</Button>
            </>
          )}
          <button className="text-[13px] text-ink-3 underline" onClick={() => { setSel(new Set()); setConfirmBulk(false); }}>Clear selection</button>
        </div>
      )}
      {msg && (
        <div role="status" className={cn("flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-[13.5px]", msg.error ? "border-critical/40 bg-critical/10 text-critical" : "border-good/40 bg-good/10 text-ink")}>
          <span>{msg.text}</span>
          <span className="flex items-center gap-3">
            {msg.undoId && (
              <button className="inline-flex items-center gap-1 font-medium underline" disabled={pending} onClick={() => run(() => undoEvent(msg.undoId!), "Undone. The history keeps a record.")}>
                <Undo2 className="size-3.5" /> Undo
              </button>
            )}
            <button aria-label="Dismiss" onClick={() => setMsg(null)}>×</button>
          </span>
        </div>
      )}
      {items.map((it) => (
        <Row key={it.username} it={it} today={today} helpDays={helpDays} canAct={canAct} selected={sel.has(it.username)} onToggle={() => toggle(it.username)} run={run} pending={pending} />
      ))}
    </div>
  );
}

function addDays(day: string, n: number) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function Row({
  it, today, helpDays, canAct, selected, onToggle, run, pending,
}: {
  it: TodayItem; today: string; helpDays: number; canAct: boolean; selected: boolean; onToggle: () => void; pending: boolean;
  run: (fn: () => Promise<{ ok?: true; error?: string; eventId?: number }>, label: string) => void;
}) {
  const [panel, setPanel] = useState<Panel>(null);
  const [promiseDate, setPromiseDate] = useState("");
  const [promiseDetails, setPromiseDetails] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const [mode, setMode] = useState<"reschedule" | "new">(it.commitment ? "reschedule" : "new");
  const [kind, setKind] = useState<string>(it.suggest.kind ?? "");
  const [product, setProduct] = useState("");
  const [qty, setQty] = useState("");
  const [link, setLink] = useState("");
  const [helpReason, setHelpReason] = useState<string>(HELP_REASONS_LIST[0]);
  const [helpDate, setHelpDate] = useState(addDays(today, helpDays));
  const [pauseReason, setPauseReason] = useState("");
  const [resumeOn, setResumeOn] = useState("");
  const rec = it.recs[0];
  const fallback = followUpMessage(it.username, it.followKind, it.commitment?.dueLabel);
  const en = rec?.instruction ?? fallback.en;
  const ms = rec?.instructionMs ?? fallback.ms;
  const tiktok = `https://www.tiktok.com/@${encodeURIComponent(it.username)}`;
  const toggle = (p: Panel) => setPanel(panel === p ? null : p);

  const chips = chipsOf(it);
  const [open, setOpen] = useState(false);
  const lead = it.reasons[0]?.text;
  return (
    <article className="rounded-xl border border-line bg-surface" data-testid={`today-${it.username}`}>
      <div className="flex items-start gap-3 p-3">
        {canAct && !it.held ? (
          <input type="checkbox" aria-label={`Select ${it.username}`} checked={selected} onChange={onToggle} className="mt-1 size-4" />
        ) : (
          <span className="w-4" />
        )}
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link href={`/creators/${encodeURIComponent(it.username)}`} className="text-[15px] font-semibold hover:underline">@{it.username}</Link>
            <span title={it.relationship.hint}><Badge tone={it.relationship.tone}>{it.relationship.label}</Badge></span>
            {it.held ? <Badge tone="neutral">{it.status === "paused" ? "Paused" : "Scheduled"}</Badge> : chips.map((c) => <Badge key={c.label} tone={c.tone}>{c.label}</Badge>)}
            {!it.phone && <span className="text-[11.5px] text-ink-3" title="No WhatsApp number saved">no number</span>}
          </div>
          <p className="truncate text-[13px] text-ink-2" title={it.held ?? lead}>{it.held ?? lead}</p>
          {it.obligations.length > 0 && (
            <ul className="flex flex-wrap gap-1.5" aria-label="Promises">
              {it.obligations.map((o) => (
                <li key={o.id} className={cn("inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-[12px]", o.lateDays != null ? "border-critical/40 bg-critical-soft text-critical" : "border-line bg-surface-2 text-ink-2")}>
                  <span className="max-w-32 truncate font-medium" title={o.label}>{o.label}</span>
                  <span>{o.contentType === "live" ? "LIVE" : o.contentType === "video" ? "video" : ""}</span>
                  <span className="tnum font-medium">{o.done}/{o.needed}</span>
                  <Bar done={o.done} needed={o.needed} tone={o.lateDays != null ? "bg-critical" : "bg-brand"} />
                  <span>{o.lateDays != null ? `${o.lateDays}d late · ` : "due "}{o.dueLabel}{o.moved ? " (moved)" : ""}</span>
                </li>
              ))}
            </ul>
          )}
          {it.samples.slice(0, 1).map((smp) => <MiniTimeline key={smp.id} s={smp} />)}
          {it.suggestPause && (
            <p className="text-[12.5px] text-ink"><span className="rounded bg-warn-soft px-1.5 py-0.5 font-medium text-warn">Review or pause?</span> {it.attempts} recorded contacts, no promise or new content yet.</p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {it.deadline && <Badge tone={it.deadline.tone === "critical" ? "critical" : it.deadline.tone === "warn" ? "serious" : "neutral"}>{it.deadline.label}</Badge>}
        </div>
      </div>

      {canAct && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-line px-3 py-2">
          {it.status === "active" && (
            <>
              <Button size="sm" disabled={pending} onClick={() => run(() => markContacted([it.username]), `Marked @${it.username} as contacted. Follow-up scheduled.`)}>
                {pending ? <Loader2 className="size-3.5 animate-spin" /> : <UserCheck className="size-3.5" />} Contacted
              </Button>
              <Button size="sm" variant="secondary" onClick={() => toggle("promise")}>Promised date</Button>
              {it.commitment && it.commitment.candidates.length > 0 && (
                <Button size="sm" variant="secondary" onClick={() => toggle("content")}>Verify ({it.commitment.candidates.length})</Button>
              )}
              <Button size="sm" variant="secondary" onClick={() => toggle("help")}>Needs help</Button>
              <Button size="sm" variant="secondary" onClick={() => toggle("pause")}><Pause className="size-3.5" /> Pause</Button>
              <span className="mx-1 h-5 w-px bg-line" aria-hidden />
              <a href={tiktok} target="_blank" rel="noopener noreferrer" title="Opening TikTok does not count as contact" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line-strong px-2.5 text-[13px] hover:bg-surface-2">
                <ExternalLink className="size-3.5" /> TikTok
              </a>
              <Button size="sm" variant="secondary" onClick={() => toggle("message")}>{it.phone ? "WhatsApp" : "Message"} <ChevronDown className="size-3.5" /></Button>
            </>
          )}
          {it.status === "paused" && (
            <Button size="sm" disabled={pending} onClick={() => run(() => resumeCreator(it.username), `Resumed @${it.username}.`)}>
              <Play className="size-3.5" /> Resume
            </Button>
          )}
          <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="ml-auto inline-flex items-center gap-1 text-[12.5px] text-ink-3 hover:text-ink">
            Details <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
          </button>
        </div>
      )}
      {open && (
        <div className="space-y-2 border-t border-line bg-surface-2/50 px-3 py-2.5 text-[13px] text-ink-2">
          {it.reasons.length > 1 && <ul className="list-disc pl-5">{it.reasons.map((r, i) => <li key={i}>{r.text}</li>)}</ul>}
          {it.recs.length > 0 && <p><span className="text-ink-3">Suggestions:</span> {it.recs.map((r) => r.title).join(" · ")}</p>}
          {it.samples.length > 1 && <div className="space-y-1">{it.samples.slice(1).map((smp) => <MiniTimeline key={smp.id} s={smp} />)}</div>}
          {it.lastContacted && <p><span className="text-ink-3">Last contacted:</span> {it.lastContacted}{it.nextLabel ? ` · next ${it.nextLabel}` : ""}</p>}
          {it.history.length > 0 && (
            <ul className="text-[12.5px]">
              {it.history.map((h, i) => <li key={i}><span className="text-ink-3">{h.at.slice(0, 10)}</span> {h.text}</li>)}
            </ul>
          )}
          <Link href={`/creators/${encodeURIComponent(it.username)}`} className="text-brand hover:underline">Open full timeline →</Link>
        </div>
      )}

      {panel === "message" && (
        <div className="mt-3 rounded-lg bg-surface-2 p-3">
          <MessageBox en={en} ms={ms} phone={it.phone} />
          <p className="mt-2 text-[12.5px] text-ink-3">Opening WhatsApp or copying does not count as contact. Press “Contacted” after you have actually sent it.</p>
        </div>
      )}
      {panel === "promise" && (
        <form
          className="mt-3 space-y-2 rounded-lg bg-surface-2 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (it.commitment && mode === "reschedule") run(() => rescheduleCommitmentAction(it.commitment!.id, promiseDate), `Deadline moved to ${promiseDate}. The original date is kept.`);
            else
              run(
                () => markPromised(it.username, promiseDate, { details: promiseDetails || undefined, productId: product || undefined, contentType: (kind || undefined) as "video" | "live" | undefined, quantity: qty ? Number(qty) : undefined }),
                `Promise saved for @${it.username}.`,
              );
            setPanel(null);
          }}
        >
          {it.commitment && (
            <div role="group" aria-label="What changed" className="flex flex-wrap items-center gap-2 text-[13px]">
              <span className="text-ink-3">Current promise: {it.commitment.dueLabel}.</span>
              <button type="button" aria-pressed={mode === "reschedule"} onClick={() => setMode("reschedule")} className={cn("rounded-lg border px-2.5 py-1", mode === "reschedule" ? "border-brand bg-brand-soft text-brand-strong" : "border-line-strong")}>Move this date</button>
              <button type="button" aria-pressed={mode === "new"} onClick={() => setMode("new")} className={cn("rounded-lg border px-2.5 py-1", mode === "new" ? "border-brand bg-brand-soft text-brand-strong" : "border-line-strong")}>Add another promise</button>
            </div>
          )}
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-[13px]">{mode === "reschedule" && it.commitment ? "New date" : "Promised date"}<Input type="date" required min={today} value={promiseDate} onChange={(e) => setPromiseDate(e.target.value)} className="mt-1 block w-44" /></label>
            {!(it.commitment && mode === "reschedule") && !showDetails && (
              <button type="button" className="text-[13px] text-ink-3 underline" onClick={() => setShowDetails(true)}>Add details (video / product / how many)</button>
            )}
            <Button size="sm" type="submit" disabled={pending || !promiseDate}>{it.commitment && mode === "reschedule" ? "Move date" : "Save promise"}</Button>
          </div>
          {showDetails && !(it.commitment && mode === "reschedule") && (
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-[13px]">Type<Select value={kind} onChange={(e) => setKind(e.target.value)} className="mt-1 block w-32"><option value="">Not sure</option><option value="video">Video</option><option value="live">LIVE</option></Select></label>
              <label className="text-[13px]">Product<Select value={product} onChange={(e) => setProduct(e.target.value)} className="mt-1 block w-56"><option value="">Not sure</option>{it.suggest.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></label>
              <label className="text-[13px]">How many<Input type="number" min={1} max={50} value={qty} onChange={(e) => setQty(e.target.value)} placeholder="1" className="mt-1 block w-20" /></label>
              <label className="min-w-40 flex-1 text-[13px]">Note (optional)<Input value={promiseDetails} onChange={(e) => setPromiseDetails(e.target.value)} maxLength={300} className="mt-1 block w-full" /></label>
              <p className="w-full text-[12px] text-ink-3">Without a product the system cannot match videos reliably, so it will ask you to confirm instead of completing it automatically.</p>
            </div>
          )}
        </form>
      )}
      {panel === "content" && it.commitment && (
        <div className="mt-3 space-y-2 rounded-lg bg-surface-2 p-3">
          <ul className="space-y-1.5 text-[13px]">
            {it.commitment.candidates.map((c) => (
              <li key={c.contentId} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-medium">{c.kind === "live" ? "LIVE" : "Video"}</span>
                <span className="text-ink-3">{c.postedLabel ? `posted ${c.postedLabel}` : "posting date unknown"}</span>
                {c.link && <a href={c.link} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">Open</a>}
                <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => decideCommitmentContent(it.commitment!.id, c.contentId, "verified"), "Confirmed – counted for this promise.")}>This is it</Button>
                <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => decideCommitmentContent(it.commitment!.id, c.contentId, "rejected"), "Rejected – will not be suggested again.")}>Not this</Button>
              </li>
            ))}
          </ul>
          <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); run(() => addCommitmentLink(it.commitment!.id, link), "Link saved and counted."); setLink(""); }}>
            <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Or paste a video link" className="h-8 max-w-sm text-[13px]" aria-label="Video link" />
            <Button size="sm" type="submit" disabled={pending || link.trim().length < 8}>Confirm link</Button>
          </form>
        </div>
      )}
      {panel === "help" && (
        <form className="mt-3 flex flex-wrap items-end gap-2 rounded-lg bg-surface-2 p-3" onSubmit={(e) => { e.preventDefault(); run(() => markNeedsHelp(it.username, helpReason, helpDate), `@${it.username} flagged for help. Next action ${helpDate}.`); setPanel(null); }}>
          <label className="text-[13px]">Reason<Select value={helpReason} onChange={(e) => setHelpReason(e.target.value)} className="mt-1 block w-64">{HELP_REASONS_LIST.map((r) => <option key={r}>{r}</option>)}</Select></label>
          <label className="text-[13px]">Next action date<Input type="date" required min={today} value={helpDate} onChange={(e) => setHelpDate(e.target.value)} className="mt-1 block w-44" /></label>
          <Button size="sm" type="submit" disabled={pending}>Save</Button>
        </form>
      )}
      {panel === "pause" && (
        <form className="mt-3 flex flex-wrap items-end gap-2 rounded-lg bg-surface-2 p-3" onSubmit={(e) => { e.preventDefault(); run(() => pauseCreator(it.username, pauseReason, resumeOn || null), `@${it.username} paused.`); setPanel(null); }}>
          <label className="min-w-56 flex-1 text-[13px]">Short reason (required)<Input required minLength={2} maxLength={200} value={pauseReason} onChange={(e) => setPauseReason(e.target.value)} placeholder="e.g. on holiday, not interested" className="mt-1 block w-full" /></label>
          <label className="text-[13px]">Resume on (optional)<Input type="date" min={addDays(today, 1)} value={resumeOn} onChange={(e) => setResumeOn(e.target.value)} className="mt-1 block w-44" /></label>
          <Button size="sm" type="submit" disabled={pending || pauseReason.trim().length < 2}>Pause</Button>
        </form>
      )}
    </article>
  );
}
