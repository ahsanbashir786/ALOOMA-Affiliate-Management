"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsLeft, ChevronsRight, Lock, X } from "lucide-react";
import { can } from "@/lib/can";
import type { PermissionKey } from "@/lib/permissions";
import { cn, initials } from "@/lib/utils";
import { NAV, navAllowed, type NavItem } from "./nav";

type Props = {
  user: { name: string; email: string; roleName: string; isAdmin: boolean; permissions: PermissionKey[] };
  sync: { label: string; ok: boolean };
  open: boolean;
  onClose: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
};


export function Sidebar({ user, sync, open, onClose, collapsed, onToggleCollapsed }: Props) {
  const pathname = usePathname();
  const isActive = (item: NavItem) => pathname === item.href || pathname.startsWith(item.href + "/");
  // On phones the menu is always the full one.
  const rail = collapsed;

  return (
    <>
      {open && <button aria-label="Close menu" className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={onClose} />}
      <aside
        aria-label="Main menu"
        data-collapsed={rail ? "true" : "false"}
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[256px] flex-col border-r border-line bg-surface transition-[transform,width] duration-200 lg:translate-x-0",
          rail && "lg:w-[76px]",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className={cn("flex h-16 shrink-0 items-center justify-between border-b border-line px-5", rail && "lg:justify-center lg:px-0")}>
          <Link href="/execution" className="flex items-center" onClick={onClose} aria-label="ALOOMA home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/alooma-logo.jpg" alt="ALOOMA" width={118} height={29} className={cn("h-[29px] w-[118px] rounded-md object-cover", rail && "lg:h-8 lg:w-8 lg:object-left")} />
          </Link>
          <button className="rounded-md p-1 text-ink-3 lg:hidden" onClick={onClose} aria-label="Close">
            <X className="size-5" />
          </button>
        </div>

        <nav className={cn("flex-1 overflow-y-auto px-3 py-3", rail && "lg:px-2")}>
          {NAV.map((group, gi) => {
            const items = group.items;
            return (
              <div key={group.label} className={cn(gi > 0 && "mt-3")}>
                <p className={cn("px-3 pb-1.5 text-[11.5px] font-semibold tracking-[0.08em] text-ink-3 uppercase", rail && "lg:hidden")}>{group.label}</p>
                {rail && gi > 0 && <div className="mx-3 mb-2 hidden border-t border-line lg:block" />}
                <ul className="space-y-0.5">
                  {items.map((item) => {
                    const active = isActive(item);
                    const Icon = item.icon;
                    const allowed = navAllowed(user, item);
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={onClose}
                          title={rail ? item.label : allowed ? undefined : "Your role cannot open this"}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[14.5px] font-medium transition-colors",
                            rail && "lg:justify-center lg:px-0",
                            active ? "bg-brand-soft text-brand-strong" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                            !allowed && !active && "text-ink-3",
                          )}
                        >
                          {active && <span aria-hidden className="absolute top-1.5 bottom-1.5 -left-3 w-[3px] rounded-r-full bg-brand lg:-left-3" />}
                          <Icon className={cn("size-[18px] shrink-0", active ? "text-brand" : "text-ink-3 group-hover:text-ink-2")} />
                          <span className={cn("flex-1 truncate", rail && "lg:hidden")}>{item.label}</span>
                          {!allowed && <Lock data-testid="nav-lock" aria-label="Locked for your role" className={cn("size-3.5 shrink-0 text-ink-3", rail && "lg:absolute lg:top-1 lg:right-2 lg:size-3")} />}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>

        <div className="shrink-0 border-t border-line p-3">
          <Link
            href="/sync"
            onClick={onClose}
            title={rail ? sync.label : undefined}
            className={cn("mb-2 flex items-center gap-2 rounded-lg px-3 py-1.5 text-[12.5px] text-ink-3 hover:bg-surface-2 hover:text-ink", rail && "lg:justify-center lg:px-0")}
          >
            <span className={cn("size-2 shrink-0 rounded-full", sync.ok ? "bg-good" : "bg-warn")} />
            <span className={cn("truncate", rail && "lg:hidden")}>{sync.label}</span>
          </Link>
          <div className={cn("flex items-center gap-2.5 rounded-lg bg-surface-2 p-2", rail && "lg:justify-center lg:bg-transparent")}>
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand text-[12px] font-semibold text-white" title={rail ? `${user.name} · ${user.roleName}` : undefined}>{initials(user.name)}</span>
            <span className={cn("min-w-0 flex-1", rail && "lg:hidden")}>
              <span className="block truncate text-[13.5px] font-medium text-ink">{user.name}</span>
              <span className="block truncate text-[12px] text-ink-3">{user.roleName}</span>
            </span>
          </div>
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={rail ? "Expand menu" : "Collapse menu"}
            title={rail ? "Expand menu" : "Collapse menu"}
            className={cn("mt-2 hidden h-8 w-full items-center gap-2 rounded-lg px-3 text-[12.5px] text-ink-3 hover:bg-surface-2 hover:text-ink lg:flex", rail && "justify-center px-0")}
          >
            {rail ? <ChevronsRight className="size-4" /> : <><ChevronsLeft className="size-4" /> Collapse</>}
          </button>
        </div>
      </aside>
    </>
  );
}
