"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronsLeft, ChevronsRight, X } from "lucide-react";
import { cn, initials } from "@/lib/utils";
import { NAV, type NavItem } from "./nav";

type Props = {
  role: "admin" | "manager" | "viewer";
  user: { name: string; email: string };
  openActions: number;
  sync: { label: string; ok: boolean };
  open: boolean;
  onClose: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
};

const RANK = { viewer: 1, manager: 2, admin: 3 } as const;
const ROLE_LABEL = { admin: "Admin", manager: "Affiliate manager", viewer: "Viewer" } as const;

export function Sidebar({ role, user, openActions, sync, open, onClose, collapsed, onToggleCollapsed }: Props) {
  const pathname = usePathname();
  const sp = useSearchParams();

  // Carry the selected period across pages.
  const carry = new URLSearchParams();
  for (const k of ["range", "from", "to"]) {
    const v = sp.get(k);
    if (v) carry.set(k, v);
  }
  const qs = carry.toString();
  const isActive = (item: NavItem) => {
    if (item.exact) return pathname === item.href;
    if (item.href === "/") return pathname === "/";
    // "/affiliates" must not light up on its own sub-pages that have their own entry.
    if (item.href === "/affiliates") return pathname === "/affiliates";
    return pathname === item.href || pathname.startsWith(item.href + "/") || !!item.also?.some((p) => pathname.startsWith(p));
  };
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
          <Link href="/" className="flex items-center" onClick={onClose} aria-label="ALOOMA home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/alooma-logo.jpg" alt="ALOOMA" width={118} height={29} className={cn("h-[29px] w-[118px] rounded-md object-cover", rail && "lg:h-8 lg:w-8 lg:object-left")} />
          </Link>
          <button className="rounded-md p-1 text-ink-3 lg:hidden" onClick={onClose} aria-label="Close">
            <X className="size-5" />
          </button>
        </div>

        <nav className={cn("flex-1 overflow-y-auto px-3 py-3", rail && "lg:px-2")}>
          {NAV.map((group, gi) => {
            const items = group.items.filter((i) => !i.min || RANK[role] >= RANK[i.min]);
            if (!items.length) return null;
            const inside = items.some(isActive);
            const list = (
              <ul className="space-y-0.5">
                {items.map((item) => {
                  const active = isActive(item);
                  const Icon = item.icon;
                  const href = item.usesPeriod && qs ? `${item.href}?${qs}` : item.href;
                  return (
                    <li key={item.href}>
                      <Link
                        href={href}
                        onClick={onClose}
                        title={rail ? item.label : undefined}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[14.5px] font-medium transition-colors",
                          rail && "lg:justify-center lg:px-0",
                          active ? "bg-brand-soft text-brand-strong" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                        )}
                      >
                        {active && <span aria-hidden className="absolute top-1.5 bottom-1.5 -left-3 w-[3px] rounded-r-full bg-brand lg:-left-3" />}
                        <Icon className={cn("size-[18px] shrink-0", active ? "text-brand" : "text-ink-3 group-hover:text-ink-2")} />
                        <span className={cn("flex-1 truncate", rail && "lg:hidden")}>{item.label}</span>
                        {item.badge === "actions" && openActions > 0 && (
                          <span className={cn("tnum rounded-full bg-brand px-2 py-px text-[11.5px] font-semibold text-white", rail && "lg:absolute lg:top-0.5 lg:right-2 lg:px-1.5 lg:text-[10px]")}>{openActions > 99 ? "99+" : openActions}</span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            );
            const heading = <span className={cn(rail && "lg:hidden")}>{group.label}</span>;
            return group.collapsible ? (
              <details key={group.label} open={inside} className={cn("group/nav mt-3", rail && "lg:[&:not([open])]:hidden")}>
                <summary className="flex cursor-pointer list-none items-center justify-between rounded-md px-3 py-1.5 text-[11.5px] font-semibold tracking-[0.08em] text-ink-3 uppercase hover:text-ink [&::-webkit-details-marker]:hidden">
                  {heading}
                  <ChevronDown className={cn("size-3.5 transition-transform group-open/nav:rotate-180", rail && "lg:hidden")} aria-hidden />
                </summary>
                <div className="mt-1">{list}</div>
              </details>
            ) : (
              <div key={group.label} className={cn(gi > 0 && "mt-3")}>
                <p className={cn("px-3 pb-1.5 text-[11.5px] font-semibold tracking-[0.08em] text-ink-3 uppercase", rail && "lg:hidden")}>{group.label}</p>
                {rail && gi > 0 && <div className="mx-3 mb-2 hidden border-t border-line lg:block" />}
                {list}
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
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand text-[12px] font-semibold text-white" title={rail ? `${user.name} · ${ROLE_LABEL[role]}` : undefined}>{initials(user.name)}</span>
            <span className={cn("min-w-0 flex-1", rail && "lg:hidden")}>
              <span className="block truncate text-[13.5px] font-medium text-ink">{user.name}</span>
              <span className="block truncate text-[12px] text-ink-3">{ROLE_LABEL[role]}</span>
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
