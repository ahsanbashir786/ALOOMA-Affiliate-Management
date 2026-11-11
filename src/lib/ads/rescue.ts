import "server-only";
import { sql } from "drizzle-orm";
import { rows } from "@/lib/sql";
import { vault } from "./vault";

// Authorization Rescue: videos that sold in ads, but TikTok says the creator must authorize them again. GMV Max cannot use them until then.

export type RescueVideo = { creativeId: string; title: string | null; orders: number; revenue: number; roi: number | null; lastSpend: string | null; postedOn: string | null; productLabel: string };
export type RescueCreator = { creator: string; videos: RescueVideo[]; orders: number; revenue: number; cost: number; roi: number | null; askedAt: string | null; askedBy: string | null };
export type RescueData = { creators: RescueCreator[]; totalVideos: number; totalOrders: number; totalRevenue: number; unknownCreatorVideos: number };

export const UNKNOWN_CREATOR = "Creator not known";

export async function rescueData(): Promise<RescueData> {
  const v = await vault();
  const asks = await rows<{ creator: string; at: Date; by: string | null }>(sql`select distinct on (creator) creator, asked_at as at, asked_by as by from ads_auth_asks order by creator, asked_at desc`);
  const askBy = new Map(asks.map((a) => [a.creator, a]));
  const m = new Map<string, RescueCreator>();
  for (const x of v.videos) {
    if (x.group !== "rescue") continue;
    const name = x.creator ?? UNKNOWN_CREATOR;
    const c = m.get(name) ?? { creator: name, videos: [], orders: 0, revenue: 0, cost: 0, roi: null, askedAt: null, askedBy: null };
    c.videos.push({ creativeId: x.creativeId, title: x.title, orders: x.orders, revenue: x.revenue, roi: x.roi, lastSpend: x.lastSpend, postedOn: x.postedOn, productLabel: x.productLabel });
    c.orders += x.orders; c.revenue += x.revenue; c.cost += x.cost;
    m.set(name, c);
  }
  const creators = [...m.values()].map((c) => {
    const a = askBy.get(c.creator);
    return { ...c, roi: c.cost > 0 ? c.revenue / c.cost : null, askedAt: a ? new Date(a.at).toISOString() : null, askedBy: a?.by ?? null, videos: c.videos.sort((p, q) => q.revenue - p.revenue) };
  }).sort((a, b) => b.revenue - a.revenue);
  return {
    creators, totalVideos: creators.reduce((a, c) => a + c.videos.length, 0), totalOrders: creators.reduce((a, c) => a + c.orders, 0), totalRevenue: creators.reduce((a, c) => a + c.revenue, 0),
    unknownCreatorVideos: m.get(UNKNOWN_CREATOR)?.videos.length ?? 0,
  };
}
