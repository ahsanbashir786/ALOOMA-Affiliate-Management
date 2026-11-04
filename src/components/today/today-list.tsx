"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Loader2, MessageSquare, Pencil, Undo2 } from "lucide-react";
import { useCreatorPanel, type PanelFocus } from "@/components/creator/creator-panel";
import { addCommitmentLink, decideCommitmentContent, markContacted, markNeedsHelp, markPromised, pauseCreator, rescheduleCommitmentAction, resumeCreator, undoEvent } from "@/app/actions/workflow";
import { HELP_REASONS_LIST } from "@/lib/workflow/reasons";
import { Badge, Button, Input, Select } from "@/components/ui/primitives";
import { MessageBox } from "@/components/ui/message-box";
import { followUpMessage } from "@/lib/workflow/messages";
import { statsOf } from "@/lib/affiliates/action-messages";
import { NEEDS_ACTION, type CreatorAction, type CreatorStatus } from "@/lib/affiliates/status";
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
  lines: { pid: string | null; name: string; noSample: boolean; status: CreatorStatus; action: CreatorAction; reason: string; orders: number; gmv: number; gmvVideo: number; gmvLive: number; videos: number; videos28: number; lastVideoLabel: string | null; lastVideoDaysAgo: number | null; doneOn: string | null }[];
  gmvLabel: string;
  creatorType: string | null;
  period: string;
  status: "active" | "paused";
  nextLabel: string | null;
  lastContacted: string | null;
  lastAction: string | null;
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
/** The one thing to do, in plain words. */
function primaryAction(it: TodayItem): string {
  if (it.held) return it.status === "paused" ? "Paused" : "Scheduled";
  const k = it.reasons[0]?.kind;
  if (k === "promise_overdue") return "Chase promise";
  if (k === "followup_due") return "Follow up";
  if (k === "help_due") return "Help follow-up";
  if (k === "resume_due") return "Resume?";
  if (k === "promise_review" || k === "sample_review") return "Verify content";
  if (k === "sample") return "Chase sample";
  if (k === "new_creator") return "Approach";
  if (k === "development") return it.opportunity === "recruit" ? "Approach" : it.opportunity === "reactivate" ? "Reactivate" : "Develop";
  return "Review";
}

const DOT: Record<string, string> = { good: "bg-good", brand: "bg-brand", warn: "bg-warn", critical: "bg-critical", neutral: "bg-line-strong" };

