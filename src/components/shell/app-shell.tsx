"use client";

import { Suspense, useState, useSyncExternalStore } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Menu } from "lucide-react";
import { computePeriod } from "@/lib/period-core";
import { Sidebar } from "./sidebar";
import { PeriodPicker } from "./period-picker";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";
import { CommandPalette } from "./command-palette";
import { CreatorPanelProvider } from "@/components/creator/creator-panel";

const MENU_KEY = "menu-collapsed";
const subscribeMenu = (cb: () => void) => { window.addEventListener(MENU_KEY, cb); return () => window.removeEventListener(MENU_KEY, cb); };
const readMenu = () => { try { return localStorage.getItem(MENU_KEY) === "1"; } catch { return false; } };
const NO_PERIOD = ["/data", "/settings", "/today", "/progress", "/sync", "/creators", "/products", "/execution"];

export function AppShell({
  user,
  openActions,
  bounds,
  sync,
  children,
}: {
  user: { name: string; email: string; role: "admin" | "manager" | "viewer" };
  openActions: number;
  bounds: { min: string; max: string; hasData: boolean };
  sync: { label: string; ok: boolean };
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  // The desktop menu can shrink to icons; the choice is remembered in this browser (the server always renders it open).
  const collapsed = useSyncExternalStore(subscribeMenu, readMenu, () => false);
  const toggle = () => {
    try { localStorage.setItem(MENU_KEY, collapsed ? "0" : "1"); } catch { /* storage blocked: the choice lasts until reload */ }
    window.dispatchEvent(new Event(MENU_KEY));
  };
  const pathname = usePathname();
  const sp = useSearchParams();
  const period = computePeriod(bounds, {
    // Sample and affiliate pages default to all data; other pages to the last 28 days.
    range: sp.get("range") ?? (pathname.startsWith("/samples") || pathname.startsWith("/affiliates") ? "all" : null),
    from: sp.get("from"),
    to: sp.get("to"),
  });
  const showPeriod = !NO_PERIOD.some((p) => pathname.startsWith(p));

  return (
    <CreatorPanelProvider>
    <div className="min-h-screen">
      <Suspense fallback={null}>
        <Sidebar role={user.role} user={user} openActions={openActions} sync={sync} open={open} onClose={() => setOpen(false)} collapsed={collapsed} onToggleCollapsed={toggle} />
      </Suspense>
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
            {showPeriod && (
              <Suspense fallback={null}>
                <PeriodPicker
                  current={period.key}
                  start={period.start}
                  end={period.end}
                  min={bounds.min}
                  max={bounds.max}
                />
              </Suspense>
            )}
            <CommandPalette />
            <ThemeToggle />
            <UserMenu name={user.name} email={user.email} role={user.role} />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1400px] px-4 py-7 sm:px-8">{children}</main>
      </div>
    </div>
    </CreatorPanelProvider>
  );
}
