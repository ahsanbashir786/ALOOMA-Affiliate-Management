import "server-only";
import { sql } from "drizzle-orm";
import { rows } from "@/lib/sql";
import { todayKL } from "@/lib/time";
import { productName } from "@/lib/products/catalog";
import { AdsApiError, adsCall, adsConfig, type AdsConfig, type Fetch } from "./client";
import { isBlocked, STATUS_LABEL } from "@/lib/ads/status";

// Creating and stopping a creative boost in TikTok, from the app. One video at a time (TikTok's rule: CREATIVE_NO_BID, one video per session).
// Calls (TikTok's own documentation): POST /campaign/gmv_max/session/create/ and POST /campaign/gmv_max/session/delete/.
// Safety: switched off until the owner turns it on; a limit on one boost; a limit on all boosts running from here; every try is kept in ads_boost_actions.

export type BoostWriteSettings = { enabled: boolean; /** Most one boost may spend a day (RM). */ maxBudget: number; /** Most all boosts started here may spend a day together while they run (RM). */ dailyCap: number };
export const BOOST_DEFAULTS: BoostWriteSettings = { enabled: false, maxBudget: 30, dailyCap: 50 };
const SKEY = "ads_boost_write";
const money = (v: unknown, d: number, hi = 100_000) => { const n = Number(v); return Number.isFinite(n) && n >= 1 ? Math.min(hi, Math.round(n * 100) / 100) : d; };

export async function getBoostWriteSettings(): Promise<BoostWriteSettings> {
  const [r] = await rows<{ value: Partial<BoostWriteSettings> }>(sql`select value from settings where key = ${SKEY}`);
  const v = r?.value ?? {};
  return { enabled: v.enabled === true, maxBudget: money(v.maxBudget, BOOST_DEFAULTS.maxBudget), dailyCap: money(v.dailyCap, BOOST_DEFAULTS.dailyCap) };
}
export async function saveBoostWriteSettings(patch: Partial<BoostWriteSettings>): Promise<BoostWriteSettings> {
  const cur = await getBoostWriteSettings();
  const s: BoostWriteSettings = { enabled: patch.enabled ?? cur.enabled, maxBudget: money(patch.maxBudget, cur.maxBudget), dailyCap: money(patch.dailyCap, cur.dailyCap) };
  if (s.maxBudget > s.dailyCap) s.dailyCap = s.maxBudget;
  await rows(sql`insert into settings (key, value) values (${SKEY}, ${JSON.stringify(s)}::jsonb) on conflict (key) do update set value = excluded.value, updated_at = now()`);
  return s;
}

// ───────── what can this video be boosted in ─────────
export type BoostCampaign = { advertiserId: string; campaignId: string; name: string; storeId: string; productId: string; productLabel: string; ranHere: boolean; lastSpend: string | null };
export type BoostOptions = { itemId: string; campaigns: BoostCampaign[]; /** Reasons TikTok would refuse, found before asking. Empty = nothing known against it. */ blockers: string[]; statusLabel: string | null; running: { sessionId: string; fromApp: boolean }[]; committed: number };

/** Active boosts started from the app, and what they spend a day together. */
async function committedFromApp(): Promise<number> {
  const [r] = await rows<{ n: number }>(sql`select coalesce(sum(budget), 0)::float8 as n from ads_boost_actions where action = 'create' and ok and stopped_at is null and (ends_at is null or ends_at > now())`);
  return Number(r?.n ?? 0);
}

