"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, Loader2, X } from "lucide-react";
import { addCommitmentLink, decideCommitmentContent, markContacted, markNeedsHelp, markPromised, resumeCreator, undoEvent } from "@/app/actions/workflow";
import { MessageBox } from "@/components/ui/message-box";
import { lineMessage, overviewMessage, type LineStats } from "@/lib/creators/action-messages";
import { ACTION_HINT, type CreatorAction, type CreatorStatus } from "@/lib/creators/status";
import { Sparkline } from "@/components/viz/sparkline";
import { Badge, Button, Input } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import type { PanelData } from "@/lib/creators/workflow/panel";

/** What the manager clicked: one action on one product line. The panel turns it into a message and outcome buttons. */
export type PanelFocus = { action: CreatorAction; status: CreatorStatus; product: string | null; productId: string | null; reason: string; line: LineStats | null; all: LineStats[]; period: string };

const Ctx = createContext<{ open: (username: string, focus?: PanelFocus) => void }>({ open: () => {} });

/** Open the creator side panel from anywhere (Daily Actions, Affiliates…). */
export const useCreatorPanel = () => useContext(Ctx);

export function CreatorPanelProvider({ children }: { children: React.ReactNode }) {
  const [target, setTarget] = useState<{ user: string; focus?: PanelFocus; n: number } | null>(null);
  const open = useCallback((u: string, focus?: PanelFocus) => setTarget((t) => ({ user: u, focus, n: (t?.n ?? 0) + 1 })), []);
  return (
    <Ctx.Provider value={{ open }}>
      {children}
      {target && <Panel key={`${target.user}-${target.n}`} username={target.user} focus={target.focus} onClose={() => setTarget(null)} />}
    </Ctx.Provider>
  );
}


function Section({ title, count, defaultOpen, children }: { title: string; count?: number; defaultOpen?: boolean; children: React.ReactNode }) {
  return (
    <details open={defaultOpen} className="group border-t border-line">
      <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3.5 [&::-webkit-details-marker]:hidden">
        <span className="text-[15px] font-semibold text-ink">{title}{count != null && <span className="ml-2 text-[13px] font-normal text-ink-3">{count}</span>}</span>
        <span className="text-ink-3 transition-transform group-open:rotate-180">▾</span>
      </summary>
      <div className="px-5 pb-4">{children}</div>
    </details>
  );
}

const HELP_REASONS = ["Not replying", "Needs a brief", "Needs a voucher", "Product problem", "Other"];

