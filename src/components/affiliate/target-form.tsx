"use client";

import { useState, useTransition } from "react";
import { setAffiliateTarget } from "@/app/actions/affiliate";
import { Button } from "@/components/ui/primitives";

/** Lets the owner type the 28-day sales goal (empty = automatic). */
export function TargetForm({ current, custom, canEdit }: { current: number; custom: boolean; canEdit: boolean }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(custom ? String(current) : "");
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  if (!canEdit) return null;
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="text-[12.5px] font-semibold text-brand hover:underline">Set Goal</button>;
  return (
    <form className="mt-2 flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await setAffiliateTarget(v); if (r.error) setMsg(r.error); else { setMsg(""); setOpen(false); } }); }}>
      <input value={v} onChange={(e) => setV(e.target.value)} inputMode="numeric" placeholder="Automatic" aria-label="Sales goal for 28 days (RM)" className="h-8 w-36 rounded-lg border border-line bg-surface px-2.5 text-[13px]" />
      <Button type="submit" size="sm" disabled={pending}>Save</Button>
      <button type="button" onClick={() => setOpen(false)} className="text-[12.5px] text-ink-3 hover:underline">Cancel</button>
      {msg && <span className="text-[12.5px] text-critical">{msg}</span>}
    </form>
  );
}