export function TodayList({ items, today, helpDays, canAct, empty }: { items: TodayItem[]; today: string; helpDays: number; canAct: boolean; empty: React.ReactNode }) {
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
      {items.length === 0 && empty}
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
  const fallback = followUpMessage(it.username, it.followKind, it.commitment?.dueLabel);
  const en = fallback.en;
  const ms = fallback.ms;
  const lines = it.lines.filter((l) => !l.noSample);
  const focusFor = (l: TodayItem["lines"][number] | undefined): PanelFocus | undefined =>
    l ? { action: l.action, status: l.status, product: l.noSample ? null : l.name, productId: l.pid, reason: l.reason, line: l.noSample ? null : statsOf(l), all: lines.map(statsOf), period: it.period } : undefined;
  // Rows driven by the table (tier 3-4) message from the table line; promises and follow-ups keep their own reminder text.
  const topLine = it.tier >= 3 ? it.lines.find((l) => NEEDS_ACTION.includes(l.action) && l.action !== "Resume") : undefined;

  const panelApi = useCreatorPanel();
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const lead = it.held ?? it.reasons[0]?.text ?? "";
  const focusO = it.obligations.find((o) => o.lateDays != null) ?? it.obligations[0];
  const hasCandidates = (it.commitment?.candidates.length ?? 0) > 0;
  const hasSampleReview = it.reasons.some((r) => r.kind === "sample_review");
  const choose = (p: Panel) => { setMenu(false); setPanel(p); };
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest(`[data-menu="${it.username}"]`)) setMenu(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menu, it.username]);

  return (
    <article className="rounded-xl border border-line bg-surface" data-testid={`today-${it.username}`}>
      <div className="grid items-center gap-x-4 gap-y-3 px-4 py-3.5 md:grid-cols-[minmax(170px,1.1fr)_minmax(220px,2fr)_auto_auto_auto]">
        {/* creator */}
        <div className="flex min-w-0 items-center gap-3">
          {canAct && !it.held ? <input type="checkbox" aria-label={`Select ${it.username}`} checked={selected} onChange={onToggle} className="size-4 shrink-0" /> : <span className="w-4 shrink-0" />}
          <div className="min-w-0">
            <button type="button" onClick={() => panelApi.open(it.username)} className="block max-w-full truncate text-left text-[16px] font-semibold text-ink hover:underline" title="Open details">@{it.username}</button>
            <p className="flex items-center gap-1.5 text-[13.5px] text-ink-3" title={it.relationship.hint}><span className={cn("size-2 rounded-full", DOT[it.relationship.tone])} />{it.relationship.label}</p>
            {(it.creatorType || it.gmvLabel) && <p className="text-[12.5px] text-ink-3">{[it.creatorType, it.gmvLabel && `${it.gmvLabel} total`].filter(Boolean).join(" · ")}</p>}
          </div>
        </div>
        {/* action + reason */}
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-ink">{primaryAction(it)}</p>
          <p className="text-[14px] leading-snug text-ink-2">{lead}</p>
          {it.lines.length > 0 && (
            <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label="Products">
              {it.lines.slice(0, 3).map((l) => (
                <li key={l.pid ?? "none"}>
                  <button type="button" onClick={() => panelApi.open(it.username, focusFor(l))} title={`${l.status}: ${l.reason}`} className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-surface-2 px-2.5 py-0.5 text-[12.5px] text-ink-2 hover:border-brand hover:text-ink">
                    <span className="max-w-[170px] truncate">{l.noSample ? "No sample" : l.name}</span>
                    <span className="text-ink-3">·</span><span>{l.status}</span><span className="text-ink-3">·</span><b className="font-semibold text-ink">{l.action}</b>
                    {l.doneOn && <Check className="size-3 text-good" aria-label="Done" />}
                  </button>
                </li>
              ))}
              {it.lines.length > 3 && <li className="self-center text-[12.5px] text-ink-3">+{it.lines.length - 3} more</li>}
            </ul>
          )}
          {it.lastAction && <p className="mt-0.5 text-[13px] text-ink-3" data-testid="last-action">Last action: {it.lastAction}</p>}
          {it.suggestPause && <p className="mt-1 text-[13.5px] font-medium text-warn">Review or pause? {it.attempts} recorded contacts, no promise or new content.</p>}
        </div>
        {/* deadline */}
        <div className="md:w-32 md:text-right">{it.deadline && <Badge tone={it.deadline.tone === "critical" ? "critical" : it.deadline.tone === "warn" ? "serious" : "neutral"}>{it.deadline.label}</Badge>}</div>
        {/* completion */}
        <div className="tnum text-[14px] md:w-14 md:text-center" title={focusO ? `${focusO.label}: ${focusO.done} of ${focusO.needed} pieces` : undefined}>
          {focusO ? <span className={cn("font-semibold", focusO.lateDays != null ? "text-critical" : "text-ink")}>{focusO.done}/{focusO.needed}</span> : <span className="text-ink-3">–</span>}
          {it.obligations.length > 1 && <span className="block text-[12px] font-normal text-ink-3">+{it.obligations.length - 1} more</span>}
        </div>
        {/* controls */}
        {canAct && (
          <div className="flex items-center gap-2" data-menu={it.username}>
            {it.status === "active" ? (
              <>
                <Button size="sm" variant="secondary" onClick={() => (topLine ? panelApi.open(it.username, focusFor(topLine)) : setPanel(panel === "message" ? null : "message"))}><MessageSquare className="size-4" /> Message</Button>
                <div className="relative">
                  <Button size="sm" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)}><Pencil className="size-4" /> Update <ChevronDown className="size-3.5" /></Button>
                  {menu && (
                    <div role="menu" className="absolute right-0 z-20 mt-1.5 w-52 rounded-xl border border-line-strong bg-surface p-1.5 shadow-lg">
                      {[
                        { k: "contacted", label: "Contacted", hint: "I sent a message" },
                        { k: "promise", label: "Promised date", hint: "They gave a date" },
                        { k: "help", label: "Needs help", hint: "I'm stuck" },
                        { k: "pause", label: "Pause", hint: "Set aside" },
                        ...(hasCandidates || hasSampleReview ? [{ k: "verify", label: "Verify content", hint: "Possible match found" }] : []),
                      ].map((o) => (
                        <button
                          key={o.k}
                          role="menuitem"
                          disabled={pending}
                          className="flex w-full flex-col rounded-lg px-3 py-2 text-left hover:bg-surface-2"
                          onClick={() => {
                            setMenu(false);
                            if (o.k === "contacted") run(() => markContacted([it.username]), `Marked @${it.username} as contacted. Follow-up scheduled.`);
                            else if (o.k === "verify") { if (hasCandidates) panelApi.open(it.username); else router.push("/samples?view=review"); }
                            else choose(o.k as Panel);
                          }}
                        >
                          <span className="text-[14.5px] font-medium text-ink">{o.label}</span>
                          <span className="text-[12.5px] text-ink-3">{o.hint}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <Button size="sm" disabled={pending} onClick={() => run(() => resumeCreator(it.username), `Resumed @${it.username}.`)}>{pending ? <Loader2 className="size-4 animate-spin" /> : null} Resume</Button>
            )}
          </div>
        )}
      </div>

      {panel === "message" && (
        <div className="mx-4 mb-4 rounded-lg bg-surface-2 p-3">
          <MessageBox en={en} ms={ms} phone={it.phone} />
          <p className="mt-2 text-[12.5px] text-ink-3">Opening WhatsApp or copying does not count as contact. Press Update → Contacted after you have actually sent it.</p>
        </div>
      )}
      {panel === "promise" && (
        <form
          className="mx-4 mb-4 space-y-2 rounded-lg bg-surface-2 p-3"
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
        <div className="mx-4 mb-4 space-y-2 rounded-lg bg-surface-2 p-3">
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
        <form className="mx-4 mb-4 flex flex-wrap items-end gap-2 rounded-lg bg-surface-2 p-3" onSubmit={(e) => { e.preventDefault(); run(() => markNeedsHelp(it.username, helpReason, helpDate), `@${it.username} flagged for help. Next action ${helpDate}.`); setPanel(null); }}>
          <label className="text-[13px]">Reason<Select value={helpReason} onChange={(e) => setHelpReason(e.target.value)} className="mt-1 block w-64">{HELP_REASONS_LIST.map((r) => <option key={r}>{r}</option>)}</Select></label>
          <label className="text-[13px]">Next action date<Input type="date" required min={today} value={helpDate} onChange={(e) => setHelpDate(e.target.value)} className="mt-1 block w-44" /></label>
          <Button size="sm" type="submit" disabled={pending}>Save</Button>
        </form>
      )}
      {panel === "pause" && (
        <form className="mx-4 mb-4 flex flex-wrap items-end gap-2 rounded-lg bg-surface-2 p-3" onSubmit={(e) => { e.preventDefault(); run(() => pauseCreator(it.username, pauseReason, resumeOn || null), `@${it.username} paused.`); setPanel(null); }}>
          <label className="min-w-56 flex-1 text-[13px]">Short reason (required)<Input required minLength={2} maxLength={200} value={pauseReason} onChange={(e) => setPauseReason(e.target.value)} placeholder="e.g. on holiday, not interested" className="mt-1 block w-full" /></label>
          <label className="text-[13px]">Resume on (optional)<Input type="date" min={addDays(today, 1)} value={resumeOn} onChange={(e) => setResumeOn(e.target.value)} className="mt-1 block w-44" /></label>
          <Button size="sm" type="submit" disabled={pending || pauseReason.trim().length < 2}>Pause</Button>
        </form>
      )}
    </article>
  );
}