/** Do the action: message, then record what happened. Recorded in the same log Daily Actions uses. */
function ActionCard({ username, focus, phone, canAct, paused, onSaved }: { username: string; focus: PanelFocus; phone: string | null; canAct: boolean; paused: boolean; onSaved: () => void }) {
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<null | "promise" | "help">(null);
  const [date, setDate] = useState("");
  const [reason, setReason] = useState(HELP_REASONS[0]);
  const [done, setDone] = useState<{ text: string; undo?: number } | null>(null);
  const [scope, setScope] = useState<"line" | "all">("line");
  const one = lineMessage(focus.action, username, focus.product, focus.line, focus.period);
  const every = focus.product ? overviewMessage(username, focus.all, focus.period) : null;
  const msgs = scope === "all" && every ? every : one ?? every;
  const ctx = { action: focus.action, product: focus.product, productId: focus.productId, status: focus.status };
  const save = async (fn: () => Promise<{ ok?: true; error?: string; eventId?: number }>, ok: string) => {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    setDone({ text: r.error ?? ok, undo: r.error ? undefined : r.eventId });
    if (!r.error) { setMode(null); onSaved(); }
  };
  return (
    <section data-testid="action-card" className="mx-5 mb-3 rounded-xl border border-brand/30 bg-brand/5 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-line-strong bg-surface px-2.5 py-0.5 text-[13.5px] font-semibold text-ink">{focus.action}</span>
        <span className="text-[14px] text-ink-2">{focus.product ?? "Overall"}</span>
        <Badge tone="neutral">{focus.status}</Badge>
      </div>
      <p className="mt-1.5 text-[14px] font-medium text-ink">{ACTION_HINT[focus.action]}</p>
      <p className="text-[13px] text-ink-3">{focus.reason}</p>
      {one && every && (
        <div role="group" aria-label="Message about" className="mt-3 inline-flex overflow-hidden rounded-lg border border-line-strong bg-surface text-[13px] font-medium">
          <button type="button" aria-pressed={scope === "line"} onClick={() => setScope("line")} className={cn("px-3 py-1.5", scope === "line" ? "bg-brand text-white" : "text-ink-2 hover:bg-surface-2")}>This Product</button>
          <button type="button" aria-pressed={scope === "all"} onClick={() => setScope("all")} className={cn("px-3 py-1.5", scope === "all" ? "bg-brand text-white" : "text-ink-2 hover:bg-surface-2")}>All Products ({focus.all.length})</button>
        </div>
      )}
      {msgs && <MessageBox className="mt-3" en={msgs.en} ms={msgs.ms} phone={phone} />}
      {canAct ? (
        <div className="mt-4 border-t border-line pt-3">
          <p className="mb-2 text-[12px] font-medium tracking-wide text-ink-3 uppercase">What happened? (saved to Daily Actions)</p>
          <div className="flex flex-wrap gap-2">
            {focus.action === "Resume" || paused ? (
              <Button size="sm" disabled={busy} onClick={() => save(() => resumeCreator(username), "Resumed.")}>Resume</Button>
            ) : focus.action === "Keep" || focus.action === "Wait" ? (
              <p className="text-[13.5px] text-ink-3">Nothing to do for this line right now.</p>
            ) : (
              <>
                <Button size="sm" disabled={busy} onClick={() => save(() => markContacted([username], undefined, ctx), "Saved as contacted. A follow-up is scheduled.")}>I contacted them</Button>
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => setMode(mode === "promise" ? null : "promise")}>They gave a date</Button>
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => setMode(mode === "help" ? null : "help")}>Needs help</Button>
              </>
            )}
          </div>
          {mode === "promise" && (
            <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); void save(() => markPromised(username, date, { ...(focus.productId && /^\d{5,30}$/.test(focus.productId) ? { productId: focus.productId } : {}), contentType: "video", details: `${focus.action}${focus.product ? ` – ${focus.product}` : ""}` }), "Promise saved."); }}>
              <label className="text-[13px]">Promised date<Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 block w-44" /></label>
              <Button size="sm" type="submit" disabled={busy || !date}>Save</Button>
            </form>
          )}
          {mode === "help" && (
            <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); void save(() => markNeedsHelp(username, `${reason} (${focus.action}${focus.product ? `, ${focus.product}` : ""})`, null), "Flagged for help."); }}>
              <label className="text-[13px]">Why<select value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 block h-9 rounded-lg border border-line-strong bg-surface px-2 text-[14px]">{HELP_REASONS.map((r) => <option key={r}>{r}</option>)}</select></label>
              <Button size="sm" type="submit" disabled={busy}>Save</Button>
            </form>
          )}
          {done && (
            <p role="status" className="mt-3 text-[13.5px] text-ink-2">
              {done.text}{" "}
              {done.undo && <button className="underline" disabled={busy} onClick={() => save(() => undoEvent(done.undo!), "Undone.").then(() => setDone({ text: "Undone." }))}>Undo</button>}
            </p>
          )}
        </div>
      ) : <p className="mt-3 text-[13px] text-ink-3">You can view this but not record actions.</p>}
    </section>
  );
}

