"use client";

import { Suspense, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Menu } from "lucide-react";
import { computePeriod } from "@/lib/period-core";
import { Sidebar } from "./sidebar";
import { PeriodPicker } from "./period-picker";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

const NO_PERIOD = ["/data", "/settings", "/actions"];

export function AppShell({
  user,
  openActions,
  bounds,
  children,
}: {
  user: { name: string; email: string; role: "admin" | "manager" | "viewer" };
  openActions: number;
  bounds: { min: string; max: string; hasData: boolean };
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const sp = useSearchParams();
  const period = computePeriod(bounds, {
    range: sp.get("range"),
    from: sp.get("from"),
    to: sp.get("to"),
  });
  const showPeriod = !NO_PERIOD.some((p) => pathname.startsWith(p));

  return (
    <div className="min-h-screen">
      <Suspense fallback={null}>
        <Sidebar role={user.role} openActions={openActions} open={open} onClose={() => setOpen(false)} />
      </Suspense>
      <div className="lg:pl-[248px]">
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
            <ThemeToggle />
            <UserMenu name={user.name} email={user.email} role={user.role} />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1400px] px-4 py-7 sm:px-8">{children}</main>
      </div>
    </div>
  );
}
