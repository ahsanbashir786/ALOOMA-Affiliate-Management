"use client";

import { useState, useTransition } from "react";
import { reviewSample } from "@/app/actions/outreach";
import { Button } from "@/components/ui/primitives";

const REASONS = [{ key: "NOT_MATCH", label: "Not a match for us" }, { key: "OUT_OF_STOCK", label: "Out of stock" }, { key: "OFFLINE", label: "Product is offline" }, { key: "OTHER", label: "Other reason" }];

/** Approve or reject one waiting request. Both ask first, because TikTok cannot undo a decision. */
export function ReviewButtons({ id, creator, product, enabled, canReview }: { id: string; creator: string; product: string; enabled: boolean; canReview: boolean }) {
  const [mode, setMode] = useState<null | "approve" | "reject">(null);
  const [reason, setReason] = useState("NOT_MATCH");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  if (!canReview) return <p className="text-[12px] text-ink-3">You can look at this request. Approving needs the Approve Samples permission.</p>;
  if (!enabled) return <p className="text-[12px] text-ink-3" data-testid="review-off">Approving is switched off. The owner switches it on above.</p>;
  if (msg?.ok) return <p className="text-[13px] font-semibold text-good" data-testid="review-done">{msg.text}</p>;
  const send = (result: "APPROVE" | "REJECT") => start(async () => { const r = await reviewSample(id, result, result === "REJECT" ? reason : undefined); setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: result === "APPROVE" ? "Approved on TikTok." : "Rejected on TikTok." }); });
  return (
    <div className="space-y-2" data-testid="review-box">
      {!mode && <div className="flex gap-2"><Button size="sm" onClick={() => { setMsg(null); setMode("approve"); }} data-testid="approve">Approve</Button><Button size="sm" variant="secondary" onClick={() => { setMsg(null); setMode("reject"); }} data-testid="reject">Reject</Button></div>}
      {mode === "approve" && (
        <div className="rounded-xl border border-brand/40 bg-brand/5 p-3 text-[13px]">
          <p>Approve <b>{product}</b> for <b>@{creator}</b>? TikTok will ship the sample. <b>This cannot be undone.</b></p>
          <div className="mt-2 flex gap-2"><Button size="sm" disabled={pending} onClick={() => send("APPROVE")} data-testid="approve-yes">Yes, Approve</Button><Button size="sm" variant="secondary" disabled={pending} onClick={() => setMode(null)}>Cancel</Button></div>
        </div>
      )}
      {mode === "reject" && (
        <div className="rounded-xl border border-line bg-surface-2 p-3 text-[13px]">
          <p>Reject <b>{product}</b> for <b>@{creator}</b>? <b>This cannot be undone.</b> TikTok tells the creator the reason.</p>
          <select value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason" className="mt-2 h-8 rounded-lg border border-line bg-surface px-2 text-[13px]">{REASONS.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}</select>
          <div className="mt-2 flex gap-2"><Button size="sm" disabled={pending} onClick={() => send("REJECT")} data-testid="reject-yes">Yes, Reject</Button><Button size="sm" variant="secondary" disabled={pending} onClick={() => setMode(null)}>Cancel</Button></div>
        </div>
      )}
      {msg && !msg.ok && <p className="text-[12.5px] text-critical" data-testid="review-error">{msg.text}</p>}
    </div>
  );
}
