"use client";

import { useCreatorPanel } from "./creator-panel";

/** The creator's name as a button that opens the side panel. */
export function OpenPanelButton({ username, className, label }: { username: string; className?: string; label?: string }) {
  const { open } = useCreatorPanel();
  return (
    <button type="button" onClick={() => open(username)} className={className} title="Open details">
      {label ?? `@${username}`}
    </button>
  );
}