function Panel({ username, focus, onClose }: { username: string; focus?: PanelFocus; onClose: () => void }) {
  const [data, setData] = useState<PanelData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    fetch(`/api/creators/${encodeURIComponent(username)}/panel`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<PanelData>) : Promise.reject(new Error("Could not load this creator."))))
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Could not load this creator."));
    return () => { alive = false; };
  }, [username, tick]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  const act = async (fn: () => Promise<{ ok?: true; error?: string }>, ok: string) => {
    setBusy(true);
    const r = await fn();
    setMsg(r.error ?? ok);
    setBusy(false);
    if (!r.error) setTick((t) => t + 1);
  };
  const outstanding = data?.obligations.filter((o) => o.state !== "fulfilled") ?? [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={`Creator @${username}`}>
      <button className="absolute inset-0 bg-black/40" aria-label="Close panel" onClick={onClose} />
      <aside className="relative flex h-full w-full flex-col overflow-y-auto bg-surface shadow-xl sm:w-[480px]" data-testid="creator-panel">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-line bg-surface px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-[19px] font-semibold text-ink">@{username}</h2>
            {data && (
              <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[14px] text-ink-2">
                <span title={data.relationship.hint}><Badge tone={data.relationship.tone}>{data.relationship.label}</Badge></span>
                {data.paused && <Badge tone="neutral">Paused</Badge>}
                {data.next && <span>{data.next}</span>}
              </p>
            )}
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-ink-3 hover:bg-surface-2"><X className="size-5" /></button>
        </div>

        {!data && !error && <p className="flex items-center gap-2 px-5 py-8 text-[14px] text-ink-3"><Loader2 className="size-4 animate-spin" /> Loading…</p>}
        {error && <p className="px-5 py-8 text-[14px] text-critical">{error}</p>}
        {data && (
          <>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-[14px]">
              <a className="inline-flex items-center gap-1.5 text-brand hover:underline" href={`https://www.tiktok.com/@${encodeURIComponent(username)}`} target="_blank" rel="noopener noreferrer">TikTok <ExternalLink className="size-3.5" /></a>
              <span className="text-ink-3">{data.phone ? `WhatsApp ${data.phone}` : "No WhatsApp number saved"}</span>
              <Link href={`/creators/${encodeURIComponent(username)}`} className="ml-auto text-brand hover:underline">Open full page →</Link>
            </div>
            <dl className="mx-5 mb-3 grid grid-cols-3 gap-3 text-center" aria-label="Track record">
              <div className="rounded-xl bg-surface-2 p-3"><dt className="text-[12.5px] text-ink-3">Promises kept</dt><dd className="tnum text-[18px] font-semibold text-ink">{data.profile.promisesJudged ? `${data.profile.promisesOnTime}/${data.profile.promisesJudged}` : "–"}</dd></div>
              <div className="rounded-xl bg-surface-2 p-3"><dt className="text-[12.5px] text-ink-3">Videos, 28 days</dt><dd className="tnum text-[18px] font-semibold text-ink">{data.profile.videos28}</dd></div>
              <div className="rounded-xl bg-surface-2 p-3"><dt className="text-[12.5px] text-ink-3">Last sale</dt><dd className="tnum text-[18px] font-semibold text-ink">{data.profile.lastSaleLabel ?? "–"}</dd></div>
            </dl>
            {focus && <ActionCard username={username} focus={focus} phone={data.phone} canAct={data.canAct} paused={data.paused} onSaved={() => setTick((t) => t + 1)} />}
            {msg && <p role="status" className="mx-5 mb-2 rounded-lg bg-surface-2 px-3 py-2 text-[13.5px] text-ink-2">{msg}</p>}

            <Section title="Performance" defaultOpen>
              {(() => {
                const pf = data.performance;
                const rm = (n: number) => `RM ${Math.round(n).toLocaleString("en-MY")}`;
                const change = pf.prev28 > 0 ? Math.round((pf.gmv28 / pf.prev28 - 1) * 100) : null;
                return (
                  <div className="space-y-3" data-testid="performance">
                    <div className="rounded-xl bg-surface-2 p-3.5">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-[13px] text-ink-3">GMV, last 28 days</span>
                        <span className="tnum text-[18px] font-semibold text-ink">{rm(pf.gmv28)}{change != null && <span className={cn("ml-2 text-[13.5px] font-medium", change >= 0 ? "text-good" : "text-critical")}>{change >= 0 ? "▲" : "▼"} {Math.abs(change)}%</span>}</span>
                      </div>
                      <Sparkline values={pf.weeks} tone={change != null && change < 0 ? "critical" : "good"} label="GMV per week, last 8 weeks" />
                      <p className="text-[12px] text-ink-3">Weekly GMV, last 8 weeks{pf.prev28 > 0 ? ` · before: ${rm(pf.prev28)}` : ""}</p>
                    </div>
                    <dl className="grid grid-cols-2 gap-2.5 text-[13.5px]">
                      <div className="rounded-xl bg-surface-2 p-3"><dt className="text-ink-3">Posting rate</dt><dd className="tnum font-semibold text-ink">{pf.postingRate ? `${pf.postingRate.posted}/${pf.postingRate.judged} samples posted` : "–"}</dd></div>
                      <div className="rounded-xl bg-surface-2 p-3"><dt className="text-ink-3">Days to post</dt><dd className="tnum font-semibold text-ink">{pf.avgDaysToPost != null ? `${pf.avgDaysToPost} days on average` : "–"}</dd></div>
                      <div className="rounded-xl bg-surface-2 p-3"><dt className="text-ink-3">Last action</dt><dd className="font-semibold text-ink">{pf.lastAction ? `${pf.lastAction.text}` : "None yet"}{pf.lastAction && <span className="block text-[12.5px] font-normal text-ink-3">{pf.lastAction.at}{pf.lastAction.by ? ` · ${pf.lastAction.by}` : ""}</span>}</dd></div>
                      <div className="rounded-xl bg-surface-2 p-3"><dt className="text-ink-3">Next follow-up</dt><dd className="font-semibold text-ink">{pf.nextFollowUp ?? "None set"}<span className="block text-[12.5px] font-normal text-ink-3">{pf.contacts} contact{pf.contacts === 1 ? "" : "s"} recorded</span></dd></div>
                    </dl>
                  </div>
                );
              })()}
            </Section>

            <Section title="Commitments" count={data.obligations.length} defaultOpen>
              {data.obligations.length === 0 ? (
                <p className="text-[14px] text-ink-3">No promises recorded.</p>
              ) : (
                <ul className="space-y-3">
                  {data.obligations.map((o) => (
                    <li key={o.id} className="rounded-xl border border-line p-3.5">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[15px] font-medium text-ink">{o.label}{o.contentType && o.label !== "Video" && o.label !== "LIVE" ? ` · ${o.contentType === "live" ? "LIVE" : "video"}` : ""}</span>
                        <span className="tnum text-[15px] font-semibold">{o.done}/{o.needed}</span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2"><div className={cn("h-full rounded-full", o.state === "fulfilled" ? "bg-good" : o.lateDays != null ? "bg-critical" : "bg-brand")} style={{ width: `${Math.min(100, (o.done / Math.max(1, o.needed)) * 100)}%` }} /></div>
                      <p className={cn("mt-2 text-[14px]", o.lateDays != null ? "font-medium text-critical" : "text-ink-2")}>
                        {o.state === "fulfilled" ? `Fulfilled${o.timing === "on_time" ? " on time" : o.timing === "late" ? " late" : " (posting date unknown)"}` : o.lateDays != null ? `${o.lateDays} day${o.lateDays === 1 ? "" : "s"} overdue · due ${o.dueLabel}` : `Due ${o.dueLabel}`}
                        {o.originalLabel ? ` · moved from ${o.originalLabel}` : ""}
                      </p>
                      {data.canAct && o.candidates.length > 0 && (
                        <div className="mt-3 space-y-2 border-t border-line pt-3">
                          <p className="text-[13.5px] font-medium text-ink">Possible content – is this it?</p>
                          {o.candidates.map((c) => (
                            <div key={c.contentId} className="flex flex-wrap items-center gap-2 text-[14px]">
                              <span>{c.kind === "live" ? "LIVE" : "Video"} · {c.postedLabel ? `posted ${c.postedLabel}` : "posting date unknown"}</span>
                              {c.link && <a href={c.link} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">Open</a>}
                              <Button size="sm" disabled={busy} onClick={() => act(() => decideCommitmentContent(o.id, c.contentId, "verified"), "Confirmed.")}>This is it</Button>
                              <Button size="sm" variant="secondary" disabled={busy} onClick={() => act(() => decideCommitmentContent(o.id, c.contentId, "rejected"), "Rejected.")}>Not this</Button>
                            </div>
                          ))}
                        </div>
                      )}
                      {data.canAct && o.state !== "fulfilled" && (
                        <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); void act(() => addCommitmentLink(o.id, link), "Link saved.").then(() => setLink("")); }}>
                          <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Paste a video link to confirm" aria-label="Video link" className="min-w-0 flex-1" />
                          <Button size="sm" type="submit" disabled={busy || link.trim().length < 8}>Confirm</Button>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {outstanding.length > 1 && <p className="mt-2 text-[13px] text-ink-3">{outstanding.length} promises are open – each is tracked on its own.</p>}
            </Section>

            <Section title="Samples" count={data.samples.length} defaultOpen={data.samples.length > 0 && data.samples.length <= 2}>
              {data.samples.length === 0 ? <p className="text-[14px] text-ink-3">No samples sent. A sample is optional.</p> : (
                <ul className="space-y-3">
                  {data.samples.map((s) => (
                    <li key={s.id} className="rounded-xl border border-line p-3.5">
                      <div className="flex items-center justify-between gap-3"><span className="text-[15px] font-medium text-ink">{s.product}{s.qty > 1 ? ` ×${s.qty}` : ""}</span><Badge tone={s.stateTone}>{s.stateLabel}</Badge></div>
                      <ol className="mt-3 grid grid-cols-4 gap-1 text-[12.5px] text-ink-3">
                        {[["Approved", s.approvedLabel, true], ["Shipped", s.shippedLabel, true], ["Delivered", s.deliveredLabel, true], [s.agreed ? "Post by (agreed)" : "Post by", s.postByLabel, false]].map(([k, d, done]) => (
                          <li key={String(k)} className="space-y-1">
                            <span className={cn("block h-1.5 rounded-full", done && d ? "bg-good" : done ? "bg-line" : s.result === "not_posted" ? "bg-critical" : "bg-warn")} />
                            <span className="block text-ink-2">{k as string}</span>
                            <span className="tnum block text-ink">{(d as string | null) ?? "–"}</span>
                          </li>
                        ))}
                      </ol>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title="Evidence" count={data.evidence.length}>
              {data.evidence.length === 0 ? <p className="text-[14px] text-ink-3">No verified or matched content yet.</p> : (
                <ul className="space-y-2 text-[14px]">
                  {data.evidence.map((e) => (
                    <li key={e.id} className="flex flex-wrap items-center gap-x-3"><span className="font-medium">{e.kind === "live" ? "LIVE" : "Video"}</span><span className="text-ink-2">{e.when}</span><span className="text-ink-3">{e.source}</span>{e.link && <a href={e.link} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">Open</a>}</li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title="History" count={data.history.length}>
              {data.history.length === 0 ? <p className="text-[14px] text-ink-3">Nothing recorded yet.</p> : (
                <ol className="space-y-2.5 text-[14px]">
                  {data.history.map((h, i) => (
                    <li key={i} className="flex gap-3"><span className="tnum w-28 shrink-0 text-[13px] text-ink-3">{h.at}</span><span className={cn("text-ink", h.undone && "text-ink-3 line-through")}>{h.text}{h.by ? <span className="text-ink-3"> · {h.by}</span> : null}{h.undone ? <span className="text-ink-3"> (undone)</span> : null}</span></li>
                  ))}
                </ol>
              )}
            </Section>
          </>
        )}
      </aside>
    </div>
  );
}

