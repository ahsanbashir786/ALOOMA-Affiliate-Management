import "server-only";
import { addDaysISO, todayKL } from "@/lib/time";
import { AdsApiError, adsAuthorizedAdvertisers, adsCallPatient as adsCall, adsConfig, type AdsConfig, type Fetch } from "./client";
import { GMV_MAX_PROMOTION_TYPES, arr, obj } from "./map";

export type AdsCheck = { name: string; ok: boolean; message: string; count: number | null; /** The field names TikTok sent (names only). */ fields: string[] | null; /** The first record, as text, so we can see what the data looks like. */ sample: string | null };
export type AdsChecks = { checks: AdsCheck[]; accounts: { id: string; name: string | null; currency: string | null }[]; at: string };

const names = (v: unknown): string[] => (v && typeof v === "object" ? Object.keys(v as object).slice(0, 40) : []);
const short = (e: unknown) => (e instanceof Error ? e.message.replace(/^TikTok said no \(\d+\): /, "") : "Failed").slice(0, 300) + (e instanceof AdsApiError && e.requestId ? ` (request ${e.requestId})` : "");

/**
 * Connection check: asks TikTok for the ad accounts, the GMV Max shops, the GMV Max campaigns and one week of campaign results,
 * and says whether each answered, which fields came back and what the first record looks like. Nothing is saved.
 */
export async function runAdsChecks(deps: { cfg?: AdsConfig | null; f?: Fetch; sleep?: (ms: number) => Promise<void> } = {}): Promise<AdsChecks> {
  const cfg = deps.cfg === undefined ? adsConfig() : deps.cfg;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const accounts: AdsChecks["accounts"] = [];
  const checks: AdsCheck[] = [];
  if (!cfg) return { checks: [{ name: "Setup", ok: false, message: "The TikTok Ads app ID and secret are not set on the server.", count: null, fields: null, sample: null }], accounts, at: new Date().toISOString() };
  const run = async (name: string, job: () => Promise<{ items: unknown[]; fields?: unknown }>) => {
    await sleep(350); // stay under TikTok's rate limit
    try {
      const { items, fields } = await job();
      checks.push({ name, ok: true, message: "Answered", count: items.length, fields: names(fields ?? items[0]), sample: items[0] ? JSON.stringify(items[0], null, 2).slice(0, 1500) : null });
    } catch (e) { checks.push({ name, ok: false, message: short(e), count: null, fields: null, sample: null }); }
  };
  let ids: string[] = [];
  await run("Ad accounts", async () => {
    ids = await adsAuthorizedAdvertisers(cfg, deps.f);
    if (!ids.length) throw new Error("TikTok did not list any ad account for this login.");
    const d = await adsCall<Record<string, unknown>>("/advertiser/info/", { cfg, f: deps.f, sleep: deps.sleep, query: { advertiser_ids: ids.slice(0, 100) } });
    const list = arr(d.list ?? d.advertisers);
    for (const a of list) accounts.push({ id: String(a.advertiser_id ?? a.id ?? ""), name: a.name == null ? (a.advertiser_name == null ? null : String(a.advertiser_name)) : String(a.name), currency: a.currency == null ? null : String(a.currency) });
    if (!accounts.length) for (const id of ids) accounts.push({ id, name: null, currency: null });
    return { items: list.length ? list : ids.map((id) => ({ advertiser_id: id })) };
  });
  // Every ad account is looked at: the shop (and the ads) may sit on any one of them.
  const shopsOf = new Map<string, string[]>();
  await run("GMV Max shops", async () => {
    const all: Record<string, unknown>[] = [];
    const bad: string[] = [];
    for (const id of ids) {
      try {
        const d = await adsCall<Record<string, unknown>>("/gmv_max/store/list/", { cfg, f: deps.f, sleep: deps.sleep, query: { advertiser_id: id } });
        const list = arr(d.store_list ?? d.stores ?? d.list);
        shopsOf.set(id, list.map((s) => String(s.store_id ?? "")).filter(Boolean));
        all.push(...list.map((s) => ({ advertiser_id: id, ...s })));
      } catch (e) { bad.push(`${id}: ${short(e)}`); }
    }
    if (!all.length && bad.length) throw new Error(bad[0]);
    return { items: all };
  });
  await run("GMV Max campaigns", async () => {
    const all: Record<string, unknown>[] = [];
    let firstError: unknown = null;
    for (const id of ids) {
      try {
        const d = await adsCall<Record<string, unknown>>("/gmv_max/campaign/get/", { cfg, f: deps.f, sleep: deps.sleep, query: { advertiser_id: id, filtering: { gmv_max_promotion_types: GMV_MAX_PROMOTION_TYPES }, page: 1, page_size: 10 } });
        all.push(...arr(d.list).map((c) => ({ advertiser_id: id, ...c })));
      } catch (e) { firstError ??= e; }
    }
    if (!all.length && firstError) throw firstError;
    return { items: all };
  });
  const withShop = ids.find((id) => (shopsOf.get(id) ?? []).length);
  if (withShop) {
    await run("Campaign results (last 7 days)", async () => {
      const end = todayKL();
      const d = await adsCall<Record<string, unknown>>("/gmv_max/report/get/", { cfg, f: deps.f, sleep: deps.sleep, query: { advertiser_id: withShop, store_ids: shopsOf.get(withShop), dimensions: ["campaign_id", "stat_time_day"], metrics: ["cost", "orders", "gross_revenue", "roi"], start_date: addDaysISO(end, -6), end_date: end, page: 1, page_size: 10 } });
      const list = arr(d.list);
      return { items: list, fields: { ...obj(list[0]?.dimensions), ...obj(list[0]?.metrics) } };
    });
  }
  return { checks, accounts, at: new Date().toISOString() };
}
