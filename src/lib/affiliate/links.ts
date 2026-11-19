import "server-only";
import { loadCreatorRows } from "@/lib/creators/load";
import { analyseProducts } from "@/lib/products/analysis";
import { loadContent, type VideoRow } from "./content-load";
import { CLASSES } from "./content";

/** The small facts the linked side panels show. One place, so creator, product and video panels always agree. */
export type VideoMini = { id: string; title: string | null; creator: string | null; pk: string | null; product: string; postedOn: string | null; ageDays: number | null; s14: number; p14: number; s28: number; total: number; cls: string; ads: string | null };
export type ProductCard = { key: string; name: string; tag: string; fragile: boolean | null; sales: { now: number; prev: number }; creators: number; videos: number | null; topCreators: { username: string; gmv28: number; prev28: number }[]; topVideos: VideoMini[] };
export type CreatorLinks = { username: string; products: { pid: string; name: string; gmv28: number; gmv: number }[]; videos: VideoMini[] };

const label = (c: string) => CLASSES.find((x) => x.key === c)?.label ?? (c === "steady" ? "Selling Steadily" : "Small");
const mini = (v: VideoRow): VideoMini => ({ id: v.id, title: v.title, creator: v.creator, pk: v.pk, product: v.product, postedOn: v.postedOn, ageDays: v.ageDays, s14: v.s14, p14: v.p14, s28: v.s28, total: v.total, cls: label(v.cls), ads: v.ads ? (v.ads.boosted ? "Boosting Now" : v.ads.label) : null });

async function allVideos(): Promise<VideoMini[]> {
  const c = await loadContent();
  if (!c) return [];
  const seen = new Map<string, VideoMini>();
  for (const l of [c.lists.heating, c.lists.fading, c.lists.stopped, c.lists.ready]) for (const v of l) if (!seen.has(v.id)) seen.set(v.id, mini(v));
  return [...seen.values()];
}

export async function productCard(key: string): Promise<ProductCard | null> {
  const [a, { all }, vids] = await Promise.all([analyseProducts(), loadCreatorRows(), allVideos()]);
  const p = a.products.find((x) => x.key === key);
  if (!p) return null;
  const top = all.flatMap((r) => r.allLines.filter((l) => l.pid === key && l.gmv28 > 0).map((l) => ({ username: r.username, gmv28: l.gmv28, prev28: l.prev28 }))).sort((x, y) => y.gmv28 - x.gmv28).slice(0, 8);
  const topVideos = vids.filter((v) => v.pk === key).sort((x, y) => y.s28 - x.s28).slice(0, 6);
  return { key, name: p.name, tag: p.diagnosis.tag, fragile: p.diagnosis.fragile, sales: { now: p.metrics.sales.now, prev: p.metrics.sales.prev }, creators: p.metrics.creators.now, videos: p.metrics.videosPosted.now, topCreators: top, topVideos };
}

export async function videoCard(id: string): Promise<VideoMini | null> {
  return (await allVideos()).find((v) => v.id === id) ?? null;
}

export async function creatorLinks(username: string): Promise<CreatorLinks | null> {
  const [{ all }, vids] = await Promise.all([loadCreatorRows(), allVideos()]);
  const r = all.find((x) => x.username === username);
  if (!r) return null;
  const products = r.allLines.filter((l) => l.pid && !l.noSample || (l.pid && l.gmv > 0)).map((l) => ({ pid: l.pid!, name: l.name, gmv28: l.gmv28, gmv: l.gmv })).sort((x, y) => y.gmv28 - x.gmv28 || y.gmv - x.gmv);
  const videos = vids.filter((v) => v.creator === username).sort((x, y) => y.s28 - x.s28).slice(0, 6);
  return { username, products, videos };
}
