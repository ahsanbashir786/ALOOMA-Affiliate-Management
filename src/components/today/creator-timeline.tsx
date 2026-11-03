"use client";

import { useTransition } from "react";
import { ExternalLink, Undo2 } from "lucide-react";
import { undoEvent } from "@/app/actions/workflow";
import { Badge } from "@/components/ui/primitives";
import type { TimelineEntry } from "@/lib/workflow/timeline";
import { fmtDateTimeKL } from "@/lib/time";

const TONE: Record<string, "brand" | "good" | "warn" | "neutral" | "serious"> = {
  contacted: "brand", promised: "good", needs_help: "serious", paused: "warn", resumed: "brand", sample: "neutral", content: "good", promise_kept: "good",
};

export function CreatorTimeline({ entries, canUndo }: { entries: TimelineEntry[]; canUndo: boolean }) {
  const [pending, start] = useTransition();
  if (!entries.length) return <p className="px-5 pb-5 text-[13px] text-ink-3">Nothing recorded yet. Contacts, promises, samples and verified content appear here automatically.</p>;
  return (
    <ol className="px-5 pb-4" aria-label="Activity timeline">
      {entries.map((e, i) => (
        <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line py-2 text-[13.5px] first:border-t-0">
          <span className="tnum w-28 shrink-0 text-[12.5px] text-ink-3">{fmtDateTimeKL(e.at)}</span>
          <Badge tone={TONE[e.kind]}>{e.kind === "content" ? "Content" : e.kind === "sample" ? "Sample" : "Staff"}</Badge>
          <span className={e.undone ? "text-ink-3 line-through" : "text-ink"}>{e.text}</span>
          {e.undone && <span className="text-[12px] text-ink-3">(undone – kept in history)</span>}
          {e.synthetic && <Badge tone="warn">test record</Badge>}
          {e.by && <span className="text-[12.5px] text-ink-3">by {e.by}</span>}
          {e.link && <a href={e.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12.5px] text-brand hover:underline">Open <ExternalLink className="size-3" /></a>}
          {canUndo && e.eventId && !e.undone && (
            <button disabled={pending} onClick={() => start(async () => { await undoEvent(e.eventId!); })} className="ml-auto inline-flex items-center gap-1 text-[12.5px] text-ink-3 hover:text-ink">
              <Undo2 className="size-3.5" /> {e.batch ? "Undo batch" : "Undo"}
            </button>
          )}
        </li>
      ))}
    </ol>
  );
}
