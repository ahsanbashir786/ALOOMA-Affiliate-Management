import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { rows } from "@/lib/sql";
import { fetchCreatorProfile, outreachScopes, preferredCategories, saveProfile, searchMarketplace } from "@/lib/tiktok/outreach";
import type { MarketCreator } from "./outreach";

/**
 * Creator Outreach work that should never make a screen wait on TikTok:
 *  - TikTok's suggested creators (Creator Marketplace, in your categories, not invited in 90 days) are fetched in the background and kept,
 *    so the screen always shows the last good list, with its time.
 *  - The level and categories of creators who asked for a sample are checked a few at a time, so the rules can be applied without a button.
 * TikTok shares one speed limit across all calls, so both go slowly and stop at the first "too busy".
 */
const MARKET_KEY = "market_suggestions";
const MARKET_PAGES = 5;
const MARKET_EVERY_MS = 6 * 3600_000;
const PROFILE_DAYS = 30;

export type StoredMarket = { at: number | null; creators: MarketCreator[]; fieldsSeen: string[]; error: string | null; triedAt: number | null };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const busyText = (m: string) => (/too many requests|rate limit/i.test(m) ? "TikTok was busy (it limits how fast the system may ask). The system tries again by itself." : m);

export async function readMarket(): Promise<StoredMarket> {
  const [r] = await db.select().from(settings).where(eq(settings.key, MARKET_KEY));
  const v = r?.value as Partial<StoredMarket> | undefined;
  return { at: v?.at ?? null, creators: v?.creators ?? [], fieldsSeen: v?.fieldsSeen ?? [], error: v?.error ?? null, triedAt: v?.triedAt ?? null };
}
async function saveMarket(v: StoredMarket) {
  await db.insert(settings).values({ key: MARKET_KEY, value: v }).onConflictDoUpdate({ target: settings.key, set: { value: v, updatedAt: new Date() } });
}

let marketRunning: Promise<StoredMarket> | null = null;
/** Asks TikTok for up to five pages of suggested creators in your categories and keeps the answer. A refusal keeps the previous list. */
export function refreshMarket(): Promise<StoredMarket> {
  if (marketRunning) return marketRunning;
  marketRunning = (async () => {
    const prev = await readMarket();
    const sc = await outreachScopes();
    if (!sc.connected || !sc.market) {
      const v = { ...prev, error: !sc.connected ? "TikTok Shop is not connected." : "TikTok has not granted the creator search permission yet.", triedAt: Date.now() };
      await saveMarket(v); return v;
    }
    const prefs = await preferredCategories();
    const seen = new Map<string, MarketCreator>();
    const fields = new Set<string>();
    let token: string | undefined, error: string | null = null;
    for (let page = 0; page < MARKET_PAGES; page++) {
      const r = await searchMarketplace({ categoryIds: prefs.ids, notInvited90d: true, pageToken: token });
      if (!r.ok) { error = busyText(r.error); break; }
      for (const c of r.creators) { const k = c.id ?? c.username ?? ""; if (k && !seen.has(k)) seen.set(k, c); }
      r.fieldsSeen.forEach((f) => fields.add(f));
      if (!r.next) break;
      token = r.next;
      await wait(1200);
    }
    // Keep what we got; if nothing came back, keep the previous list and say why.
    const v: StoredMarket = seen.size ? { at: Date.now(), creators: [...seen.values()], fieldsSeen: [...fields], error, triedAt: Date.now() } : { ...prev, error: error ?? "TikTok returned no creators.", triedAt: Date.now() };
    await saveMarket(v);
    return v;
  })().finally(() => { marketRunning = null; });
  return marketRunning;
}

/** True when the kept list is older than six hours (or missing) and the last try was not in the last 15 minutes. */
export function marketDue(m: StoredMarket, now = Date.now()): boolean {
  return (!m.at || now - m.at > MARKET_EVERY_MS) && (!m.triedAt || now - m.triedAt > 15 * 60_000);
}

/** Creators who asked for a sample (still waiting) and whose level and categories we do not know, or knew over a month ago. */
export async function profilesNeeded(limit: number): Promise<string[]> {
  return (await rows<{ id: string }>(sql`
    select r.creator_id as id from tt_sample_requests r
    where r.is_approvable and r.creator_id is not null and (r.order_id is null or r.order_id ~ '^0*$')
      and not exists (select 1 from tt_creator_profiles p where p.open_id = r.creator_id and p.checked_at > now() - make_interval(days => ${PROFILE_DAYS}))
    group by r.creator_id order by min(r.expires_at) nulls last limit ${limit}`)).map((r) => r.id);
}

/** Checks up to `limit` creators, one every half second; stops at the first "too busy". */
export async function checkProfiles(limit: number): Promise<{ checked: number; busy: boolean }> {
  const sc = await outreachScopes();
  if (!sc.connected || !sc.market) return { checked: 0, busy: false };
  let checked = 0;
  for (const id of await profilesNeeded(limit)) {
    const r = await fetchCreatorProfile(id);
    if (r.ok) await saveProfile(id, r.profile);
    else if (r.busy) return { checked, busy: true };
    else await saveProfile(id, { username: null, followers: null, level: null, categoryIds: [], pps: null, rating: null, postRate: null, sampleScore: null, fulfilmentScore: null, officialRecommend: null, risingStar: null, blocked: null, invited90d: null, hasCollaborated: null, hasProfile: false });
    checked++;
    await wait(500);
  }
  return { checked, busy: false };
}

/** The worker's regular Creator Outreach step (every 10 minutes): eight eligibility checks, and the suggested list when it is due. */
export async function outreachTick(): Promise<void> {
  const r = await checkProfiles(8);
  if (r.busy) return;
  const m = await readMarket();
  if (marketDue(m)) await refreshMarket();
}
