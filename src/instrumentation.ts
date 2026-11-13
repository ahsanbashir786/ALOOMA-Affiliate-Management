// Runs once when the server starts. Starts the hourly TikTok sync (does nothing until TikTok is connected), the network counter,
// and the system alert checks (a server reading and a check every 2 minutes).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduler } = await import("@/lib/tiktok/scheduler");
    startScheduler();
    // Count the network traffic for the Storage page: a reading every 10 minutes, so a restart loses very little.
    const { sampleNetwork } = await import("@/lib/storage/server");
    const tick = () => { sampleNetwork().catch(() => {}); };
    setTimeout(tick, 15_000);
    setInterval(tick, 10 * 60_000).unref?.();
    const { sampleServer } = await import("@/lib/alerts/sampler");
    const { evaluateAlerts } = await import("@/lib/alerts/evaluate");
    const alertTick = () => { sampleServer().then(() => evaluateAlerts(true)).catch(() => {}); };
    setTimeout(alertTick, 30_000);
    setInterval(alertTick, 2 * 60_000).unref?.();
    // Keep the heavy screens (Affiliate Data, Product Analysis, Profit And Loss, GMV Max) ready in memory, so opening them is instant even right after a sync or a restart.
    const warm = async () => {
      try {
        const { loadCreatorRows } = await import("@/lib/creators/load");
        const { analyseProducts } = await import("@/lib/products/analysis");
        await loadCreatorRows(); await analyseProducts();
        const { loadProfit } = await import("@/lib/profit/data");
        const { vault } = await import("@/lib/ads/vault");
        await loadProfit(); await vault();
      } catch { /* a warm-up failure only means the first visit is slower */ }
    };
    setTimeout(warm, 45_000);
    setInterval(warm, 90_000).unref?.();
  }
}

/** Next.js calls this for every error in a page, route or action. It is saved for Settings → System Alerts. It must never throw. */
export async function onRequestError(err: unknown, request: { path: string; method: string }, context: { routePath?: string }) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { recordError } = await import("@/lib/alerts/record");
    const e = err as { message?: string; stack?: string; digest?: string };
    await recordError({ source: "server", route: context?.routePath || request.path, message: e?.message ?? String(err), stack: e?.stack ?? null });
  } catch { /* never break a request because of the error log */ }
}
