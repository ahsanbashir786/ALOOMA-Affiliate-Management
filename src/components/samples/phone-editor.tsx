"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, MessageCircle, Pencil, Plus, X } from "lucide-react";
import { saveCreatorPhone } from "@/app/actions/samples";
import { waLink } from "@/lib/samples/states";

/** WhatsApp number of a creator: shown as a link, or "+ Add WhatsApp" – the one thing staff add by hand. */
export function PhoneEditor({ username, phone, canEdit }: { username: string; phone: string | null; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(phone ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      const r = await saveCreatorPhone(username, value);
      if (r.error) setError(r.error);
      else {
        setError(null);
        setEditing(false);
      }
    });

  if (editing) {
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <input
          autoFocus
          value={value}
          onChange={(e) => { setValue(e.target.value); setError(null); }}
          onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
          placeholder="60123456789"
          aria-label={`WhatsApp number of ${username}`}
          className="h-8 w-[150px] rounded-md border border-line-strong bg-surface px-2 text-[13px] text-ink focus:border-brand"
        />
        <button onClick={save} disabled={pending} aria-label="Save number" className="rounded-md bg-brand p-1.5 text-white hover:bg-brand-strong disabled:opacity-50">
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
        </button>
        <button onClick={() => { setEditing(false); setValue(phone ?? ""); setError(null); }} aria-label="Cancel" className="rounded-md p-1.5 text-ink-3 hover:bg-surface-2">
          <X className="size-3.5" />
        </button>
        {error && <span className="w-full text-[12px] text-critical">{error}</span>}
      </span>
    );
  }
  if (!phone) {
    return canEdit ? (
      <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1 rounded-md border border-dashed border-line-strong px-2 py-1 text-[12.5px] font-medium text-brand hover:bg-brand-soft">
        <Plus className="size-3.5" /> Add WhatsApp
      </button>
    ) : (
      <span className="text-[12.5px] text-ink-3">No number</span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <a href={waLink(phone)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[13px] font-medium text-good hover:underline">
        <MessageCircle className="size-4" /> {phone}
      </a>
      {canEdit && (
        <button onClick={() => setEditing(true)} aria-label="Edit number" className="rounded p-1 text-ink-3 hover:bg-surface-2 hover:text-ink">
          <Pencil className="size-3.5" />
        </button>
      )}
    </span>
  );
}
