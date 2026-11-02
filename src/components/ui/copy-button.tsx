"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "./primitives";

export function CopyButton({ text, label = "Copy message", size = "sm" }: { text: string; label?: string; size?: "sm" | "md" }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      size={size}
      variant="secondary"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          const ta = document.createElement("textarea");
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          ta.remove();
        }
        setDone(true);
        setTimeout(() => setDone(false), 1800);
      }}
    >
      {done ? <Check className="size-4 text-good" /> : <Copy className="size-4" />}
      {done ? "Copied" : label}
    </Button>
  );
}
