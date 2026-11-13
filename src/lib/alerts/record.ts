import "server-only";
import { sql as pg } from "@/db";
import { errorSignature } from "./checks";

/** Redirects and "not found" pages are how Next.js steers a visit, not mistakes. */
const NOISE = /^undefined$|NEXT_REDIRECT|NEXT_NOT_FOUND|NEXT_HTTP_ERROR_FALLBACK|ResizeObserver loop|Script error|chrome-extension|moz-extension|Non-Error promise rejection/i;
const recent = new Map<string, { n: number; at: number }>();

/** Remembers one error. Never throws (a broken error log must not break a page), and ignores a mistake that repeats more than 30 times a minute. */
export async function recordError(e: { source: "server" | "browser"; route?: string | null; message: string; stack?: string | null }): Promise<void> {
  try {
    const message = String(e.message ?? "").slice(0, 800);
    if (!message || NOISE.test(message) || NOISE.test(e.stack ?? "")) return;
    const route = e.route ? e.route.split("?")[0].slice(0, 200) : null;
    const signature = errorSignature(e.source, route, message);
    const now = Date.now();
    const r = recent.get(signature);
    if (r && now - r.at < 60_000) { if (++r.n > 30) return; } else recent.set(signature, { n: 1, at: now });
    if (recent.size > 500) recent.clear();
    await pg`insert into app_error_log (signature, source, route, message, stack) values (${signature}, ${e.source}, ${route}, ${message}, ${e.stack ? String(e.stack).slice(0, 3000) : null})`;
  } catch { /* the error log is a helper only */ }
}
