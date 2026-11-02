"use client";

import { useActionState, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Plus } from "lucide-react";
import { Button, Input, Label } from "@/components/ui/primitives";
import { addManualSample } from "@/app/actions/samples";

export function AddSampleForm({ today, skus }: { today: string; skus: { sku: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(addManualSample, undefined);
  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" /> Log a sample request
      </Button>
    );
  }
  return (
    <form action={action} className="space-y-3 rounded-xl border border-line bg-surface p-4 shadow-card">
      <p className="text-[13px] text-ink-2">
        Log a request you approved before TikTok creates the order. When the free-sample order shows up in the next all-orders upload,
        it is linked to this entry automatically (same creator and SKU).
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.2fr_1.4fr_80px_150px_1.2fr]">
        <div><Label htmlFor="as-creator">TikTok username</Label><Input id="as-creator" name="creator" required placeholder="e.g. nadia.farahah" /></div>
        <div>
          <Label htmlFor="as-code">SKU or sample code</Label>
          <Input id="as-code" name="code" required list="as-skus" placeholder="e.g. NMP-Q-WH-ST or NWPMP-Q" />
          <datalist id="as-skus">
            {skus.map((s) => <option key={s.sku} value={s.sku}>{s.name}</option>)}
          </datalist>
        </div>
        <div><Label htmlFor="as-qty">Qty</Label><Input id="as-qty" name="quantity" type="number" min={1} defaultValue={1} required /></div>
        <div><Label htmlFor="as-date">Requested on</Label><Input id="as-date" name="requestedAt" type="date" defaultValue={today} required /></div>
        <div><Label htmlFor="as-phone">WhatsApp (optional)</Label><Input id="as-phone" name="phone" placeholder="60123456789" /></div>
      </div>
      <Input name="note" placeholder="Note (optional) – e.g. agreed to post by Friday" />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />} Add</Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Close</Button>
        {state?.error && <p role="alert" className="flex items-center gap-1.5 text-[13px] text-critical"><AlertCircle className="size-4" /> {state.error}</p>}
        {state?.ok && <p className="flex items-center gap-1.5 text-[13px] text-good"><CheckCircle2 className="size-4" /> {state.ok}</p>}
      </div>
    </form>
  );
}
