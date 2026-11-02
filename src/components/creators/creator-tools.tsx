"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, ClipboardPlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { queueCreatorAction, saveCreatorNotes } from "@/app/actions/actions";

export function QueueActionButton({ username }: { username: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-3">
      <Button
        size="sm"
        variant="primary"
        disabled={pending}
        onClick={() => start(async () => setMsg((await queueCreatorAction(username)).message))}
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : <ClipboardPlus className="size-4" />}
        Add to action centre
      </Button>
      {msg && (
        <span className="flex items-center gap-1 text-[13px] text-ink-2">
          <CheckCircle2 className="size-4 text-good" /> {msg}
        </span>
      )}
    </div>
  );
}

export function NotesForm({ username, notes, doNotContact, canEdit }: { username: string; notes: string; doNotContact: boolean; canEdit: boolean }) {
  const [text, setText] = useState(notes);
  const [dnc, setDnc] = useState(doNotContact);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  return (
    <div className="space-y-3">
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setSaved(false);
        }}
        disabled={!canEdit}
        rows={4}
        placeholder="Notes about this creator – preferences, past conversations, agreements…"
        className="w-full rounded-lg border border-line-strong bg-surface p-3 text-[14px] text-ink placeholder:text-ink-3 focus:border-brand disabled:opacity-70"
      />
      <label className="flex items-center gap-2 text-[13.5px] text-ink-2">
        <input type="checkbox" checked={dnc} disabled={!canEdit} onChange={(e) => { setDnc(e.target.checked); setSaved(false); }} className="size-4 accent-[var(--brand)]" />
        Do not contact
      </label>
      {canEdit && (
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            disabled={pending}
            onClick={() => start(async () => { await saveCreatorNotes(username, text, dnc); setSaved(true); })}
          >
            {pending && <Loader2 className="size-4 animate-spin" />} Save
          </Button>
          {saved && <span className="text-[13px] text-good">Saved</span>}
        </div>
      )}
    </div>
  );
}
