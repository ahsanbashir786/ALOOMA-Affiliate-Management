"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ChevronDown, Clock, ExternalLink, Loader2, Pause, Play, Undo2, UserCheck } from "lucide-react";
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
  samples: { id: number; product: string; deliveredLabel: string | null; postByLabel: string | null; agreed: boolean; result: string }[];
  held: string | null;
  pausedLabel: string | null;
  followKind: "promise" | "follow_up" | "help" | "resume";
};

type Panel = null | "promise" | "help" | "pause" | "message" | "content";
const TIER: Record<number, { label: string; tone: "critical" | "serious" | "warn" | "brand" }> = {
  1: { label: "Promise overdue", tone: "critical" },
  2: { label: "Follow-up due", tone: "serious" },
  3: { label: "Sample needs attention", tone: "warn" },
  4: { label: "Development idea", tone: "brand" },
};

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
  const tier = TIER[it.tier];
  const rec = it.recs[0];
  const fallback = followUpMessage(it.username, it.followKind, it.commitment?.dueLabel);
  const en = rec?.instruction ?? fallback.en;
  const ms = rec?.instructionMs ?? fallback.ms;
  const tiktok = `https://www.tiktok.com/@${encodeURIComponent(it.username)}`;
  const toggle = (p: Panel) => setPanel(panel === p ? null : p);

  return (
    <article className="rounded-xl border border-line bg-surface p-4" data-testid={`today-${it.username}`}>
      <div className="flex flex-wrap items-start gap-3">
        {canAct && !it.held && (
          <input type="checkbox" aria-label={`Select ${it.username}`} checked={selected} onChange={onToggle} className="mt-1.5 size-4" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/creators/${encodeURIComponent(it.username)}`} className="text-[16px] font-semibold hover:underline">@{it.username}</Link>
            {it.held ? <Badge tone="neutral">{it.status === "paused" ? "Paused" : "Scheduled"}</Badge> : <Badge tone={tier.tone}>{tier.label}</Badge>}
            {it.commitment && (
              <Badge tone="brand">
                Promised {it.commitment.dueLabel}
                {it.commitment.originalLabel ? ` (moved from ${it.commitment.originalLabel})` : ""}
                {it.commitment.needed > 1 || it.commitment.done > 0 ? ` · ${it.commitment.done}/${it.commitment.needed}${it.commitment.contentType === "live" ? " LIVE" : it.commitment.contentType === "video" ? " video" : ""}` : ""}
              </Badge>
            )}
            {it.otherCommitments > 0 && <span className="text-[12.5px] text-ink-3">+{it.otherCommitments} more promise{it.otherCommitments === 1 ? "" : "s"}</span>}
            {it.lastContacted && <span className="text-[12.5px] text-ink-3">Last contacted {it.lastContacted}</span>}
            {it.nextLabel && <span className="inline-flex items-center gap-1 text-[12.5px] text-ink-3"><Clock className="size-3.5" /> Next: {it.nextLabel}</span>}
          </div>
          {it.held ? (
            <p className="mt-1 text-[13.5px] text-ink-2">{it.held}</p>
          ) : (
            <ul className="mt-1.5 space-y-0.5 text-[13.5px] text-ink-2">
              {it.reasons.map((r, i) => <li key={i}>{r.text}</li>)}
            </ul>
          )}
          {it.recs.length > 1 && !it.held && (
            <p className="mt-1 text-[12.5px] text-ink-3">Also: {it.recs.slice(1).map((r) => r.title).join(" · ")}</p>
          )}
          {it.samples.length > 0 && (
            <ul className="mt-1.5 text-[12.5px] text-ink-3">
              {it.samples.slice(0, 3).map((s) => (
                <li key={s.id}>
                  {s.product}{s.deliveredLabel ? ` · delivered ${s.deliveredLabel}` : " · on the way"}
                  {s.postByLabel ? ` · post by ${s.postByLabel}${s.agreed ? " (agreed)" : ""}` : ""}
                  {s.result === "uncertain" ? " · possible content to review" : ""}
                </li>
              ))}
              {it.samples.length > 3 && <li>+ {it.samples.length - 3} more</li>}
            </ul>
          )}
          {it.suggestPause && (
            <p className="mt-2 rounded-lg bg-warn/10 px-3 py-1.5 text-[13px] text-ink">
              Contacted {it.attempts} times with no new content. Consider pausing this creator for a while (this is only a suggestion).
            </p>
          )}
        </div>
      </div>

      {canAct && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {!it.held || it.status === "active" ? (
            <>
              <a href={tiktok} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line-strong px-3 text-[13px] hover:bg-surface-2">
                <ExternalLink className="size-3.5" /> Open TikTok
              </a>
              <Button size="sm" variant="secondary" onClick={() => toggle("message")}>
                {it.phone ? "WhatsApp message" : "Message"} <ChevronDown className="size-3.5" />
              </Button>
              <Button size="sm" disabled={pending} onClick={() => run(() => markContacted([it.username]), `Marked @${it.username} as contacted. Follow-up scheduled.`)}>
                {pending ? <Loader2 className="size-3.5 animate-spin" /> : <UserCheck className="size-3.5" />} Contacted
              </Button>
              <Button size="sm" variant="secondary" onClick={() => toggle("promise")}>Promised date</Button>
              {it.commitment && it.commitment.candidates.length > 0 && (
                <Button size="sm" variant="secondary" onClick={() => toggle("content")}>Check possible content ({it.commitment.candidates.length})</Button>
              )}
              <Button size="sm" variant="secondary" onClick={() => toggle("help")}>Needs help</Button>
              <Button size="sm" variant="secondary" onClick={() => toggle("pause")}><Pause className="size-3.5" /> Pause</Button>
            </>
          ) : null}
          {it.status === "paused" && (
            <Button size="sm" disabled={pending} onClick={() => run(() => resumeCreator(it.username), `Resumed @${it.username}.`)}>
              <Play className="size-3.5" /> Resume
            </Button>
          )}
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
