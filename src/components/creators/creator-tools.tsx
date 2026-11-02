"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, ClipboardPlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { queueCreatorAction, saveCreatorNotes } from "@/app/actions/actions";
import { saveCreatorContact } from "@/app/actions/samples";

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

export function ContactForm({
  username,
  phone,
  approach,
  canEdit,
}: {
  username: string;
  phone: string | null;
  approach: string | null;
  canEdit: boolean;
}) {
  const [tel, setTel] = useState(phone ?? "");
  const [type, setType] = useState(approach ?? "");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-[12.5px] text-ink-3">
          WhatsApp
          <input
            value={tel}
            disabled={!canEdit}
            onChange={(e) => { setTel(e.target.value); setMsg(null); }}
            placeholder="60123456789"
            className="mt-1 h-9 w-full rounded-lg border border-line-strong bg-surface px-3 text-[14px] text-ink placeholder:text-ink-3 focus:border-brand disabled:opacity-70"
          />
        </label>
        <label className="text-[12.5px] text-ink-3">
          Works with us via
          <select
            value={type}
            disabled={!canEdit}
            onChange={(e) => { setType(e.target.value); setMsg(null); }}
            className="mt-1 h-9 w-full rounded-lg border border-line-strong bg-surface px-2.5 text-[14px] text-ink focus:border-brand disabled:opacity-70"
          >
            <option value="">Not set</option>
            <option value="video">Videos</option>
            <option value="live">LIVE</option>
            <option value="both">Videos + LIVE</option>
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {canEdit && (
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await saveCreatorContact(username, { phone: tel || null, approach: (type || null) as "video" | "live" | "both" | null });
                setMsg(r.error ?? "Saved");
              })
            }
          >
            {pending && <Loader2 className="size-4 animate-spin" />} Save
          </Button>
        )}
        {phone && (
          <a href={`https://wa.me/${phone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="text-[13px] font-medium text-brand hover:underline">
            Open WhatsApp
          </a>
        )}
        {msg && <span className={msg === "Saved" ? "text-[13px] text-good" : "text-[13px] text-critical"}>{msg}</span>}
      </div>
    </div>
  );
}
