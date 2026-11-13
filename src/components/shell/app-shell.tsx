"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Bell, Menu } from "lucide-react";
import { ErrorReporter } from "./error-reporter";
import type { PermissionKey } from "@/lib/permissions";
import { Sidebar } from "./sidebar";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";
import { CommandPalette } from "./command-palette";
import { CreatorPanelProvider } from "@/components/creators/creator-panel";

const MENU_KEY = "menu-collapsed";
const subscribeMenu = (cb: () => void) => { window.addEventListener(MENU_KEY, cb); return () => window.removeEventListener(MENU_KEY, cb); };
const readMenu = () => { try { return localStorage.getItem(MENU_KEY) === "1"; } catch { return false; } };

export function AppShell({
  user,
  sync,
  alerts,
  children,
}: {
  user: { name: string; email: string; roleName: string; isAdmin: boolean; permissions: PermissionKey[] };
  sync: { label: string; ok: boolean };
  alerts?: { unseen: number; worst: "critical" | "warning" | "info" | null } | null;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  // The desktop menu can shrink to icons; the choice is remembered in this browser (the server always renders it open).
  const collapsed = useSyncExternalStore(subscribeMenu, readMenu, () => false);
  const toggle = () => {
    try { localStorage.setItem(MENU_KEY, collapsed ? "0" : "1"); } catch { /* storage blocked: the choice lasts until reload */ }
    window.dispatchEvent(new Event(MENU_KEY));
  };
  return (
    <CreatorPanelProvider>
    <ErrorReporter />
    <div className="min-h-screen">
      <Sidebar user={user} sync={sync} open={open} onClose={() => setOpen(false)} collapsed={collapsed} onToggleCollapsed={toggle} />
      <div className={collapsed ? "transition-[padding] duration-200 lg:pl-[76px]" : "transition-[padding] duration-200 lg:pl-[256px]"}>
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-line bg-app/85 px-4 backdrop-blur sm:px-8">
          <button
            className="flex size-9 items-center justify-center rounded-lg border border-line-strong bg-surface text-ink-2 lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="size-5" />
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-2.5">
            {alerts && (
              <Link href="/settings?tab=alerts" aria-label={alerts.unseen ? `${alerts.unseen} system alert${alerts.unseen === 1 ? "" : "s"}` : "System alerts"} data-testid="alert-bell" className="relative flex size-9 items-center justify-center rounded-lg border border-line-strong bg-surface text-ink-2 hover:bg-surface-2">
                <Bell className="size-[18px]" />
                {alerts.unseen > 0 && <span data-testid="alert-bell-count" className={`absolute -top-1.5 -right-1.5 flex min-w-[18px] items-center justify-center rounded-full px-1 text-[11px] leading-[18px] font-semibold text-white ${alerts.worst === "critical" ? "bg-critical" : "bg-warn"}`}>{alerts.unseen > 9 ? "9+" : alerts.unseen}</span>}
              </Link>
            )}
            <CommandPalette />
            <ThemeToggle />
            <UserMenu name={user.name} email={user.email} role={user.roleName} />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1400px] px-4 py-7 sm:px-8">{children}</main>
      </div>
    </div>
    </CreatorPanelProvider>
  );
}