export async function boostOptions(itemId: string): Promise<BoostOptions> {
  const camps = await rows<{ advertiser_id: string; campaign_id: string; name: string | null; store_id: string | null; product_id: string; product_key: string | null; ran_here: boolean; last_spend: string | null }>(sql`
    with mine as (
      select advertiser_id, campaign_id, product_id, to_char(max(day) filter (where coalesce(cost, 0) > 0), 'YYYY-MM-DD') as last_spend
      from ads_creative_daily where creative_id = ${itemId} and campaign_id <> '-' group by 1, 2, 3
    ), others as (
      select distinct d.advertiser_id, d.campaign_id, d.product_id from ads_product_daily d where d.product_id in (select product_id from mine) and d.campaign_id <> '-'
        and not exists (select 1 from mine m where m.advertiser_id = d.advertiser_id and m.campaign_id = d.campaign_id and m.product_id = d.product_id)
    ), allc as (
      select advertiser_id, campaign_id, product_id, true as ran_here, last_spend from mine
      union all select advertiser_id, campaign_id, product_id, false, null from others
    )
    select a.advertiser_id, a.campaign_id, c.name, c.store_id, a.product_id, pm.product_key, a.ran_here, a.last_spend
    from allc a join ads_campaigns c on c.advertiser_id = a.advertiser_id and c.campaign_id = a.campaign_id
    left join product_map pm on pm.product_id = a.product_id
    where coalesce(c.promotion_type, 'PRODUCT_GMV_MAX') = 'PRODUCT_GMV_MAX' and coalesce(c.status, '') not ilike '%DISABLE%' and coalesce(c.status, '') not ilike '%DELETE%' and coalesce(c.store_id, '') <> ''
    order by a.ran_here desc, a.last_spend desc nulls last`);
  const [st] = await rows<{ s: string | null }>(sql`select (array_agg(delivery_status order by day desc) filter (where delivery_status is not null))[1] as s from ads_creative_daily where creative_id = ${itemId}`);
  const sessions = await rows<{ session_id: string; from_app: boolean }>(sql`
    select b.session_id, false as from_app from ads_boosts b where b.item_id = ${itemId} and coalesce(b.ends_at, now() + interval '1 day') > now()
    union select a.session_id, true from ads_boost_actions a where a.item_id = ${itemId} and a.action = 'create' and a.ok and a.session_id is not null and a.stopped_at is null and (a.ends_at is null or a.ends_at > now())`);
  const seen = new Set<string>();
  const running = sessions.filter((x) => !seen.has(x.session_id) && seen.add(x.session_id)).map((x) => ({ sessionId: x.session_id, fromApp: x.from_app }));
  const blockers: string[] = [];
  if (!camps.length) blockers.push("No Product GMV Max campaign that this video's product runs in was found. Press Sync Now first, or boost it in TikTok Ads Manager.");
  if (isBlocked(st?.s)) blockers.push(`TikTok will not boost it: its status is ${STATUS_LABEL[st!.s!] ?? st!.s}.`);
  if (running.length) blockers.push("A boost for this video is already running. Only one is allowed at a time.");
  return {
    itemId, statusLabel: st?.s ? (STATUS_LABEL[st.s] ?? st.s) : null, blockers, running, committed: await committedFromApp(),
    campaigns: camps.map((c) => ({ advertiserId: c.advertiser_id, campaignId: c.campaign_id, name: c.name || `Campaign ${c.campaign_id.slice(-6)}`, storeId: c.store_id!, productId: c.product_id, productLabel: c.product_key ? productName(c.product_key) : `Product ${c.product_id.slice(-6)}`, ranHere: c.ran_here, lastSpend: c.last_spend })),
  };
}

// ───────── create / stop ─────────
// A write is never retried by itself: a second try could create a second boost.
type Deps = { f?: Fetch; cfg?: AdsConfig | null; now?: () => Date };
export type BoostResult = { ok: true; sessionId: string; message: string } | { ok: false; error: string };
/** TikTok's own words (its message already starts with "TikTok said…"). */
const failText = (e: unknown) => (e instanceof AdsApiError ? (/^TikTok said/i.test(e.message) ? e.message : `TikTok said: ${e.message}`) : e instanceof Error ? `The request did not go through: ${e.message}` : "The request did not go through.");
const utc = (d: Date) => d.toISOString().slice(0, 19).replace("T", " ");

