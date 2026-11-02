"use client";

import { useState, useTransition } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { refreshSampleChecks } from "@/app/actions/samples";

export function RefreshSamplesButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-3">
      {msg && <span className="text-[13px] text-ink-2">{msg}</span>}
      <Button
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await refreshSampleChecks();
            setMsg(`Checked. ${r.matched ? `${r.matched} receiver${r.matched === 1 ? "" : "s"} matched. ` : ""}${r.created} new action${r.created === 1 ? "" : "s"}.`);
          })
        }
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Re-check posting
      </Button>
    </div>
  );
}
