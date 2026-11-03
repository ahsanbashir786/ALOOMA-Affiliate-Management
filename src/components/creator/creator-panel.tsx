"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, Loader2, X } from "lucide-react";
import { addCommitmentLink, decideCommitmentContent } from "@/app/actions/workflow";
import { Badge, Button, Input } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import type { PanelData } from "@/lib/workflow/panel";

const Ctx = createContext<{ open: (username: string) => void }>({ open: () => {} });

/** Open the creator side panel from anywhere (Today's Work, Affiliates…). */
export const useCreatorPanel = () => useContext(Ctx);

export function CreatorPanelProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<string | null>(null);
  const open = useCallback((u: string) => setUser(u), []);
  return (
    <Ctx.Provider value={{ open }}>
      {children}
      {user && <Panel key={user} username={user} onClose={() => setUser(null)} />}
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

function Panel({ username, onClose }: { username: string; onClose: () => void }) {
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
            {msg && <p role="status" className="mx-5 mb-2 rounded-lg bg-surface-2 px-3 py-2 text-[13.5px] text-ink-2">{msg}</p>}

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

