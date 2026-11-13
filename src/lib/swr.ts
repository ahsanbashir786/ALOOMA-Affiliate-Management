import "server-only";

type Entry<T> = { local: string; sync: string; at: number; value: T; refreshing?: Promise<void> };

/**
 * Keeps a slow result in memory so moving between screens is instant.
 * - `local` changes when someone in the team does something (assigns, ticks, notes): the result is rebuilt before the page is shown.
 * - `sync` changes when new TikTok data arrives: the page shows the previous result straight away and a fresh one is built in the background.
 */
export async function swr<T>(cache: Map<string, Entry<T>>, key: string, stamp: { local: string; sync: string }, compute: () => Promise<T>, maxAgeMs = 15 * 60_000): Promise<T> {
  if (process.env.SWR_OFF === "1") return compute(); // tests: always build fresh
  const hit = cache.get(key);
  const build = async () => { const value = await compute(); if (cache.size > 12) cache.clear(); cache.set(key, { local: stamp.local, sync: stamp.sync, at: Date.now(), value }); return value; };
  if (!hit || hit.local !== stamp.local) return build();
  if (hit.sync !== stamp.sync || Date.now() - hit.at > maxAgeMs) {
    if (!hit.refreshing) hit.refreshing = build().then(() => undefined, () => { hit.refreshing = undefined; });
  }
  return hit.value;
}
