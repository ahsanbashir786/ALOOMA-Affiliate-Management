"use client";

import { useActionState, useState } from "react";
import { AlertCircle, ArrowRight, Eye, EyeOff, Loader2, Lock, Mail, TriangleAlert, User } from "lucide-react";
import { Input, Label } from "@/components/ui/primitives";
import type { FormState } from "@/app/actions/auth";

type Field = { name: string; label: string; type?: string; placeholder?: string; autoComplete?: string };

function FieldBox({ f, state, caps, setCaps }: { f: Field; state: FormState; caps: boolean; setCaps: (b: boolean) => void }) {
  const [show, setShow] = useState(false);
  const isPw = f.type === "password";
  const Icon = isPw ? Lock : f.type === "email" ? Mail : User;
  return (
    <div className="au-rise" style={{ animationDelay: "0.25s" }}>
      <Label htmlFor={f.name}>{f.label}</Label>
      <div className="group relative">
        <Icon className="pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-ink-3 transition-colors group-focus-within:text-brand" />
        <Input
          id={f.name}
          name={f.name}
          type={isPw && show ? "text" : (f.type ?? "text")}
          placeholder={f.placeholder}
          autoComplete={f.autoComplete}
          defaultValue={isPw ? undefined : state?.values?.[f.name]}
          required
          onKeyUp={isPw ? (e) => setCaps(e.getModifierState("CapsLock")) : undefined}
          onBlur={isPw ? () => setCaps(false) : undefined}
          className={`h-12 rounded-xl bg-surface-2/60 pl-11 text-[15px] transition-all focus:bg-surface focus:shadow-[0_0_0_4px_var(--brand-soft)] ${isPw ? "pr-12" : ""}`}
        />
        {isPw && (
          <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"} className="absolute top-1/2 right-2 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink">
            {show ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
          </button>
        )}
      </div>
      {isPw && caps && <p className="mt-1.5 flex items-center gap-1.5 text-[12.5px] text-warn"><TriangleAlert className="size-3.5" />Caps Lock is on</p>}
    </div>
  );
}

export function AuthForm({
  action,
  fields,
  submitLabel,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  fields: Field[];
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [caps, setCaps] = useState(false);
  return (
    <form action={formAction} className="space-y-5">
      {fields.map((f) => <FieldBox key={f.name} f={f} state={state} caps={caps} setCaps={setCaps} />)}
      {state?.error && (
        <p key={state.error + (state.values?.email ?? "")} role="alert" className="au-shake flex items-start gap-2 rounded-xl bg-critical-soft px-3.5 py-3 text-[13px] text-critical">
          <AlertCircle className="mt-px size-4 shrink-0" /> {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="au-sweep au-rise group relative flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-[#264482] to-[#3563b8] text-[15px] font-semibold text-white shadow-[0_10px_24px_-10px_rgba(38,68,130,0.7)] transition-all hover:shadow-[0_14px_30px_-10px_rgba(38,68,130,0.85)] active:scale-[0.99] disabled:opacity-80"
        style={{ animationDelay: "0.35s" }}
      >
        {pending ? <><Loader2 className="size-[18px] animate-spin" />Signing in…</> : <>{submitLabel}<ArrowRight className="size-[18px] transition-transform group-hover:translate-x-1" /></>}
      </button>
    </form>
  );
}
