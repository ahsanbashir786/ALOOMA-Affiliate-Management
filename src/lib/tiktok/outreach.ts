import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { callApi, connectionInfo, type Fetch } from "./client";
import { readMarketCreators, type MarketCreator } from "@/lib/affiliate/outreach";

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

export type MarketFilters = { keyword?: string; gmvRanges?: string[]; pageToken?: string };
export type MarketResult = { ok: true; creators: MarketCreator[]; next: string | null; fieldsSeen: string[] } | { ok: false; error: string };

/** TikTok's own Creator Marketplace (last 30 days of data). Read only. */
export async function searchMarketplace(filters: MarketFilters = {}, f?: Fetch): Promise<MarketResult> {
  const body: Record<string, unknown> = {};
  if (filters.keyword?.trim()) body.keyword = filters.keyword.trim().slice(0, 60);
  if (filters.gmvRanges?.length) body.gmv_ranges = filters.gmvRanges.filter((g) => /^GMV_RANGE_[0-9_A-Z]+$/.test(g));
  try {
    const data = await callApi<Record<string, unknown>>("/affiliate_seller/202608/marketplace_creators/search", { method: "POST", query: { page_size: "20", ...(filters.pageToken ? { page_token: filters.pageToken } : {}) }, body, f });
    const r = readMarketCreators(data);
    return { ok: true, ...r };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message.replace(/^TikTok said no \(\d+\): /, "") : "TikTok did not answer." };
  }
}
