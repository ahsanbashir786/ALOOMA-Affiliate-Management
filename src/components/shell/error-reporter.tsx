"use client";

import { useEffect } from "react";

/** Sends errors that happen in the browser to the System Alerts log (at most 5 per page load). Invisible. */
export function ErrorReporter() {
  useEffect(() => {
    let sent = 0;
    const send = (message: string, stack?: string) => {
      if (sent >= 5 || !message) return;
      sent++;
      try { void fetch("/api/alerts/client-error", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: message.slice(0, 500), stack: stack?.slice(0, 2000), page: location.pathname }), keepalive: true }); } catch { /* reporting must never break the page */ }
    };
    const onError = (e: ErrorEvent) => send(e.message || String(e.error), e.error?.stack);
    const onRejection = (e: PromiseRejectionEvent) => { const r = e.reason as { message?: string; stack?: string } | string | undefined; send(typeof r === "string" ? r : (r?.message ?? "Unhandled promise rejection"), typeof r === "string" ? undefined : r?.stack); };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => { window.removeEventListener("error", onError); window.removeEventListener("unhandledrejection", onRejection); };
  }, []);
  return null;
}
