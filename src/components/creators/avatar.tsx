import { cn } from "@/lib/utils";

const TONES = ["#264482", "#2f7d6d", "#a8602a", "#6f4a9e", "#2b78a8", "#a03a52", "#5b7a2a"];

/** A round badge with the creator's initials – the colour is fixed per name so a creator always looks the same. */
export function Avatar({ name, size = 40, className }: { name: string; size?: number; className?: string }) {
  const letters = (name.replace(/[^a-z0-9]/gi, "").slice(0, 2) || "?").toUpperCase();
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white select-none", className)}
      style={{ width: size, height: size, background: TONES[h % TONES.length], fontSize: Math.round(size * 0.38) }}
    >
      {letters}
    </span>
  );
}
