import "server-only";
import { cache } from "react";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { rows } from "./sql";

export type Thresholds = {
  /** Posting cadence the team wants from a selling creator (shoppable videos per week). */
  targetVideosPerWeek: number;
  /** Net GMV (per 28 days) below which a creator isn't considered a "seller". */
  minSellerGmv: number;
  /** Top share of sellers (by GMV) treated as stars, e.g. 0.1 = top 10%. */
  starTopShare: number;
  /** Percentile of seller GMV above which output is "strong" enough to ask for more content. */
  strongPercentile: number;
  /** GMV drop vs previous period that flags a creator as slipping (0.35 = −35%). */
  declineThreshold: number;
  /** GMV growth vs previous period that flags a rising creator. */
  growthThreshold: number;
  /** Share of a creator's historic per-video yield expected from a new video. */
  upliftHaircut: number;
  /** Weeks over which the extra-video uplift is estimated. */
  upliftWeeks: number;
  /** Views needed before we judge a creator's conversion. */
  lowConversionMinViews: number;
  /** Followers above which a non-seller is "untapped reach". */
  untappedMinFollowers: number;
  /** Cancellation rate above which COD/quality is flagged. */
  highCancelRate: number;
};

export const DEFAULT_THRESHOLDS: Thresholds = {
  targetVideosPerWeek: 1,
  minSellerGmv: 300,
  starTopShare: 0.1,
  strongPercentile: 0.7,
  declineThreshold: 0.35,
  growthThreshold: 0.5,
  upliftHaircut: 0.5,
  upliftWeeks: 4,
  lowConversionMinViews: 20000,
  untappedMinFollowers: 20000,
  highCancelRate: 0.2,
};

export const getThresholds = cache(async (): Promise<Thresholds> => {
  const [row] = await db.select().from(settings).where(eq(settings.key, "thresholds"));
  return { ...DEFAULT_THRESHOLDS, ...((row?.value as Partial<Thresholds>) ?? {}) };
});

/**
 * Brand-owned accounts (e.g. the shop's own LIVE account). They appear as a
 * "creator" in shop orders but aren't affiliates. Configurable in settings;
 * otherwise auto-detected as the handle with LIVE orders that no affiliate owns.
 */
export const getOwnAccounts = cache(async (): Promise<string[]> => {
  const [row] = await db.select().from(settings).where(eq(settings.key, "own_accounts"));
  if (row && Array.isArray(row.value)) return row.value as string[];
  const found = await rows<{ creator: string }>(sql`
    select s.creator
    from shop_order_lines s
    where s.order_channel = 'LIVE' and s.creator is not null
      and not exists (select 1 from order_lines a where a.order_id = s.order_id and a.sku_id = s.sku_id)
    group by s.creator
    having count(*) >= 20
    order by count(*) desc
    limit 3`);
  return found.map((r) => r.creator);
});
