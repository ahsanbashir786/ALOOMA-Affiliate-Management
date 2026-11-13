"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { markAllAlertsSeen } from "@/app/actions/alerts";

/** The bell in the top bar. Clicking it opens System Alerts and clears the number on it. */
export function AlertBell({ unseen, worst }: { unseen: number; worst: "critical" | "warning" | "info" | null }) {
  const router = useRouter();
  const [cleared, setCleared] = useState(false);
  const count = cleared ? 0 : unseen;
  return (
    <button type="button" aria-label={count ? `${count} system alert${count === 1 ? "" : "s"}` : "System alerts"} data-testid="alert-bell"
      onClick={() => {
        setCleared(true);
        router.push("/settings?tab=alerts");
        markAllAlertsSeen().then(() => router.refresh()).catch(() => setCleared(false));
      }}
      className="relative flex size-9 items-center justify-center rounded-lg border border-line-strong bg-surface text-ink-2 hover:bg-surface-2">
      <Bell className="size-[18px]" />
      {count > 0 && <span data-testid="alert-bell-count" className={`absolute -top-1.5 -right-1.5 flex min-w-[18px] items-center justify-center rounded-full px-1 text-[11px] leading-[18px] font-semibold text-white ${worst === "critical" ? "bg-critical" : "bg-warn"}`}>{count > 9 ? "9+" : count}</span>}
    </button>
  );
}
