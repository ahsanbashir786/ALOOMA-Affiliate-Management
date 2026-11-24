// Runs once when the server starts. Starts the hourly TikTok sync (does nothing until TikTok is connected), the network counter,
// and the system alert checks (a server reading and a check every 2 minutes).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // APP_ROLE splits the work across two containers: "web" answers the screens, "worker" runs the syncs and checks.
    // Without it (one container, or local development) this process does both.
    const role = process.env.APP_ROLE === "web" || process.env.APP_ROLE === "worker" ? process.env.APP_ROLE : "all";
    const background = role !== "web", screens = role !== "worker";
    if (background) {
      const { startScheduler } = await import("@/lib/tiktok/scheduler");
      startScheduler();
    }
    // Count the network traffic for the Storage page: a reading every 10 minutes, so a restart loses very little.
    if (screens) {
      const { sampleNetwork } = await import("@/lib/storage/server");
      const tick = () => { sampleNetwork().catch(() => {}); };
      setTimeout(tick, 15_000);
      setInterval(tick, 10 * 60_000).unref?.();
    }
    const { sampleServer } = await import("@/lib/alerts/sampler");
    const { evaluateAlerts } = await import("@/lib/alerts/evaluate");
    const alertTick = () => { sampleServer().then(() => evaluateAlerts(true)).catch(() => {}); };
    // The alert checks measure how responsive the screens are, so they run next to the screens.
    if (screens) {
      setTimeout(alertTick, 30_000);
      setInterval(alertTick, 2 * 60_000).unref?.();
    }
    // Keep the heavy screens (Creators, Products, Profit And Loss, GMV Max) ready in memory, so opening them is instant even right after a sync or a restart.
    // It rebuilds only when new data has arrived (a cheap check every 2 minutes), not on a timer: an idle server stays idle.
    let warmedFor: string | null = null, warming = false;
    const warm = async () => {
      if (warming) return;
      try {
        const { syncStamp } = await import("@/lib/data-stamp");
        const stamp = await syncStamp();
        if (stamp === warmedFor) return;
        warming = true;
        const { loadCreatorRows } = await import("@/lib/creators/load");
        const { analyseProducts } = await import("@/lib/products/analysis");
        await loadCreatorRows(); await analyseProducts();
        const { loadProfit } = await import("@/lib/profit/data");
        const { vault } = await import("@/lib/ads/vault");
        await loadProfit(); await vault();
        warmedFor = stamp;
      } catch { /* a warm-up failure only means the first visit is slower */ } finally { warming = false; }
    };
    if (screens) {
      setTimeout(warm, 45_000);
      setInterval(warm, 2 * 60_000).unref?.();
    }
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
