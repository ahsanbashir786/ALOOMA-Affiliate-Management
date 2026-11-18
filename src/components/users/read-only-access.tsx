"use client";

import { useActionState, useState, useTransition } from "react";
import { AlertCircle, Check, CheckCircle2, Copy, Eye, ShieldCheck, Trash2 } from "lucide-react";
import { createReadOnlyAccess, removeReadOnlyAccess, setReadOnlyExpiry, type ReadOnlyResult } from "@/app/actions/users";
import { Button, Input, Select } from "@/components/ui/primitives";
import { InfoTip } from "@/components/ui/info-tip";
import { PERMISSIONS, READ_ONLY_SCREENS } from "@/lib/permissions";
import { cn } from "@/lib/utils";

export type ReadOnlyLogin = { id: string; name: string; email: string; active: boolean; lastLoginAt: string | null; expiresAt: string | null; screens: string[] };

const SCREENS = READ_ONLY_SCREENS.map((k) => ({ key: k, label: PERMISSIONS.find((p) => p.key === k)?.label ?? k }));
const dmy = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kuala_Lumpur", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso));

function Copy1({ text, label, testId }: { text: string; label: string; testId?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" data-testid={testId} onClick={() => { void navigator.clipboard?.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); }} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line-strong bg-surface px-2.5 text-[12.5px] font-medium text-ink-2 hover:bg-surface-2">
      {done ? <Check className="size-3.5 text-good" /> : <Copy className="size-3.5" />}{done ? "Copied" : label}
    </button>
  );
}

/** The text to paste to an AI assistant: where to sign in, what it may do, and what to look for. */
type Creds = NonNullable<NonNullable<ReadOnlyResult>["credentials"]>;
function instructions(c: Creds, origin: string) {
  return [
    "You have been given READ-ONLY access to ALOOMA's affiliate, ads and profit system, to review it and suggest improvements.",
    "",
    `Sign in at: ${origin}/login`,
    `Email: ${c.email}`,
    `Password: ${c.password}`,
    `This login ${c.expiresAt ? `stops working on ${dmy(c.expiresAt)}` : "has no end date"}.`,
    "",
    `Screens you can open: ${c.screens.join(", ")}.`,
    "You can only look: nothing can be saved, synced, imported or downloaded, and contact numbers are hidden.",
    "Please do not try to change anything. Do not share this login or the data you see.",
    "",
    "What I would like you to look at:",
    "1. Are the profit and loss numbers explained clearly and do they add up (sales, platform fees, shipping, product cost, ad spend)?",
    "2. Is anything confusing, missing or slow on any screen?",
    "3. What would make this system more useful for a small online bedding seller on TikTok Shop and Shopee?",
    "Give your answer as a short list, most important first, in plain English.",
  ].join("\n");
}

