"use client";

import { useState, useTransition } from "react";
import { Pause, Play, UserCheck } from "lucide-react";
import { markContacted, markPromised, pauseCreator, resumeCreator, undoEvent } from "@/app/actions/workflow";
import { Button, Input } from "@/components/ui/primitives";

/** The same quick actions as Today's Work, on the creator's own page. */
export function CreatorActions({ username, paused, today }: { username: string; paused: boolean; today: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ text: string; undo?: number } | null>(null);
  const [panel, setPanel] = useState<null | "promise" | "pause">(null);
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const run = (fn: () => Promise<{ ok?: true; error?: string; eventId?: number }>, ok: string) =>
    start(async () => {
      const r = await fn();
      setMsg({ text: r.error ?? ok, undo: r.error ? undefined : r.eventId });
      if (!r.error) setPanel(null);
    });
  return (
    <div className="space-y-2 px-5 pb-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {paused ? (
          <Button size="sm" disabled={pending} onClick={() => run(() => resumeCreator(username), "Resumed.")}><Play className="size-3.5" /> Resume</Button>
        ) : (
          <>
            <Button size="sm" disabled={pending} onClick={() => run(() => markContacted([username]), "Marked as contacted. Follow-up scheduled.")}><UserCheck className="size-3.5" /> Contacted</Button>
            <Button size="sm" variant="secondary" onClick={() => setPanel(panel === "promise" ? null : "promise")}>Promised date</Button>
            <Button size="sm" variant="secondary" onClick={() => setPanel(panel === "pause" ? null : "pause")}><Pause className="size-3.5" /> Pause</Button>
          </>
        )}
        {msg && (
          <span role="status" className="ml-2 text-[12.5px] text-ink-2">
            {msg.text}{" "}
            {msg.undo && <button className="underline" disabled={pending} onClick={() => run(() => undoEvent(msg.undo!), "Undone.")}>Undo</button>}
          </span>
        )}
      </div>
      {panel === "promise" && (
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); run(() => markPromised(username, date), "Promise saved."); }}>
          <label className="text-[13px]">Promised date<Input type="date" required min={today} value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 block w-44" /></label>
          <Button size="sm" type="submit" disabled={pending || !date}>Save</Button>
          <span className="pb-2 text-[12px] text-ink-3">Add product, type or quantity from Today&apos;s Work.</span>
        </form>
      )}
      {panel === "pause" && (
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); run(() => pauseCreator(username, reason), "Paused."); }}>
          <label className="min-w-56 text-[13px]">Short reason<Input required minLength={2} value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 block w-full" /></label>
          <Button size="sm" type="submit" disabled={pending || reason.trim().length < 2}>Pause</Button>
        </form>
      )}
    </div>
  );
}
