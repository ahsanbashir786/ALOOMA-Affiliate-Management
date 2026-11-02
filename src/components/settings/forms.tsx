"use client";

import { useActionState, useState, useTransition } from "react";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Button, Input, Label, Select } from "@/components/ui/primitives";
import { createUser, resetPassword, saveOwnAccounts, saveThresholds, updateUser, type Result } from "@/app/actions/settings";

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
      <div className="sm:col-span-2 lg:col-span-5"><Feedback state={state} /></div>
    </form>
  );
}

export function UserRow({ u, isMe }: { u: { id: string; name: string; email: string; role: "admin" | "manager" | "viewer"; active: boolean }; isMe: boolean }) {
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

type T = {
  targetVideosPerWeek: number; minSellerGmv: number; starTopShare: number; strongPercentile: number; declineThreshold: number;
  growthThreshold: number; upliftHaircut: number; upliftWeeks: number; lowConversionMinViews: number; untappedMinFollowers: number; highCancelRate: number;
};

const FIELDS: { name: keyof T; label: string; help: string; pct?: boolean; step?: string }[] = [
  { name: "targetVideosPerWeek", label: "Target new videos per week", help: "Sellers posting less than this (and selling strongly) are flagged as under-posting.", step: "0.25" },
  { name: "minSellerGmv", label: "Seller threshold (RM per 28 days)", help: "Below this a creator is “long tail”. Scales with the selected period." },
  { name: "starTopShare", label: "Star = top % of sellers", help: "Share of sellers (by GMV) treated as stars.", pct: true },
  { name: "strongPercentile", label: "Strong output percentile", help: "GMV percentile above which we ask for more content.", pct: true },
  { name: "declineThreshold", label: "Slipping when GMV falls by", help: "Drop versus the previous period, in %.", pct: true },
  { name: "growthThreshold", label: "Rising when GMV grows by", help: "Growth versus the previous period, in %.", pct: true },
  { name: "highCancelRate", label: "High cancellation rate", help: "Flags creators whose orders cancel more than this, in %.", pct: true },
  { name: "upliftHaircut", label: "Uplift confidence", help: "Share of a creator's historic yield per video expected from a new video, in %.", pct: true },
  { name: "upliftWeeks", label: "Uplift horizon (weeks)", help: "Weeks of extra posting used in the estimate." },
  { name: "lowConversionMinViews", label: "Min. views to judge conversion", help: "Per 28 days. Creators below this aren't coached on conversion." },
  { name: "untappedMinFollowers", label: "Untapped reach followers", help: "Non-sellers above this follower count are suggested for outreach." },
];

export function ThresholdsForm({ t }: { t: T }) {
  const [state, action, pending] = useActionState(saveThresholds, undefined);
  return (
    <form action={action} className="space-y-5">
      <div className="grid gap-x-6 gap-y-4 md:grid-cols-2 xl:grid-cols-3">
        {FIELDS.map((f) => (
          <div key={f.name}>
            <Label htmlFor={`t-${f.name}`}>{f.label}</Label>
            <Input id={`t-${f.name}`} name={f.name} type="number" step={f.step ?? "any"} defaultValue={f.pct ? Math.round(t[f.name] * 100) : t[f.name]} required />
            <p className="mt-1 text-[12px] leading-snug text-ink-3">{f.help}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />} Save rules</Button>
        <Button type="submit" name="reset" value="1" formNoValidate disabled={pending}>Restore defaults</Button>
      </div>
      <Feedback state={state} />
    </form>
  );
}

export function OwnAccountsForm({ accounts, auto }: { accounts: string; auto: boolean }) {
  const [state, action, pending] = useActionState(saveOwnAccounts, undefined);
  return (
    <form action={action} className="space-y-3">
      <div className="max-w-xl">
        <Label htmlFor="own">Brand accounts</Label>
        <Input id="own" name="accounts" defaultValue={accounts} placeholder="e.g. aloomamalaysia" />
        <p className="mt-1 text-[12px] text-ink-3">
          Your own TikTok accounts (comma separated). They&apos;re excluded from creator rankings and counted as “Brand LIVE”.
          {auto && " Currently detected automatically from LIVE orders."}
        </p>
      </div>
      <Button type="submit" disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />} Save</Button>
      <Feedback state={state} />
    </form>
  );
}