async function log(a: { action: "create" | "stop"; user: string; advertiserId: string; campaignId?: string | null; itemId?: string | null; productId?: string | null; sessionId?: string | null; budget?: number | null; days?: number | null; endsAt?: Date | null; ok: boolean; message: string; request?: unknown; response?: unknown }) {
  await rows(sql`insert into ads_boost_actions (action, user_name, advertiser_id, campaign_id, item_id, product_id, session_id, budget, days, ends_at, ok, message, request, response)
    values (${a.action}, ${a.user}, ${a.advertiserId}, ${a.campaignId ?? null}, ${a.itemId ?? null}, ${a.productId ?? null}, ${a.sessionId ?? null}, ${a.budget ?? null}, ${a.days ?? null}, ${a.endsAt ? a.endsAt.toISOString() : null}::timestamptz, ${a.ok}, ${a.message}, ${a.request == null ? null : JSON.stringify(a.request)}::jsonb, ${a.response == null ? null : JSON.stringify(a.response)}::jsonb)`);
}

export type CreateInput = { itemId: string; advertiserId: string; campaignId: string; budget: number; /** null = until stopped. */ days: number | null; user: string };

/** Creates a creative boost for one video. Refuses before asking TikTok when the app's own limits say no; otherwise TikTok decides and its message is shown as it is. */
export async function createBoost(input: CreateInput, deps: Deps = {}): Promise<BoostResult> {
  const refuse = async (error: string, extra: Partial<Parameters<typeof log>[0]> = {}): Promise<BoostResult> => {
    await log({ action: "create", user: input.user, advertiserId: input.advertiserId, campaignId: input.campaignId, itemId: input.itemId, budget: input.budget, days: input.days, ok: false, message: error, ...extra }).catch(() => {});
    return { ok: false, error };
  };
  const s = await getBoostWriteSettings();
  if (!s.enabled) return { ok: false, error: "Boosting from the app is switched off. The owner can turn it on in Settings, under Connection, Ad Management." };
  const cfg = deps.cfg ?? adsConfig();
  if (!cfg) return { ok: false, error: "The TikTok Ads app ID and secret are not set on the server." };
  const budget = Math.round(Number(input.budget) * 100) / 100;
  if (!Number.isFinite(budget) || budget <= 0) return { ok: false, error: "Enter a daily budget above zero." };
  const days = input.days == null ? null : Math.min(30, Math.max(1, Math.round(Number(input.days) || 1)));
  if (budget > s.maxBudget) return refuse(`RM ${budget} a day is above your limit of RM ${s.maxBudget} for one boost. Change the limit in Settings if you mean it.`);
  const opt = await boostOptions(input.itemId);
  if (opt.blockers.length) return refuse(opt.blockers[0]);
  const camp = opt.campaigns.find((c) => c.campaignId === input.campaignId && c.advertiserId === input.advertiserId);
  if (!camp) return refuse("That campaign is not one this video's product runs in.");
  if (opt.committed + budget > s.dailyCap) return refuse(`Boosts started here already spend RM ${opt.committed.toFixed(2)} a day. Adding RM ${budget} would pass your limit of RM ${s.dailyCap} a day. Stop one, or change the limit in Settings.`);
  const [recent] = await rows<{ n: number }>(sql`select count(*)::int as n from ads_boost_actions where action = 'create' and ok and item_id = ${input.itemId} and created_at > now() - interval '90 seconds'`);
  if (recent?.n) return refuse("This video was just boosted. Wait a moment before trying again.");

  const now = (deps.now ?? (() => new Date()))();
  const ends = days == null ? null : new Date(now.getTime() + days * 86_400_000);
  const body = {
    advertiser_id: camp.advertiserId, campaign_id: camp.campaignId, store_id: camp.storeId,
    session: { bid_type: "CREATIVE_NO_BID", product_list: [{ spu_id: camp.productId }], item_id: input.itemId, budget, schedule_type: ends ? "SCHEDULE_START_END" : "SCHEDULE_FROM_NOW", ...(ends ? { schedule_end_time: utc(ends) } : {}) },
  };
  try {
    const d = await adsCall<{ session_id?: unknown }>("/campaign/gmv_max/session/create/", { cfg, f: deps.f, method: "POST", body });
    const sessionId = d?.session_id == null ? "" : String(d.session_id);
    await log({ action: "create", user: input.user, advertiserId: camp.advertiserId, campaignId: camp.campaignId, itemId: input.itemId, productId: camp.productId, sessionId: sessionId || null, budget, days, endsAt: ends, ok: true, message: "TikTok created the boost.", request: body, response: d });
    // The Boost Log keeps its before and after comparison.
    const [b] = await rows<{ id: number }>(sql`insert into ads_boost_batches (boosted_on, days, total_budget, note, created_by) values (${todayKL()}::date, ${days ?? 1}, ${budget}, 'Created in the app', ${input.user}) returning id::int as id`);
    await rows(sql`insert into ads_boost_batch_videos (batch_id, creative_id, product_id, budget) values (${b.id}, ${input.itemId}, ${camp.productId}, ${budget}) on conflict do nothing`);
    return { ok: true, sessionId, message: `TikTok created the boost${sessionId ? ` (session ${sessionId})` : ""}. It spends up to RM ${budget.toFixed(2)} a day${days ? ` for ${days} day${days === 1 ? "" : "s"}` : " until you stop it"}.` };
  } catch (e) {
    const msg = failText(e);
    await log({ action: "create", user: input.user, advertiserId: camp.advertiserId, campaignId: camp.campaignId, itemId: input.itemId, productId: camp.productId, budget, days, endsAt: ends, ok: false, message: msg, request: body, response: e instanceof AdsApiError ? { code: e.code, request_id: e.requestId } : null }).catch(() => {});
    return { ok: false, error: msg + (e instanceof AdsApiError && e.isAuth ? " Open Settings and press Connect again." : "") };
  }
}

