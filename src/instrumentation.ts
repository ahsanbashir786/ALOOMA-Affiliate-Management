// Runs once when the server starts. Starts the hourly TikTok sync (does nothing until TikTok is connected).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduler } = await import("@/lib/tiktok/scheduler");
    startScheduler();
  }
}
