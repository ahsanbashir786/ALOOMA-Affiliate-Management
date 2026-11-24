"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { startNav } from "@/components/shell/nav-progress";

/** A small dropdown that keeps one choice in the address (for example ?mprod=quilt), so the server filters the list. */
export function ProductPick({ options, value, param, label }: { options: (readonly [string, string])[]; value: string; param: string; label: string }) {
  const router = useRouter(), path = usePathname(), params = useSearchParams();
  return (
    <select aria-label={label} value={value} data-testid={`pick-${param}`}
      onChange={(e) => {
        const next = new URLSearchParams(params.toString());
        if (e.target.value) next.set(param, e.target.value); else next.delete(param);
        next.delete("mp");
        const to = `${path}${next.toString() ? `?${next}` : ""}`;
        startNav(to); router.replace(to, { scroll: false });
      }}
      className="h-9 max-w-60 rounded-lg border border-line-strong bg-surface px-2.5 text-[13.5px] text-ink">
      <option value="">{label}: any</option>
      {options.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
    </select>
  );
}
