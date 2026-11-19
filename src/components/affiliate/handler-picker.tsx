"use client";

import { useState, useTransition } from "react";
import { setHandler } from "@/app/actions/queue";

/** Owners choose the one person who handles all affiliate work. Everyone else just sees the name. */
export function HandlerPicker({ staff, value }: { staff: { id: string; name: string }[]; value: string }) {
  const [v, setV] = useState(value);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <label className="inline-flex items-center gap-2 text-[13px] text-ink-3" data-testid="handler-picker">
      Handled By
      <select value={v} disabled={pending} aria-label="Who handles all affiliate work" onChange={(e) => { const id = e.target.value; setV(id); setMsg(null); start(async () => { const r = await setHandler(id); if (r.error) setMsg(r.error); }); }} className="h-9 rounded-lg border border-line-strong bg-surface px-2 text-[13.5px] font-medium text-ink">
        <option value="">Everyone</option>
        {staff.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
      </select>
      {msg && <span className="text-critical">{msg}</span>}
    </label>
  );
}
