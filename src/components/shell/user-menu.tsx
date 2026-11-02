"use client";

import { useEffect, useRef, useState } from "react";
import { LogOut } from "lucide-react";
import { logout } from "@/app/actions/auth";
import { initials } from "@/lib/utils";

const ROLE_LABEL = { admin: "Admin", manager: "Affiliate manager", viewer: "Viewer" } as const;

export function UserMenu({
  name,
  email,
  role,
}: {
  name: string;
  email: string;
  role: keyof typeof ROLE_LABEL;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Account menu"
        className="flex size-9 items-center justify-center rounded-full bg-brand-soft text-[13px] font-semibold text-brand-strong"
      >
        {initials(name)}
      </button>
      {open && (
        <div className="absolute top-11 right-0 z-50 w-64 rounded-xl border border-line bg-surface p-2 shadow-pop">
          <div className="px-3 py-2">
            <p className="text-[14px] font-semibold text-ink">{name}</p>
            <p className="truncate text-[13px] text-ink-3">{email}</p>
            <p className="mt-1.5 inline-block rounded-full bg-surface-2 px-2 py-0.5 text-[12px] font-medium text-ink-2">
              {ROLE_LABEL[role]}
            </p>
          </div>
          <form action={logout} className="mt-1 border-t border-line pt-1">
            <button
              type="submit"
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[14px] text-ink hover:bg-surface-2"
            >
              <LogOut className="size-4 text-ink-3" /> Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
