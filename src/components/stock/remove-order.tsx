"use client";

import { useState, useTransition } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { removeStockOrder } from "@/app/actions/stock";

/** Removes an order that was added in the app by mistake (asks first). */
export function RemoveOrder({ orderNo }: { orderNo: string }) {
  const [asking, setAsking] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!asking) return <button type="button" onClick={() => setAsking(true)} aria-label={`Remove order ${orderNo}`} className="rounded-md p-1.5 text-ink-3 hover:bg-critical-soft hover:text-critical"><Trash2 className="size-4" /></button>;
  return (
    <span className="inline-flex items-center gap-1.5 text-[12.5px]">
      Remove?
      <button type="button" disabled={pending} onClick={() => start(async () => { const r = await removeStockOrder(orderNo); if (!r.ok) setErr(r.error ?? "Could not remove"); })} className="font-medium text-critical hover:underline">{pending ? <Loader2 className="size-3.5 animate-spin" /> : "Yes"}</button>
      <button type="button" onClick={() => setAsking(false)} className="text-ink-2 hover:underline">No</button>
      {err && <span className="text-critical">{err}</span>}
    </span>
  );
}
