/**
 * The address the person's browser used (https://app.example.com), not the one the app sees inside Docker (0.0.0.0:3000).
 * Behind Caddy the real host and scheme arrive in the X-Forwarded headers.
 */
export function publicUrl(path: string, request: Request): URL {
  const h = request.headers;
  const own = new URL(request.url);
  const host = h.get("x-forwarded-host")?.split(",")[0].trim() || h.get("host") || own.host;
  const proto = h.get("x-forwarded-proto")?.split(",")[0].trim() || own.protocol.replace(":", "");
  return new URL(path, `${proto}://${host}`);
}
