"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { checkEligibility } from "@/app/actions/outreach";
import { Button } from "@/components/ui/primitives";

/** Asks TikTok about the creators waiting for a decision, fifteen at a time. */
export function CheckEligibility({ unchecked }: { unchecked: number }) {
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  if (unchecked === 0 && !msg) return null;
  return (
    <div className="flex flex-wrap items-center gap-3" data-testid="check-eligibility">
      <Button size="sm" disabled={pending} onClick={() => start(async () => { const r = await checkEligibility(); setMsg(r.error ? r.error : `Checked ${r.checked}. ${r.left ? `${r.left} still to check: press again.` : "All checked."}`); router.refresh(); })}>
        {pending ? "Asking TikTok…" : `Check Eligibility (${unchecked} not checked)`}
      </Button>
      {msg && <span className="text-[12.5px] text-ink-2" data-testid="check-msg">{msg}</span>}
    </div>
  );
}