/** Stops (deletes) a running boost session. */
export async function stopBoost(sessionId: string, user: string, deps: Deps = {}): Promise<BoostResult> {
  const cfg = deps.cfg ?? adsConfig();
  if (!cfg) return { ok: false, error: "The TikTok Ads app ID and secret are not set on the server." };
  const [r] = await rows<{ advertiser_id: string; item_id: string | null; campaign_id: string | null }>(sql`
    select advertiser_id, item_id, campaign_id from ads_boosts where session_id = ${sessionId}
    union all select advertiser_id, item_id, campaign_id from ads_boost_actions where session_id = ${sessionId} and action = 'create' limit 1`);
  if (!r) return { ok: false, error: "That boost session is not known here. Press Sync Now first." };
  const body = { advertiser_id: r.advertiser_id, session_id: sessionId };
  try {
    const d = await adsCall("/campaign/gmv_max/session/delete/", { cfg, f: deps.f, method: "POST", body });
    await rows(sql`update ads_boost_actions set stopped_at = now() where session_id = ${sessionId} and action = 'create'`);
    await rows(sql`update ads_boosts set ends_at = now() where session_id = ${sessionId} and (ends_at is null or ends_at > now())`);
    await log({ action: "stop", user, advertiserId: r.advertiser_id, campaignId: r.campaign_id, itemId: r.item_id, sessionId, ok: true, message: "TikTok stopped the boost.", request: body, response: d });
    return { ok: true, sessionId, message: "TikTok stopped the boost." };
  } catch (e) {
    const msg = failText(e);
    await log({ action: "stop", user, advertiserId: r.advertiser_id, campaignId: r.campaign_id, itemId: r.item_id, sessionId, ok: false, message: msg, request: body }).catch(() => {});
    return { ok: false, error: msg };
  }
}

export type BoostActionRow = { id: number; at: string; action: string; user: string | null; itemId: string | null; budget: number | null; days: number | null; ok: boolean; message: string | null; sessionId: string | null; stopped: boolean };
export async function recentBoostActions(limit = 15): Promise<BoostActionRow[]> {
  const r = await rows<{ id: number; at: Date; action: string; user_name: string | null; item_id: string | null; budget: number | null; days: number | null; ok: boolean; message: string | null; session_id: string | null; stopped: boolean }>(sql`
    select id::int as id, created_at as at, action, user_name, item_id, budget::float8 as budget, days, ok, message, session_id, stopped_at is not null as stopped from ads_boost_actions order by created_at desc, id desc limit ${limit}`);
  return r.map((x) => ({ id: x.id, at: new Date(x.at).toISOString(), action: x.action, user: x.user_name, itemId: x.item_id, budget: x.budget == null ? null : Number(x.budget), days: x.days, ok: x.ok, message: x.message, sessionId: x.session_id, stopped: x.stopped }));
}
