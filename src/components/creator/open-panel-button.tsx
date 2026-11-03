"use client";

import { useCreatorPanel } from "./creator-panel";

/** The creator's name as a button that opens the side panel. */
export function OpenPanelButton({ username, className }: { username: string; className?: string }) {
  const { open } = useCreatorPanel();
  return (
    <button type="button" onClick={() => open(username)} className={className} title="Open details">
      @{username}
    </button>
  );
}
