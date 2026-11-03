"use client";

import { useState, useTransition } from "react";
import { resolveImportConflicts } from "@/app/actions/conflicts";
import { Button } from "@/components/ui/primitives";

export type ConflictItem = { id: number; kind: string; orderId: string; reason: string; storedStatus: string | null; incomingStatus: string | null };

/** Lines an import could not prove newer. Shown only when there are any. */
export function ConflictsCard({ items }: { items: ConflictItem[] }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const ids = items.map((i) => i.id);
  const run = (action: "accept" | "dismiss") =>
    start(async () => {
      const r = await resolveImportConflicts(ids, action);
      setMsg(r.error ?? (action === "accept" ? `Applied the file's version to ${r.count} lines.` : `Kept the stored version of ${r.count} lines.`));
    });
  return (
    <div className="space-y-3 px-5 pb-5">
      <ul className="max-h-60 divide-y divide-line overflow-auto text-[13px]">
        {items.slice(0, 50).map((c) => (
          <li key={c.id} className="py-1.5">
            <span className="font-medium">Order {c.orderId}</span> <span className="text-ink-3">({c.kind === "all_orders" ? "shop orders" : "affiliate orders"})</span>
            {c.storedStatus !== c.incomingStatus && <span className="text-ink-2"> · stored “{c.storedStatus ?? "–"}” vs file “{c.incomingStatus ?? "–"}”</span>}
            <div className="text-[12px] text-ink-3">{c.reason}</div>
          </li>
        ))}
      </ul>
      {items.length > 50 && <p className="text-[12.5px] text-ink-3">Showing 50 of {items.length}.</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={pending} onClick={() => run("dismiss")}>Keep what is stored</Button>
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => run("accept")}>The file is newer – use its version</Button>
        {msg && <span className="text-[12.5px] text-ink-2">{msg}</span>}
      </div>
    </div>
  );
}
