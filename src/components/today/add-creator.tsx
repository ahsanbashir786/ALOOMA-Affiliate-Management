"use client";

import { useState, useTransition } from "react";
import { UserPlus } from "lucide-react";
import { addCreatorAction } from "@/app/actions/workflow";
import { Button, Input } from "@/components/ui/primitives";

/** Start outreach to a creator nobody has recorded yet. No sample, export row or WhatsApp number is needed. */
export function AddCreator({ canPhone }: { canPhone: boolean }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [contacted, setContacted] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!open)
    return (
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <UserPlus className="size-4" /> Add creator
      </Button>
    );
  return (
    <form
      className="flex flex-wrap items-end gap-2 rounded-lg border border-line bg-surface p-3"
      aria-label="Add creator"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await addCreatorAction({ username: name, phone: phone || undefined, contactedNow: contacted });
          if (r.error) setMsg(r.error);
          else {
            setMsg(r.existed ? `@${r.username} is already known – ${contacted ? "contact recorded." : "nothing changed."}` : `@${r.username} added${contacted ? " and marked as contacted." : "."}`);
            setName("");
            setPhone("");
          }
        });
      }}
    >
      <label className="text-[13px]">TikTok username<Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="@name" className="mt-1 block w-48" /></label>
      {canPhone && <label className="text-[13px]">WhatsApp (optional)<Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="60123456789" className="mt-1 block w-44" /></label>}
      <label className="flex items-center gap-2 pb-2 text-[13px]"><input type="checkbox" checked={contacted} onChange={(e) => setContacted(e.target.checked)} className="size-4" /> I already contacted them</label>
      <Button size="sm" type="submit" disabled={pending || name.trim().length < 2}>Add</Button>
      <button type="button" className="pb-2 text-[13px] text-ink-3 underline" onClick={() => setOpen(false)}>Close</button>
      {msg && <span role="status" className="pb-2 text-[12.5px] text-ink-2">{msg}</span>}
    </form>
  );
}
