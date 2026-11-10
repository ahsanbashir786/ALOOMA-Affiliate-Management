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
  let shopRow: { adv: string; store: string; bc: string } | null = null;
  let firstCampaign: { adv: string; id: string } | null = null;
  await run("GMV Max shops", async () => {
    const all: Record<string, unknown>[] = [];
    const bad: string[] = [];
    for (const id of ids) {
      try {
        const d = await adsCall<Record<string, unknown>>("/gmv_max/store/list/", { cfg, f: deps.f, sleep: deps.sleep, query: { advertiser_id: id } });
        const list = arr(d.store_list ?? d.stores ?? d.list);
        shopsOf.set(id, list.map((s) => String(s.store_id ?? "")).filter(Boolean));
        const withBc = list.find((s) => s.store_id && s.store_authorized_bc_id);
        if (!shopRow && withBc) shopRow = { adv: id, store: String(withBc.store_id), bc: String(withBc.store_authorized_bc_id) };
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
        if (!firstCampaign && arr(d.list)[0]?.campaign_id) firstCampaign = { adv: id, id: String(arr(d.list)[0].campaign_id) };
      } catch (e) { firstError ??= e; }
    }
    if (!all.length && firstError) throw firstError;
    return { items: all };
  });
  const withShops = ids.filter((id) => (shopsOf.get(id) ?? []).length);
  if (withShops.length) {
    await run("Campaign results (last 7 days)", async () => {
      const end = todayKL();
      let last: { list: Record<string, unknown>[]; adv: string } | null = null;
      for (const id of withShops) {
        const d = await adsCall<Record<string, unknown>>("/gmv_max/report/get/", { cfg, f: deps.f, sleep: deps.sleep, query: { advertiser_id: id, store_ids: shopsOf.get(id), dimensions: ["campaign_id", "stat_time_day"], metrics: ["cost", "orders", "gross_revenue", "roi"], start_date: addDaysISO(end, -6), end_date: end, page: 1, page_size: 10 } });
        const list = arr(d.list);
        last = { list, adv: id };
        if (list.length) break; // the first account that has results in the last week
      }
      const list = last?.list ?? [];
      return { items: list, fields: { ...obj(list[0]?.dimensions), ...obj(list[0]?.metrics) } };
    });
  }
  // The video list and the boosts (read only): who made each video, whether it may be boosted, and what is boosted now.
  const sr = shopRow as { adv: string; store: string; bc: string } | null;
  if (sr) {
    await run("GMV Max videos", async () => {
      const d = await adsCall<Record<string, unknown>>("/gmv_max/video/get/", { cfg, f: deps.f, sleep: deps.sleep, query: { advertiser_id: sr.adv, store_id: sr.store, store_authorized_bc_id: sr.bc, page: 1, page_size: 10 } });
      const items = arr(d.list ?? d.videos ?? d.item_list ?? Object.values(d).find((v) => Array.isArray(v)));
      if (items.length) return { items };
      // Nothing from the plain list: the TikTok accounts (identities) of the shop, so we can see what they look like.
      const idn = await adsCall<Record<string, unknown>>("/gmv_max/identity/get/", { cfg, f: deps.f, sleep: deps.sleep, query: { advertiser_id: sr.adv, store_id: sr.store, store_authorized_bc_id: sr.bc } });
      return { items: [], fields: obj(arr(idn.identity_list ?? idn.list ?? idn.identities ?? Object.values(idn).find((v) => Array.isArray(v)))[0]) };
    });
  }
  const fc = firstCampaign as { adv: string; id: string } | null;
  if (fc) {
    await run("Creative boosts", async () => {
      const d = await adsCall<Record<string, unknown>>("/campaign/gmv_max/session/list/", { cfg, f: deps.f, sleep: deps.sleep, query: { advertiser_id: fc.adv, campaign_id: fc.id } });
      return { items: arr(d.list ?? d.sessions ?? d.session_list ?? Object.values(d).find((v) => Array.isArray(v))) };
    });
  }
  return { checks, accounts, at: new Date().toISOString() };
}
