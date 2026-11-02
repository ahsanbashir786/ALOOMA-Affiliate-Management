"use client";

import { useActionState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { Button, Input, Label } from "@/components/ui/primitives";
import type { FormState } from "@/app/actions/auth";

type Field = { name: string; label: string; type?: string; placeholder?: string; autoComplete?: string };

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
  return (
    <form action={formAction} className="space-y-4">
      {fields.map((f) => (
        <div key={f.name}>
          <Label htmlFor={f.name}>{f.label}</Label>
          <Input
            id={f.name}
            name={f.name}
            type={f.type ?? "text"}
            placeholder={f.placeholder}
            autoComplete={f.autoComplete}
            defaultValue={f.type === "password" ? undefined : state?.values?.[f.name]}
            required
            className="h-10"
          />
        </div>
      ))}
      {state?.error && (
        <p role="alert" className="flex items-start gap-2 rounded-lg bg-critical-soft px-3 py-2.5 text-[13px] text-critical">
          <AlertCircle className="mt-px size-4 shrink-0" /> {state.error}
        </p>
      )}
      <Button type="submit" variant="primary" disabled={pending} className="h-10 w-full">
        {pending && <Loader2 className="size-4 animate-spin" />} {submitLabel}
      </Button>
    </form>
  );
}
