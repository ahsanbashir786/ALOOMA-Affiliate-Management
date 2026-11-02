"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV } from "./nav";

type Props = {
  role: "admin" | "manager" | "viewer";
  openActions: number;
  open: boolean;
  onClose: () => void;
};

const RANK = { viewer: 1, manager: 2, admin: 3 } as const;

export function Sidebar({ role, openActions, open, onClose }: Props) {
  const pathname = usePathname();
  const sp = useSearchParams();

  // Carry the selected period across pages.
  const carry = new URLSearchParams();
  for (const k of ["range", "from", "to"]) {
    const v = sp.get(k);
    if (v) carry.set(k, v);
  }
  const qs = carry.toString();

  return (
    <>
      {open && (
        <button
          aria-label="Close menu"
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={onClose}
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col border-r border-line bg-surface transition-transform lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center justify-between px-5">
          <Link href="/" className="flex items-center gap-2.5" onClick={onClose}>
            <span className="flex size-8 items-center justify-center rounded-lg bg-brand text-white">
              <Sparkles className="size-4" />
            </span>
            <span className="text-[16px] font-semibold tracking-tight text-ink">Affiliate HQ</span>
          </Link>
          <button className="rounded-md p-1 text-ink-3 lg:hidden" onClick={onClose} aria-label="Close">
            <X className="size-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-4">
          {NAV.map((group) => {
            const items = group.items.filter((i) => !i.min || RANK[role] >= RANK[i.min]);
            if (!items.length) return null;
            return (
              <div key={group.label} className="mt-5 first:mt-2">
                <p className="px-2 pb-1.5 text-[11px] font-semibold tracking-wider text-ink-3 uppercase">
                  {group.label}
                </p>
                <ul className="space-y-0.5">
                  {items.map((item) => {
                    const active =
                      item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                    const Icon = item.icon;
                    const href = item.usesPeriod && qs ? `${item.href}?${qs}` : item.href;
                    return (
                      <li key={item.href}>
                        <Link
                          href={href}
                          onClick={onClose}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "group flex items-center gap-3 rounded-lg px-2.5 py-2 text-[14px] font-medium transition-colors",
                            active
                              ? "bg-brand-soft text-brand-strong"
                              : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                          )}
                        >
                          <Icon
                            className={cn("size-[18px]", active ? "text-brand" : "text-ink-3 group-hover:text-ink-2")}
                          />
                          <span className="flex-1">{item.label}</span>
                          {item.badge === "actions" && openActions > 0 && (
                            <span className="tnum rounded-full bg-brand px-1.5 py-px text-[11px] font-semibold text-white">
                              {openActions > 99 ? "99+" : openActions}
                            </span>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>
        <p className="border-t border-line px-5 py-3 text-[12px] text-ink-3">
          TikTok Shop affiliate management
        </p>
      </aside>
    </>
  );
}
