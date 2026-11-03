"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { AFFILIATE_COLS } from "./cols";

/** One affiliate: the summary cells are always visible, the per-SKU details open with the arrow. */
export function AffiliateRow({ head, children, name }: { head: React.ReactNode; children: React.ReactNode; name: string }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="border-b border-line last:border-b-0">
      <div className={cn("grid items-center gap-x-3 px-5 py-3.5", AFFILIATE_COLS)}>
        {head}
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={`${open ? "Hide" : "Show"} details of ${name}`}
          className="flex size-8 items-center justify-center rounded-lg text-ink-3 hover:bg-surface-2 hover:text-ink"
        >
          <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
        </button>
      </div>
      {open && <div className="border-t border-line bg-surface-2/50 px-5 py-4">{children}</div>}
    </li>
  );
}