export function ReadOnlyAccess({ logins }: { logins: ReadOnlyLogin[] }) {
  const [state, action, pending] = useActionState<ReadOnlyResult, FormData>(createReadOnlyAccess, undefined);
  const [pw, startPw] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [now] = useState(() => Date.now());
  const c = state?.credentials;
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const act = (fn: () => Promise<{ ok?: string; error?: string } | undefined>) => startPw(async () => { const r = await fn(); setMsg(r?.error ?? r?.ok ?? null); });

  return (
    <div className="space-y-5" data-testid="read-only-access">
      <section className="rounded-2xl border border-line bg-surface p-5 shadow-card">
        <h2 className="mb-1 flex items-center gap-2 text-[16px] font-semibold text-ink"><Eye className="size-5 text-ink-3" />Read-Only Login<InfoTip>For letting someone look at the system without being able to change it, for example ChatGPT or Claude when you ask them to review it. The login can open only the screens you tick, cannot save, sync, import or download anything, never sees contact numbers, never sees Users or Settings, and stops working on the date you choose.</InfoTip></h2>
        <p className="mb-4 text-[13.5px] text-ink-3">Anyone with this login can see your sales, costs and profit. Switch it off when the review is done.</p>
        <form action={action} className="space-y-4" key={c ? "done" : "form"}>
          <div className="grid gap-3 sm:grid-cols-[1fr_1.2fr_0.8fr]">
            <label className="text-[13px] font-medium text-ink-2">Name<Input name="name" defaultValue="ChatGPT Review" required className="mt-1.5" data-testid="ro-name" /></label>
            <label className="text-[13px] font-medium text-ink-2">Login Email<Input name="email" type="email" defaultValue="review@alooma.my" required className="mt-1.5" data-testid="ro-email" /></label>
            <label className="text-[13px] font-medium text-ink-2">Access Ends<Select name="days" defaultValue="7" className="mt-1.5 w-full" data-testid="ro-days"><option value="1">After 1 day</option><option value="3">After 3 days</option><option value="7">After 7 days</option><option value="30">After 30 days</option><option value="0">Never</option></Select></label>
          </div>
          <fieldset>
            <legend className="text-[13px] font-medium text-ink-2">Screens It Can Open</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {SCREENS.map((s) => (
                <label key={s.key} className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-[13.5px] text-ink-2 has-[:checked]:border-brand has-[:checked]:bg-brand-soft has-[:checked]:text-brand-strong">
                  <input type="checkbox" name="screens" value={s.key} defaultChecked className="size-4 accent-[var(--brand)]" />{s.label}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="primary" disabled={pending} data-testid="ro-create">{pending ? "Creating…" : "Create Read-Only Login"}</Button>
            {state?.error && <p role="alert" className="flex items-center gap-1.5 text-[13px] text-critical"><AlertCircle className="size-4" />{state.error}</p>}
          </div>
        </form>
      </section>

      {c && (
        <section className="rounded-2xl border border-good/40 bg-good-soft/40 p-5" data-testid="ro-credentials">
          <p className="flex items-center gap-2 text-[15px] font-semibold text-ink"><CheckCircle2 className="size-5 text-good" />{state?.ok}</p>
          <dl className="mt-3 grid gap-2 text-[14px] sm:grid-cols-[120px_1fr]">
            <dt className="text-ink-3">Sign in at</dt><dd className="break-all font-medium text-ink">{origin}/login</dd>
            <dt className="text-ink-3">Email</dt><dd className="break-all font-medium text-ink">{c.email}</dd>
            <dt className="text-ink-3">Password</dt><dd className="font-mono text-[15px] font-semibold break-all text-ink" data-testid="ro-password">{c.password}</dd>
            <dt className="text-ink-3">Ends</dt><dd className="font-medium text-ink">{c.expiresAt ? dmy(c.expiresAt) : "Never"}</dd>
            <dt className="text-ink-3">Screens</dt><dd className="text-ink-2">{c.screens.join(", ")}</dd>
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            <Copy1 text={instructions(c, origin)} label="Copy Instructions For ChatGPT Or Claude" testId="ro-copy" />
            <Copy1 text={c.password} label="Copy Password" />
          </div>
          <p className="mt-3 text-[12.5px] text-ink-3">The instructions include the password. Paste them only where you want the review to happen.</p>
        </section>
      )}

      <section className="rounded-2xl border border-line bg-surface shadow-card" aria-label="Read-only logins">
        <p className="flex items-center gap-2 px-5 pt-4 text-[15px] font-semibold text-ink"><ShieldCheck className="size-5 text-ink-3" />Read-Only Logins ({logins.length})</p>
        {msg && <p className="px-5 pt-1 text-[13px] text-ink-2">{msg}</p>}
        {logins.length === 0 ? <p className="px-5 py-5 text-[14px] text-ink-3">None yet.</p> : (
          <ul className="mt-2 divide-y divide-line" data-testid="ro-list">
            {logins.map((l) => {
              const ended = !!l.expiresAt && new Date(l.expiresAt).getTime() < now;
              return (
                <li key={l.id} data-testid="ro-row" className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
                  <div className="min-w-0 flex-1 basis-56">
                    <p className="text-[14.5px] font-semibold text-ink">{l.name}</p>
                    <p className="truncate text-[12.5px] text-ink-3">{l.email} · {l.screens.join(", ") || "No screens"}</p>
                  </div>
                  <span className={cn("rounded-full px-2.5 py-0.5 text-[12.5px] font-semibold", ended ? "bg-critical-soft text-critical" : "bg-good-soft text-good")} data-testid="ro-status">{ended ? `Ended ${dmy(l.expiresAt!)}` : l.expiresAt ? `Until ${dmy(l.expiresAt)}` : "No end date"}</span>
                  <span className="text-[12.5px] text-ink-3">{l.lastLoginAt ? `Last sign-in ${dmy(l.lastLoginAt)}` : "Never signed in"}</span>
                  <Select aria-label="Change the end date" defaultValue="" disabled={pw} onChange={(e) => { const v = Number(e.target.value); if (e.target.value !== "") act(() => setReadOnlyExpiry(l.id, v)); }} className="h-8 text-[12.5px]">
                    <option value="">Change end date…</option><option value="1">1 day from now</option><option value="7">7 days from now</option><option value="30">30 days from now</option><option value="0">Never ends</option>
                  </Select>
                  <button type="button" data-testid="ro-remove" disabled={pw} onClick={() => { if (confirm(`Switch off the login for ${l.name}? It is deleted and stops working at once.`)) act(() => removeReadOnlyAccess(l.id)); }} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-critical/30 px-2.5 text-[12.5px] font-medium text-critical hover:bg-critical-soft"><Trash2 className="size-3.5" />Switch Off</button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
