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

/** A product name that opens the product in the same side panel. */
export function OpenProductButton({ pkey, label, className }: { pkey: string; label: string; className?: string }) {
  const { openProduct } = useCreatorPanel();
  return <button type="button" onClick={() => openProduct(pkey)} className={className} title="Open product details" data-open-product={pkey}>{label}</button>;
}

/** A video title that opens the video in the same side panel. */
export function OpenVideoButton({ id, label, className, title }: { id: string; label: string; className?: string; title?: string }) {
  const { openVideo } = useCreatorPanel();
  return <button type="button" onClick={() => openVideo(id)} className={className} title={title ?? "Open video details"} data-open-video={id}>{label}</button>;
}
