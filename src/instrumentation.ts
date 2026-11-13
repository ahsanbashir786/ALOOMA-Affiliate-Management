// Runs once when the server starts. Starts the hourly TikTok sync (does nothing until TikTok is connected).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduler } = await import("@/lib/tiktok/scheduler");
    startScheduler();
    // Count the network traffic for the Storage page: a reading every 10 minutes, so a restart loses very little.
    const { sampleNetwork } = await import("@/lib/storage/server");
    const tick = () => { sampleNetwork().catch(() => {}); };
    setTimeout(tick, 15_000);
    setInterval(tick, 10 * 60_000).unref?.();
  }
}
