"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, ChevronDown, Loader2, Send, X } from "lucide-react";
import { assignAction, saveActionNote, setActionStatus } from "@/app/actions/actions";
import { Badge, Button, Select } from "@/components/ui/primitives";
import { CopyButton } from "@/components/ui/copy-button";
import { SegmentBadge } from "@/components/creators/segment-badge";
import { cn, fmtDate, fmtRM, initials } from "@/lib/utils";
import type { SegmentKey } from "@/lib/segments";

export type ActionItem = {
  id: number;
  username: string;
  type: SegmentKey;
  priority: number;
  title: string;
  reason: string;
  instruction: string;
  expectedUplift: number;
  baselineGmv: number;
  status: "open" | "in_progress" | "sent" | "done" | "dismissed";
  assigneeId: string | null;
  assigneeName: string | null;
  note: string | null;
  createdAt: string;
  completedAt: string | null;
};

const STATUS: Record<ActionItem["status"], { label: string; tone: "brand" | "warn" | "good" | "neutral" }> = {
  open: { label: "Open", tone: "brand" },
  in_progress: { label: "In progress", tone: "warn" },
  sent: { label: "Sent", tone: "good" },
  done: { label: "Done", tone: "good" },
  dismissed: { label: "Dismissed", tone: "neutral" },
};

export function ActionRow({
  item,
  team,
  canEdit,
  qs,
}: {
  item: ActionItem;
  team: { id: string; name: string }[];
  canEdit: boolean;
  qs: string;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(item.note ?? "");
  const [pending, start] = useTransition();
  const [noteSaved, setNoteSaved] = useState(false);
  const st = STATUS[item.status];
  const closed = item.status === "done" || item.status === "dismissed" || item.status === "sent";

  const run = (fn: () => Promise<void>) => start(fn);

  return (
    <li className="border-b border-line last:border-b-0">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-4 px-5 py-3.5 text-left hover:bg-surface-2/60"
      >
        <span
          className="tnum flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-[13px] font-semibold text-ink-2"
          title="Priority score"
        >
          {item.priority}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("text-[14.5px] font-medium text-ink", closed && "text-ink-3")}>{item.title}</span>
            <SegmentBadge segment={item.type} short />
          </div>
          <p className="mt-0.5 line-clamp-1 text-[13px] text-ink-2">{item.reason}</p>
        </div>
        <div className="hidden w-28 text-right md:block">
          {item.expectedUplift > 0 && (
            <>
              <p className="tnum text-[14px] font-semibold text-good">+{fmtRM(item.expectedUplift)}</p>
              <p className="text-[11.5px] text-ink-3">est. uplift</p>
            </>
          )}
        </div>
        <div className="hidden w-24 justify-end lg:flex">
          <Badge tone={st.tone}>{st.label}</Badge>
        </div>
        <ChevronDown className={cn("size-4 shrink-0 text-ink-3 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="grid gap-5 border-t border-line bg-surface-2/50 px-5 py-4 lg:grid-cols-[1fr_320px]">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="flex size-6 items-center justify-center rounded-full bg-surface text-[10px] font-semibold text-ink-2">{initials(item.username)}</span>
              <Link href={`/creators/${encodeURIComponent(item.username)}?${qs}`} className="text-[13.5px] font-medium text-brand hover:underline">
                {item.username}
              </Link>
              <span className="text-[12.5px] text-ink-3">· created {fmtDate(item.createdAt)}</span>
            </div>
            <p className="mb-2 text-[12px] font-medium tracking-wide text-ink-3 uppercase">Message to send</p>
            <pre className="font-sans text-[14px] leading-relaxed whitespace-pre-wrap text-ink">{item.instruction}</pre>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <CopyButton text={item.instruction} />
              <a
                href={`https://www.tiktok.com/@${item.username}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-8 items-center rounded-lg border border-line-strong bg-surface px-3 text-[13px] font-medium text-ink hover:bg-surface-2"
              >
                Open TikTok
              </a>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {item.status !== "sent" && (
                <Button size="sm" variant="primary" disabled={!canEdit || pending} onClick={() => run(() => setActionStatus(item.id, "sent"))}>
                  {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Mark sent
                </Button>
              )}
              {item.status !== "in_progress" && !closed && (
                <Button size="sm" disabled={!canEdit || pending} onClick={() => run(() => setActionStatus(item.id, "in_progress"))}>
                  Start
                </Button>
              )}
              {item.status !== "done" && (
                <Button size="sm" disabled={!canEdit || pending} onClick={() => run(() => setActionStatus(item.id, "done"))}>
                  <Check className="size-4" /> Done
                </Button>
              )}
              {item.status !== "dismissed" && (
                <Button size="sm" variant="ghost" disabled={!canEdit || pending} onClick={() => run(() => setActionStatus(item.id, "dismissed"))}>
                  <X className="size-4" /> Dismiss
                </Button>
              )}
              {closed && (
                <Button size="sm" variant="ghost" disabled={!canEdit || pending} onClick={() => run(() => setActionStatus(item.id, "open"))}>
                  Reopen
                </Button>
              )}
            </div>
            <div>
              <label className="mb-1 block text-[12.5px] text-ink-3" htmlFor={`as-${item.id}`}>Assigned to</label>
              <Select
                id={`as-${item.id}`}
                className="w-full"
                disabled={!canEdit}
                value={item.assigneeId ?? ""}
                onChange={(e) => run(() => assignAction(item.id, e.target.value || null))}
              >
                <option value="">Unassigned</option>
                {team.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-[12.5px] text-ink-3" htmlFor={`n-${item.id}`}>Note</label>
              <textarea
                id={`n-${item.id}`}
                rows={3}
                value={note}
                disabled={!canEdit}
                onChange={(e) => { setNote(e.target.value); setNoteSaved(false); }}
                onBlur={() => canEdit && note !== (item.note ?? "") && run(async () => { await saveActionNote(item.id, note); setNoteSaved(true); })}
                placeholder="What did they say? Next step?"
                className="w-full rounded-lg border border-line-strong bg-surface p-2.5 text-[13.5px] text-ink placeholder:text-ink-3 focus:border-brand"
              />
              {noteSaved && <p className="mt-1 text-[12px] text-good">Saved</p>}
            </div>
            {item.completedAt && <p className="text-[12px] text-ink-3">{st.label} {fmtDate(item.completedAt)}{item.assigneeName ? ` by ${item.assigneeName}` : ""}</p>}
          </div>
        </div>
      )}
    </li>
  );
}
