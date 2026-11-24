"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const EVENT = "app:navigate";
/** Call just before a programmatic router.push/replace (date picker, filters), so the bar and the fade show at once. */
export function startNav(href: string) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EVENT, { detail: href }));
}

/** A thin bar at the top as soon as a menu or link is clicked, until the new screen has opened. A screen that takes a moment never looks frozen. */
function Bar() {
  const path = usePathname();
  const q = useSearchParams().toString();
  const here = `${path}?${q}`;
  const [click, setClick] = useState<{ href: string; from: string } | null>(null);
  // The new screen has arrived when the address is no longer the one the click came from.
  const pending = click && click.from === here ? click.href : null;
  useEffect(() => {
    const click = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const href = a.getAttribute("href") ?? "";
      if (!href.startsWith("/") || href.startsWith("//") || href.startsWith("/api/")) return;
      const u = new URL(href, window.location.origin);
      if (`${u.pathname}?${u.searchParams.toString()}` === here) return; // same screen: nothing will load
      setClick({ href, from: here });
    };
    const manual = (e: Event) => {
      const href = String((e as CustomEvent<string>).detail ?? "");
      const u = new URL(href || "/", window.location.origin);
      if (`${u.pathname}?${u.searchParams.toString()}` !== here) setClick({ href, from: here });
    };
    document.addEventListener("click", click, true);
    window.addEventListener(EVENT, manual);
    return () => { document.removeEventListener("click", click, true); window.removeEventListener(EVENT, manual); };
  }, [here]);
  // While the next screen is on its way, the current one fades a little: it is clearly busy, never frozen.
  useEffect(() => {
    if (pending) document.body.setAttribute("data-nav-pending", "1"); else document.body.removeAttribute("data-nav-pending");
  }, [pending]);
  // Never leave the bar up for ever.
  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => setClick(null), 20_000);
    return () => clearTimeout(t);
  }, [pending]);
  return pending ? <div key={pending} className="nav-progress" role="progressbar" aria-label="Opening" data-testid="nav-progress" /> : null;
}

export function NavProgress() {
  return <Suspense fallback={null}><Bar /></Suspense>;
}
