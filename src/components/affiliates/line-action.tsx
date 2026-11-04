"use client";

import { ArrowRight } from "lucide-react";
import { useCreatorPanel } from "@/components/creator/creator-panel";
import { ACTION_HINT, type CreatorAction } from "@/lib/affiliates/status";
import type { DirLine } from "@/lib/workflow/directory";
import { cn } from "@/lib/utils";

const PASSIVE: CreatorAction[] = ["Keep", "Wait"];

/** The action of one product line. Clicking opens the creator panel on that action: message, then record what happened. */
export function LineAction({ username, line }: { username: string; line: DirLine }) {
  const { open } = useCreatorPanel();
  if (PASSIVE.includes(line.action)) {
    return (
      <div>
        <span className="inline-flex rounded-full border border-line px-2.5 py-0.5 text-[13px] font-medium text-ink-3">{line.action}</span>
        <p className="mt-1 text-[12px] leading-snug text-ink-3">{ACTION_HINT[line.action]}</p>
      </div>
    );
  }
  return (
    <div>
      <button
        type="button"
        data-testid={`act-${username}-${line.pid ?? "none"}`}
        onClick={() => open(username, { action: line.action, status: line.status, product: line.noSample ? null : line.name, productId: line.pid, reason: line.reason, videos28: line.videos28, lastVideoLabel: line.lastVideoLabel })}
        title={`${ACTION_HINT[line.action]} – click to do it and record it`}
        className={cn("inline-flex items-center gap-1 rounded-full border border-brand bg-brand/10 px-2.5 py-0.5 text-[13.5px] font-semibold text-brand hover:bg-brand hover:text-white")}
      >
        {line.action} <ArrowRight className="size-3.5" />
      </button>
      <p className="mt-1 text-[12px] leading-snug text-ink-3">{ACTION_HINT[line.action]}</p>
    </div>
  );
}
