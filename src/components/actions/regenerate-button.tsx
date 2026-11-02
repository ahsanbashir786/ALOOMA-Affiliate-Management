"use client";

import { useState, useTransition } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { regenerateActions } from "@/app/actions/actions";

export function RegenerateButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-3">
      {msg && <span className="text-[13px] text-ink-2">{msg}</span>}
      <Button
        variant="primary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await regenerateActions();
            setMsg(`${r.created} new · ${r.total} recommendations`);
          })
        }
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
        Refresh recommendations
      </Button>
    </div>
  );
}
