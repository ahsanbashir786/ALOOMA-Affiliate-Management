"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteBoostBatch } from "@/app/actions/ads-boost";

export function LogDelete({ id }: { id: number }) {
  const router = useRouter();
  const [ask, setAsk] = useState(false);
  const [busy, start] = useTransition();
  if (!ask) return <button type="button" onClick={() => setAsk(true)} className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[12.5px] text-ink-3 hover:bg-surface-2 hover:text-critical" data-testid="ads-log-delete"><Trash2 className="size-3.5" />Remove</button>;
  return (
    <span className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-2">Remove this batch from the log?
      <button type="button" disabled={busy} onClick={() => start(async () => { await deleteBoostBatch(id); router.refresh(); })} className="h-8 rounded-lg bg-critical-soft px-2.5 font-medium text-critical" data-testid="ads-log-delete-yes">Yes, remove</button>
      <button type="button" onClick={() => setAsk(false)} className="h-8 rounded-lg px-2 hover:bg-surface-2">Keep</button>
    </span>
  );
}
