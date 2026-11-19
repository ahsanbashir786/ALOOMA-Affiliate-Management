import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { callApi, connectionInfo, type Fetch } from "./client";
import { sql } from "drizzle-orm";
import { readCreatorProfile, readMarketCreators, type CreatorProfile, type MarketCreator } from "@/lib/affiliate/outreach";
import { preferredRootIds, type Category } from "@/lib/affiliate/eligibility";

/** The permission TikTok must have granted before the app may approve, reject or invite. */
export const WRITE_SCOPE = "seller.affiliate_collaboration.write";
export const MARKET_SCOPE = "seller.creator_marketplace.read";

const REVIEW_KEY = "outreach_review";
/** Approving and rejecting are OFF until the owner switches them on. */
export async function reviewEnabled(): Promise<boolean> {
  const [r] = await db.select().from(settings).where(eq(settings.key, REVIEW_KEY));
  return (r?.value as { enabled?: boolean } | undefined)?.enabled === true;
}
export async function setReviewEnabled(enabled: boolean) {
  await db.insert(settings).values({ key: REVIEW_KEY, value: { enabled } }).onConflictDoUpdate({ target: settings.key, set: { value: { enabled }, updatedAt: new Date() } });
}

/** Which of the two outreach permissions TikTok has granted this connection. */
export async function outreachScopes(): Promise<{ connected: boolean; write: boolean; market: boolean }> {
  const c = await connectionInfo();
  return { connected: c.connected, write: c.scopes.includes(WRITE_SCOPE), market: c.scopes.includes(MARKET_SCOPE) };
}

export type ReviewResult = { ok: true } | { ok: false; error: string };
export type RejectReason = "NOT_MATCH" | "OFFLINE" | "OUT_OF_STOCK" | "OTHER";
export const REJECT_REASONS: { key: RejectReason; label: string }[] = [
  { key: "NOT_MATCH", label: "Not a match for us" }, { key: "OUT_OF_STOCK", label: "Out of stock" }, { key: "OFFLINE", label: "Product is offline" }, { key: "OTHER", label: "Other reason" },
];

/** Approves or rejects one PENDING sample application. An approval cannot be undone through TikTok's API. */
export async function reviewSampleApplication(applicationId: string, result: "APPROVE" | "REJECT", reason?: RejectReason, f?: Fetch): Promise<ReviewResult> {
  if (!/^\d{5,30}$/.test(applicationId)) return { ok: false, error: "That request number does not look right." };
  if (result === "REJECT" && !reason) return { ok: false, error: "Pick a reason to reject." };
  try {
    await callApi(`/affiliate_seller/202507/sample_applications/${applicationId}/review`, { method: "POST", body: result === "REJECT" ? { review_result: result, reject_reason: reason } : { review_result: result }, f });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message.replace(/^TikTok said no \(\d+\): /, "") : "TikTok did not answer." };
  }
}

export type MarketFilters = { keyword?: string; gmvRanges?: string[]; pageToken?: string; /** Only creators in these top-level TikTok categories. */ categoryIds?: string[]; /** Leave out creators you invited in the last 90 days. */ notInvited90d?: boolean };
export type MarketResult = { ok: true; creators: MarketCreator[]; next: string | null; fieldsSeen: string[] } | { ok: false; error: string };

/** TikTok's own Creator Marketplace (last 30 days of data). Read only. */
export async function searchMarketplace(filters: MarketFilters = {}, f?: Fetch): Promise<MarketResult> {
  const body: Record<string, unknown> = {};
  if (filters.keyword?.trim()) body.keyword = filters.keyword.trim().slice(0, 60);
  if (filters.gmvRanges?.length) body.gmv_ranges = filters.gmvRanges.filter((g) => /^GMV_RANGE_[0-9_A-Z]+$/.test(g));
  if (filters.categoryIds?.length) body.category = filters.categoryIds.filter((c) => /^\d{3,12}$/.test(c)).map((id) => ({ parent_category_id: id }));
  if (filters.notInvited90d) body.affiliate_data = { not_invited_l90_days: true };
  try {
    const data = await callApi<Record<string, unknown>>("/affiliate_seller/202608/marketplace_creators/search", { method: "POST", query: { page_size: "20", ...(filters.pageToken ? { page_token: filters.pageToken } : {}) }, body, f });
    const r = readMarketCreators(data);
    return { ok: true, ...r };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message.replace(/^TikTok said no \(\d+\): /, "") : "TikTok did not answer." };
  }
}


