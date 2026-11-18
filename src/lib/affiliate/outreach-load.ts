import "server-only";
import { sql } from "drizzle-orm";
import { rows } from "@/lib/sql";
import { cached } from "@/lib/swr";
import { loadCreatorRows } from "@/lib/creators/load";
import { kd, PK_LISTING } from "@/lib/creators/sql";
import { hasOrderSql } from "@/lib/creators/sample-status";
import { productName } from "@/lib/products/catalog";
import { addDaysISO, daysBetweenISO, todayKL } from "@/lib/time";
import { sampleGuard } from "./command";
import { giveMoreSamples, historyOf, PIPELINE, requestStage, type History, type MarketCreator, type MoreSample, type PipelineKey } from "./outreach";
import { outreachScopes, reviewEnabled, searchMarketplace } from "@/lib/tiktok/outreach";

export type SampleCard = {
  id: string; creator: string; nickname: string | null; followers: number | null; product: string; sku: string | null; quantity: number | null; commission: number | null;
  stage: Exclude<PipelineKey, "suggested">; requestedOn: string | null; shippedOn: string | null; deliveredOn: string | null; expiresOn: string | null; daysLeft: number | null; approvable: boolean;
  history: History;
};
export type Outreach = {
  ref: string;
  counts: Record<PipelineKey, number>;
  samples: Record<Exclude<PipelineKey, "suggested">, SampleCard[]>;
  more: MoreSample[];
  tiktok: { ok: true; creators: MarketCreator[]; fieldsSeen: string[] } | { ok: false; error: string };
  guard: ReturnType<typeof sampleGuard>;
  flags: { reviewOn: boolean; write: boolean; market: boolean; connected: boolean };
};

const WINDOW_DAYS = 150;
const LIMIT = 100;

type Raw = { id: string; creator: string; nickname: string | null; followers: number | null; pk: string; sku: string | null; status: string | null; order_id: string | null; approvable: boolean | null; qty: number | null; commission: number | null;
  req: string | null; ship: string | null; dlv: string | null; ostatus: string | null; expires: string | null; has_post: boolean };

export async function loadOutreach(): Promise<Outreach | null> {
  const { all, ref } = await loadCreatorRows();
  if (!ref) return null;
  const since = addDaysISO(todayKL(), -WINDOW_DAYS);
  const raw = await rows<Raw>(sql`
    select z.id, z.creator, z.nickname, z.followers, z.pk, z.sku, z.status, z.order_id, z.approvable, z.qty, z.commission, z.req, z.ship, z.dlv, z.ostatus, z.expires,
      (z.dlv is not null and (exists (select 1 from tt_videos v cross join lateral jsonb_array_elements(coalesce(v.products, '[]'::jsonb)) p
                 where v.creator = z.creator and v.posted_at >= z.t0 - interval '1 day' and ${sql.raw(PK_LISTING("p->>'id'"))} = z.pk)
         or exists (select 1 from tt_affiliate_order_lines a left join product_map pm on pm.product_id = a.product_id
                    where a.creator = z.creator and coalesce(pm.product_key, 'unmapped') = z.pk and a.created_at >= z.t0 - interval '1 day'))) as has_post
    from (
      select r.id, r.creator, r.nickname, r.followers::int as followers, r.status, case when ${sql.raw(hasOrderSql("r"))} then r.order_id end as order_id, r.is_approvable as approvable,
        r.available_quantity as qty, r.commission_rate::float8 as commission, coalesce(k.seller_sku, r.sku_name) as sku, ${sql.raw(PK_LISTING("coalesce(k.product_id, r.product_id)"))} as pk,
        coalesce(o.delivered_at, o.created_at, r.first_seen_at) as t0,
        to_char(${kd("r.first_seen_at")}, 'YYYY-MM-DD') as req,
        to_char(${kd("coalesce(o.paid_at, o.created_at)")}, 'YYYY-MM-DD') as ship,
        to_char(${kd("coalesce(o.delivered_at, case when o.status in ('DELIVERED', 'COMPLETED') then o.updated_at end)")}, 'YYYY-MM-DD') as dlv,
        to_char(${kd("r.expires_at")}, 'YYYY-MM-DD') as expires,
        o.status as ostatus
      from tt_sample_requests r left join tt_orders o on o.order_id = r.order_id left join tt_skus k on k.sku_id = r.sku_id
      where r.creator is not null and (r.first_seen_at >= ${since}::date or (r.is_approvable and r.order_id is null))
    ) z where z.pk <> 'excluded'
    order by z.req desc nulls last, z.id`);

  const byName = new Map(all.map((r) => [r.username, r]));
  const today = todayKL();
  const samples: Outreach["samples"] = { requested: [], approved: [], shipped: [], delivered: [], posted: [] };
  const seen = new Set<string>();
  for (const r of raw) {
    if (seen.has(r.id)) continue; seen.add(r.id);
    const stage = requestStage({ status: r.status, hasOrder: !!r.order_id, approvable: r.approvable, delivered: !!r.dlv, shipped: !!r.ship, hasPost: r.has_post, orderCancelled: (r.ostatus ?? "").toUpperCase() === "CANCELLED" });
    if (!stage) continue;
    if (stage === "requested" && r.expires && r.expires < today) continue; // TikTok will not let it be approved any more
    samples[stage].push({
      id: r.id, creator: r.creator, nickname: r.nickname, followers: r.followers, product: productName(r.pk), sku: r.sku, quantity: r.qty, commission: r.commission,
      stage, requestedOn: r.req, shippedOn: r.ship, deliveredOn: r.dlv, expiresOn: r.expires, daysLeft: r.expires ? daysBetweenISO(today, r.expires) : null, approvable: r.approvable === true,
      history: historyOf(byName.get(r.creator)),
    });
  }
  // Requests that expire first are shown first: those are the ones about to be lost.
  samples.requested.sort((a, b) => (a.daysLeft ?? 999) - (b.daysLeft ?? 999));

  const [flagOn, scopes] = await Promise.all([reviewEnabled(), outreachScopes()]);
  const more = giveMoreSamples(all);
  const tiktok = !scopes.connected ? ({ ok: false, error: "TikTok Shop is not connected." } as const)
    : !scopes.market ? ({ ok: false, error: "TikTok has not granted the creator search permission yet. Reconnect TikTok in Settings after switching it on in Partner Center." } as const)
    : await cached("outreach-market", "default", async () => {
        const r = await Promise.race([searchMarketplace({}), new Promise<{ ok: false; error: string }>((res) => setTimeout(() => res({ ok: false, error: "TikTok took too long to answer." }), 12_000))]);
        return r.ok ? ({ ok: true, creators: r.creators.slice(0, 40), fieldsSeen: r.fieldsSeen } as const) : r;
      });

  const lists = Object.fromEntries(Object.entries(samples).map(([k, v]) => [k, v.slice(0, LIMIT)])) as Outreach["samples"];
  const counts = { suggested: more.length + (tiktok.ok ? tiktok.creators.length : 0), requested: samples.requested.length, approved: samples.approved.length, shipped: samples.shipped.length, delivered: samples.delivered.length, posted: samples.posted.length } as Record<PipelineKey, number>;
  void PIPELINE;
  return { ref, counts, samples: lists, more, tiktok, guard: sampleGuard(all), flags: { reviewOn: flagOn, write: scopes.write, market: scopes.market, connected: scopes.connected } };
}
