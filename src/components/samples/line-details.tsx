"use client";

import { useState, useTransition } from "react";
import { ChevronDown, Loader2, StickyNote } from "lucide-react";
import { Button, Input, Select } from "@/components/ui/primitives";
import { updateSample } from "@/app/actions/samples";
import { cn, fmtDateShort } from "@/lib/utils";

type Props = {
  id: number;
  canEdit: boolean;
  team: { id: string; name: string }[];
  ownerId: string | null;
  ownerName: string | null;
  followUpAt: string | null;
  note: string | null;
  overrideResult: string | null;
  autoLabel: string | null;
  orderSubstatus: string | null;
  trackingId: string | null;
  today: string;
};

/** Collapsible "notes & follow-up" strip under a sample line: person in charge, follow-up date, note, corrected result. */
export function LineDetails(p: Props) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [f, setF] = useState({ ownerId: p.ownerId ?? "", followUpAt: p.followUpAt ?? "", note: p.note ?? "", result: p.overrideResult ?? "" });
  const due = p.followUpAt != null && p.followUpAt <= p.today;
  const hasInfo = p.note || p.followUpAt || p.ownerName;

  const save = () =>
    start(async () => {
      const r = await updateSample(p.id, {
        ownerId: f.ownerId || null,
        followUpAt: f.followUpAt || null,
        note: f.note || null,
        resultOverride: (f.result || null) as "posted_video" | "did_live" | "not_posted" | null,
      });
      setMsg(r.error ?? "Saved");
    });

  return (
    <div className="border-t border-dashed border-line px-5 py-2">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-2 text-left text-[12.5px] text-ink-3 hover:text-ink">
        <StickyNote className="size-3.5" />
        <span className="font-medium">Notes & follow-up</span>
        {hasInfo && !open && (
          <span className="min-w-0 flex-1 truncate text-ink-2">
            {p.ownerName ? `${p.ownerName}` : ""}
            {p.followUpAt ? ` · follow up ${fmtDateShort(p.followUpAt)}` : ""}
            {p.note ? ` · ${p.note}` : ""}
          </span>
        )}
        {due && !open && <span className="rounded-full bg-warn-soft px-1.5 text-[11px] font-medium text-warn">follow-up due</span>}
        <ChevronDown className={cn("ml-auto size-4 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="mt-3 space-y-3 pb-2">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-[12.5px] text-ink-3">Person in charge
              <Select value={f.ownerId} disabled={!p.canEdit} onChange={(e) => setF({ ...f, ownerId: e.target.value })} className="mt-1 h-8 w-full text-[13px]">
                <option value="">Unassigned</option>
                {p.team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </Select>
            </label>
            <label className="text-[12.5px] text-ink-3">Follow-up date
              <Input type="date" value={f.followUpAt} disabled={!p.canEdit} onChange={(e) => setF({ ...f, followUpAt: e.target.value })} className="mt-1 h-8 text-[13px]" />
            </label>
            <label className="text-[12.5px] text-ink-3">Result{p.autoLabel ? ` (automatic: ${p.autoLabel})` : ""}
              <Select value={f.result} disabled={!p.canEdit} onChange={(e) => setF({ ...f, result: e.target.value })} className="mt-1 h-8 w-full text-[13px]">
                <option value="">Automatic</option>
                <option value="posted_video">Posted video (I checked)</option>
                <option value="did_live">Did LIVE (I checked)</option>
                <option value="not_posted">Not posted (I checked)</option>
              </Select>
            </label>
          </div>
          <textarea
            rows={2}
            value={f.note}
            disabled={!p.canEdit}
            onChange={(e) => setF({ ...f, note: e.target.value })}
            placeholder="What did they say? When will they post?"
            className="w-full rounded-lg border border-line-strong bg-surface p-2.5 text-[13.5px] text-ink placeholder:text-ink-3 focus:border-brand"
          />
          <div className="flex flex-wrap items-center gap-3">
            {p.canEdit && (
              <Button size="sm" variant="primary" disabled={pending} onClick={save}>
                {pending && <Loader2 className="size-4 animate-spin" />} Save
              </Button>
            )}
            {msg && <span className={cn("text-[12.5px]", msg === "Saved" ? "text-good" : "text-critical")}>{msg}</span>}
            <span className="ml-auto text-[12px] text-ink-3">
              {p.orderSubstatus ? `Order: ${p.orderSubstatus}` : ""}
              {p.trackingId ? ` · Tracking ${p.trackingId}` : ""}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
