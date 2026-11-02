"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button, Input } from "@/components/ui/primitives";
import { setBuyerCreator } from "@/app/actions/samples";

/** TikTok hides the receiver's name. If the app can't match it, staff type the TikTok username once. */
export function BuyerMatchForm({ buyer }: { buyer: string }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await setBuyerCreator(buyer, name);
          setError(r.error ?? null);
        });
      }}
    >
      <Input value={name} onChange={(e) => { setName(e.target.value); setError(null); }} placeholder="TikTok username" aria-label={`Username of ${buyer}`} className="h-8 w-[200px] text-[13px]" />
      <Button type="submit" size="sm" variant="primary" disabled={pending || !name.trim()}>
        {pending && <Loader2 className="size-4 animate-spin" />} Set creator
      </Button>
      {error && <span className="text-[12.5px] text-critical">{error}</span>}
    </form>
  );
}