// ───────── your categories, and what TikTok says about one creator ─────────
const CAT_KEY = "tt_category_roots";
const CAT_DAYS = 7;
export type PreferredCategories = { ok: boolean; error?: string; roots: Category[]; ids: string[]; matched: { id: string; name: string }[]; missing: string[] };

/** TikTok's top-level categories (kept for a week), and which of them are the ones ALOOMA wants. */
export async function preferredCategories(f?: Fetch): Promise<PreferredCategories> {
  const [row] = await db.select().from(settings).where(eq(settings.key, CAT_KEY));
  const saved = row?.value as { at?: number; roots?: Category[] } | undefined;
  let roots = saved?.roots ?? [];
  if (!roots.length || Date.now() - (saved?.at ?? 0) > CAT_DAYS * 86_400_000) {
    try {
      const d = await callApi<{ categories?: { id?: unknown; parent_id?: unknown; local_name?: unknown }[] }>("/product/202309/categories", { method: "GET", query: { category_version: "v2", listing_platform: "TIKTOK_SHOP", include_prohibited_categories: "false", locale: "en-US" }, f });
      roots = (d.categories ?? []).filter((c) => String(c.parent_id ?? "") === "0" || c.parent_id === 0).map((c) => ({ id: String(c.id), parent_id: "0", local_name: String(c.local_name ?? "") })).filter((c) => c.id && c.local_name);
      if (roots.length) await db.insert(settings).values({ key: CAT_KEY, value: { at: Date.now(), roots } }).onConflictDoUpdate({ target: settings.key, set: { value: { at: Date.now(), roots }, updatedAt: new Date() } });
    } catch (e) {
      if (!roots.length) return { ok: false, error: e instanceof Error ? e.message.replace(/^TikTok said no \(\d+\): /, "") : "TikTok did not answer.", roots: [], ids: [], matched: [], missing: [] };
    }
  }
  const p = preferredRootIds(roots);
  return { ok: p.ids.length > 0, roots, ids: p.ids, matched: p.matched, missing: p.missing, error: p.ids.length ? undefined : "None of your categories were found in TikTok's list." };
}

export type ProfileResult = { ok: true; profile: CreatorProfile } | { ok: false; error: string; busy: boolean };
/** One creator's marketplace profile: level, categories, scores. */
export async function fetchCreatorProfile(openId: string, f?: Fetch): Promise<ProfileResult> {
  if (!/^[A-Za-z0-9_-]{10,120}$/.test(openId)) return { ok: false, error: "That creator ID does not look right.", busy: false };
  try {
    const d = await callApi(`/affiliate_seller/202608/marketplace_creators/${openId}`, { method: "GET", f });
    return { ok: true, profile: readCreatorProfile(d) };
  } catch (e) {
    const m = e instanceof Error ? e.message.replace(/^TikTok said no \(\d+\): /, "") : "TikTok did not answer.";
    return { ok: false, error: m, busy: /too many requests|rate limit/i.test(m) };
  }
}

/** Keeps a creator's profile so it is not asked for again for a while. */
export async function saveProfile(openId: string, p: CreatorProfile) {
  await db.execute(sql`
    insert into tt_creator_profiles (open_id, username, level, category_ids, followers, pps, rating, post_rate, sample_score, fulfilment_score, official_recommend, rising_star, blocked, has_collaborated, invited_90d, has_profile, checked_at)
    values (${openId}, ${p.username}, ${p.level}, (select coalesce(array_agg(x), '{}'::text[]) from jsonb_array_elements_text(${JSON.stringify(p.categoryIds)}::jsonb) x), ${p.followers}, ${p.pps}, ${p.rating}, ${p.postRate}, ${p.sampleScore}, ${p.fulfilmentScore}, ${p.officialRecommend}, ${p.risingStar}, ${p.blocked}, ${p.hasCollaborated}, ${p.invited90d}, ${p.hasProfile}, now())
    on conflict (open_id) do update set username = excluded.username, level = excluded.level, category_ids = excluded.category_ids, followers = excluded.followers, pps = excluded.pps, rating = excluded.rating, post_rate = excluded.post_rate,
      sample_score = excluded.sample_score, fulfilment_score = excluded.fulfilment_score, official_recommend = excluded.official_recommend, rising_star = excluded.rising_star, blocked = excluded.blocked, has_collaborated = excluded.has_collaborated,
      invited_90d = excluded.invited_90d, has_profile = excluded.has_profile, checked_at = now()`);
}
