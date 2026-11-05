"use client";

import { useState, useTransition } from "react";
import { UserRound } from "lucide-react";
import { assignOwner } from "@/app/actions/creators";
import { cn } from "@/lib/utils";

export type Staff = { id: string; name: string };

/** Who looks after this creator. Everyone sees the name; managers can change it (saved at once). */
export function OwnerPicker({ username, ownerId, staff, canAct, className }: { username: string; ownerId: string | null; staff: Staff[]; canAct: boolean; className?: string }) {
  // What we show while saving; once saved the page sends the new owner and this steps aside.
  const [local, setLocal] = useState<string | null>(null);
  const value = local ?? ownerId ?? "";
  const [pending, start] = useTransition();
  const [err, setErr] = useState("");
  const name = staff.find((s) => s.id === value)?.name;
  if (!canAct) {
    return <span className={cn("inline-flex items-center gap-1 text-[12.5px]", name ? "text-ink-2" : "text-ink-3", className)}><UserRound className="size-3.5" />{name ?? "Unassigned"}</span>;
  }
  return (
    <span className={cn("inline-flex flex-col", className)}>
      <label className={cn("relative inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[12.5px]", name ? "border-line-strong bg-surface text-ink-2" : "border-dashed border-line-strong text-ink-3", pending && "opacity-60")}>
        <UserRound className="size-3.5" />
        <select
          aria-label={`Owner of @${username}`}
          value={value}
          disabled={pending}
          onChange={(e) => {
            const v = e.target.value;
            setLocal(v);
            setErr("");
            start(async () => {
              const r = await assignOwner(username, v || null);
              if (r.error) setErr(r.error);
              setLocal(null);
            });
          }}
          className="max-w-[120px] cursor-pointer appearance-none truncate bg-transparent pr-1 outline-none"
        >
          <option value="">Unassigned</option>
          {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
      {err && <span className="text-[12px] text-critical">{err}</span>}
    </span>
  );
}
