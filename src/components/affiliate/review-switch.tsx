"use client";

import { useState, useTransition } from "react";
import { setOutreachReview } from "@/app/actions/outreach";
import { cn } from "@/lib/utils";

/** The owner's switch for approving and rejecting samples on TikTok. Off until switched on. */
export function ReviewSwitch({ on }: { on: boolean }) {
  const [v, setV] = useState(on);
  const [pending, start] = useTransition();
  return (
    <button type="button" role="switch" aria-checked={v} aria-label="Allow approving and rejecting samples" data-testid="review-switch" disabled={pending}
      onClick={() => start(async () => { const next = !v; setV(next); const r = await setOutreachReview(next); if (r.error) setV(!next); })}
      className={cn("relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed", v ? "bg-brand" : "bg-line-strong")}>
      <span className={cn("inline-block size-4.5 rounded-full bg-white shadow transition-transform", v ? "translate-x-[22px]" : "translate-x-[3px]")} />
    </button>
  );
}
