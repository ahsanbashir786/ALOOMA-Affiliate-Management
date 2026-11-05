"use client";

import { useActionState, useState, useTransition } from "react";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Button, Input, Label, Select } from "@/components/ui/primitives";
import { createUser, resetPassword, saveWorkflowSettings, updateUser, type Result } from "@/app/actions/settings";

function Feedback({ state }: { state: Result }) {
  if (!state) return null;
  return state.error ? (
    <p role="alert" className="flex items-start gap-2 text-[13px] text-critical"><AlertCircle className="mt-0.5 size-4 shrink-0" /> {state.error}</p>
  ) : (
    <p className="flex items-start gap-2 text-[13px] text-good"><CheckCircle2 className="mt-0.5 size-4 shrink-0" /> {state.ok}</p>
  );
}

export function NewUserForm() {
  const [state, action, pending] = useActionState(createUser, undefined);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_160px_1fr_auto] lg:items-end">
      <div><Label htmlFor="nu-name">Name</Label><Input id="nu-name" name="name" required /></div>
      <div><Label htmlFor="nu-email">Email</Label><Input id="nu-email" name="email" type="email" required /></div>
      <div>
        <Label htmlFor="nu-role">Role</Label>
        <Select id="nu-role" name="role" defaultValue="viewer" className="w-full">
          <option value="viewer">Viewer</option>
          <option value="manager">Affiliate manager</option>
          <option value="admin">Admin</option>
        </Select>
      </div>
      <div><Label htmlFor="nu-pass">Temporary password</Label><Input id="nu-pass" name="password" type="text" minLength={8} required autoComplete="off" /></div>
      <Button type="submit" variant="primary" disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />} Add user</Button>
      <label className="flex items-center gap-2 text-[13px] text-ink-2 sm:col-span-2 lg:col-span-5">
        <input type="checkbox" name="canEditContacts" className="size-4 accent-[var(--brand)]" /> Can edit WhatsApp numbers (admins always can)
      </label>
      <div className="sm:col-span-2 lg:col-span-5"><Feedback state={state} /></div>
    </form>
  );
}

export function UserRow({ u, isMe }: { u: { id: string; name: string; email: string; role: "admin" | "manager" | "viewer"; active: boolean; canEditContacts: boolean }; isMe: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Result>();
  const [reset, setReset] = useState(false);
  const [resetState, resetAction, resetPending] = useActionState(resetPassword, undefined);
  return (
    <li className="border-b border-line px-5 py-3.5 last:border-b-0">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14.5px] font-medium text-ink">{u.name}{isMe && <span className="ml-2 text-[12px] text-ink-3">(you)</span>}</p>
          <p className="truncate text-[13px] text-ink-3">{u.email}</p>
        </div>
        <Select
          aria-label={`Role for ${u.name}`}
          value={u.role}
          disabled={pending}
          onChange={(e) => start(async () => setMsg(await updateUser(u.id, { role: e.target.value as typeof u.role })))}
        >
          <option value="viewer">Viewer</option>
          <option value="manager">Affiliate manager</option>
          <option value="admin">Admin</option>
        </Select>
        <label className="flex items-center gap-2 text-[13px] text-ink-2" title="WhatsApp numbers are personal data. Admins can always edit them.">
          <input
            type="checkbox"
            className="size-4 accent-[var(--brand)]"
            checked={u.role === "admin" || u.canEditContacts}
            disabled={pending || u.role === "admin"}
            onChange={(e) => start(async () => setMsg(await updateUser(u.id, { canEditContacts: e.target.checked })))}
          />
          Can edit WhatsApp
        </label>
        <Button size="sm" variant="ghost" onClick={() => setReset((r) => !r)}>Reset password</Button>
        <Button
          size="sm"
          variant={u.active ? "danger" : "secondary"}
          disabled={pending || isMe}
          onClick={() => start(async () => setMsg(await updateUser(u.id, { active: !u.active })))}
        >
          {u.active ? "Deactivate" : "Reactivate"}
        </Button>
      </div>
      {reset && (
        <form action={resetAction} className="mt-3 flex flex-wrap items-center gap-2">
          <input type="hidden" name="id" value={u.id} />
          <Input name="password" placeholder="New password (min. 8)" minLength={8} required className="max-w-[260px]" autoComplete="off" />
          <Button type="submit" size="sm" disabled={resetPending}>Set password</Button>
          <Feedback state={resetState} />
        </form>
      )}
      {msg?.error && <div className="mt-2"><Feedback state={msg} /></div>}
    </li>
  );
}

type W = { followUpDays: number; promiseFollowUpDays: number; helpDays: number; maxUnanswered: number; todayLimit: number; developmentLimit: number; stuckTransitDays: number; inactiveDays: number; stalledOverdueDays: number };
const W_FIELDS: { name: keyof W; label: string; help: string }[] = [
  { name: "followUpDays", label: "Follow up after “Contacted” (days)", help: "Calendar days, Malaysia time. Default 3." },
  { name: "promiseFollowUpDays", label: "Follow up after a promised date (days)", help: "Checked the day after the promised date if no matching content is seen. Default 1." },
  { name: "helpDays", label: "“Needs help” next action (days)", help: "Pre-filled date when staff flag a creator. Default 2." },
  { name: "maxUnanswered", label: "Suggest pausing after (contact attempts)", help: "Attempts with no new content or promise. Only a suggestion – nothing is labelled automatically. Default 3." },
  { name: "inactiveDays", label: "Inactive after (days without a sale)", help: "A creator who sold before but not in this many days is shown as inactive. Default 28." },
  { name: "stalledOverdueDays", label: "Stalled when a promise is overdue by (days)", help: "Also flags the creator for an owner decision. Default 14." },
  { name: "stuckTransitDays", label: "Sample stuck on the way after (days)", help: "A shipped sample not delivered after this long is listed as an exception. Default 10." },
];

export function WorkflowForm({ w }: { w: W }) {
  const [state, action, pending] = useActionState(saveWorkflowSettings, undefined);
  return (
    <form action={action} className="space-y-5">
      <div className="grid gap-x-6 gap-y-4 md:grid-cols-2 xl:grid-cols-3">
        {W_FIELDS.map((f) => (
          <div key={f.name}>
            <Label htmlFor={`w-${f.name}`}>{f.label}</Label>
            <Input id={`w-${f.name}`} name={f.name} type="number" step="1" defaultValue={w[f.name]} required />
            <p className="mt-1 text-[12px] leading-snug text-ink-3">{f.help}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />} Save</Button>
        <Button type="submit" name="reset" value="1" formNoValidate disabled={pending}>Restore defaults</Button>
      </div>
      <Feedback state={state} />
    </form>
  );
}
