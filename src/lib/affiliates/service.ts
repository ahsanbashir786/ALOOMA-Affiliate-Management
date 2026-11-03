import "server-only";
import { sql } from "drizzle-orm";
import { analyse } from "@/lib/analytics/recommendations";
import { getOwnAccounts } from "@/lib/analytics/settings";
import { AL, rows, textArr } from "@/lib/analytics/sql";
import type { Period } from "@/lib/period-core";
import { getSampleLines, getSampleScorecard, rangeSql, contentType, type ContentType, type DateRange, type SampleLine, type ScoreRow } from "@/lib/samples/analysis";
import { VERDICTS } from "@/lib/samples/states";
import { SEGMENTS } from "@/lib/segments";

export type AffiliateScope = "active" | "everyone";
export type AffiliateSort = "gmv" | "orders" | "video" | "live" | "samples" | "fromsamples" | "name";
export const AFFILIATE_SORTS: Record<AffiliateSort, { label: string; dir: "asc" | "desc"; expr: string }> = {
  gmv: { label: "GMV", dir: "desc", expr: "coalesce(sales.gmv, 0)" },
  orders: { label: "Orders", dir: "desc", expr: "coalesce(sales.orders, 0)" },
  video: { label: "Video GMV", dir: "desc", expr: "coalesce(sales.vgmv, 0)" },
  live: { label: "LIVE GMV", dir: "desc", expr: "coalesce(sales.lgmv, 0)" },
  samples: { label: "Samples received", dir: "desc", expr: "coalesce(smp.n, 0)" },
  fromsamples: { label: "GMV from samples", dir: "desc", expr: "coalesce(fs.gmv, 0)" },
  name: { label: "Username (A–Z)", dir: "asc", expr: "p.creator" },
};

export type AffiliateFilter = { q?: string; scope: AffiliateScope; noPhone?: boolean; range?: DateRange };

export type AffiliateBase = {
  username: string;
  phone: string | null;
  approach: string | null;
  doNotContact: boolean;
  orders: number;
  items: number;
  gmv: number;
  videoGmv: number;
  liveGmv: number;
  samples: number;
  sampleQty: number;
  fromSamplesGmv: number;
  fromSamplesOrders: number;
};

const salesRange = (r: DateRange) => (r ? sql`and created_at >= ${r.start}::date and created_at < (${r.end}::date + 1)` : sql``);

/** One row per affiliate: sales (valid orders only), samples and the sales that new sample content produced. */
export async function queryAffiliates(
  f: AffiliateFilter,
  sort: AffiliateSort,
  dir: "asc" | "desc",
  limit: number,
  offset: number,
): Promise<{ rows: AffiliateBase[]; total: number; withoutPhone: number }> {
  const own = textArr(await getOwnAccounts());
  const order = sql.raw(`${AFFILIATE_SORTS[sort].expr} ${dir === "asc" ? "asc" : "desc"}`);
  const conds = [sql`true`];
  if (f.q) conds.push(sql`lower(p.creator) like ${`%${f.q.toLowerCase().replace(/^@/, "")}%`}`);
  if (f.noPhone) conds.push(sql`c.phone is null`);
  const data = await rows<{
    creator: string; phone: string | null; approach: string | null; dnc: boolean | null; orders: number | null; items: number | null;
    gmv: number | null; vgmv: number | null; lgmv: number | null; n: number | null; qty: number | null; fsg: number | null; fso: number | null;
    total: number; no_phone: number;
  }>(sql`
    with sales as (
      select creator,
        coalesce(sum(pay) filter (where valid), 0)::float8 as gmv,
        (count(distinct order_id) filter (where valid))::int as orders,
        coalesce(sum(qty) filter (where valid), 0)::int as items,
        coalesce(sum(pay) filter (where valid and content_type = 'Video'), 0)::float8 as vgmv,
        coalesce(sum(pay) filter (where valid and content_type = 'Livestream'), 0)::float8 as lgmv
      from ${AL}
      where creator <> all(${own}) and creator <> '(unknown)' ${salesRange(f.range)}
      group by creator
    ),
    smp as (
      select s.creator, count(*)::int as n, coalesce(sum(s.quantity), 0)::int as qty
      from samples s
      where s.source = 'orders' and s.creator is not null and s.creator <> all(${own}) ${rangeSql(f.range)}
      group by s.creator
    ),
    -- Sizes of one product share the same sales, so each product is counted once per affiliate.
    fs as (
      select creator, coalesce(sum(g), 0)::float8 as gmv, coalesce(sum(o), 0)::int as orders from (
        select s.creator, max(s.content_gmv) as g, max(s.content_orders) as o
        from samples s
        where s.source = 'orders' and s.creator is not null ${rangeSql(f.range)}
        group by s.creator, coalesce(s.product_id, s.id::text)
      ) x group by creator
    ),
    people as (
      select creator from sales
      union select creator from smp
      ${f.scope === "everyone"
        ? sql`union select username from creator_list_snapshots where username <> all(${own})
              union select username from creators`
        : sql``}
    )
    select p.creator, c.phone, c.approach, c.do_not_contact as dnc,
      sales.orders, sales.items, sales.gmv, sales.vgmv, sales.lgmv, smp.n, smp.qty, fs.gmv as fsg, fs.orders as fso,
      count(*) over ()::int as total,
      (count(*) filter (where c.phone is null) over ())::int as no_phone
    from people p
    left join creators c on c.username = p.creator
    left join sales on sales.creator = p.creator
    left join smp on smp.creator = p.creator
    left join fs on fs.creator = p.creator
    where ${sql.join(conds, sql` and `)}
    order by ${order}, p.creator
    limit ${limit} offset ${offset}`);
  return {
    total: data[0]?.total ?? 0,
    withoutPhone: data[0]?.no_phone ?? 0,
    rows: data.map((r) => ({
      username: r.creator,
      phone: r.phone,
      approach: r.approach,
      doNotContact: !!r.dnc,
      orders: r.orders ?? 0,
      items: r.items ?? 0,
      gmv: r.gmv ?? 0,
      videoGmv: r.vgmv ?? 0,
      liveGmv: r.lgmv ?? 0,
      samples: r.n ?? 0,
      sampleQty: r.qty ?? 0,
      fromSamplesGmv: r.fsg ?? 0,
      fromSamplesOrders: r.fso ?? 0,
    })),
  };
}

// ───────────────────────── Sales by SKU ─────────────────────────

export type SkuSales = {
  key: string;
  sku: string;
  name: string;
  productId: string | null;
  orders: number;
  qty: number;
  gmv: number;
  videoGmv: number;
  liveGmv: number;
};

/** What each affiliate sold, per SKU (valid orders only). `creators = null` means everyone. */
export async function getSkuSales(creators: string[] | null, range: DateRange): Promise<Map<string, SkuSales[]>> {
  if (creators && !creators.length) return new Map();
  const where = creators ? sql`and creator in (${sql.join(creators.map((c) => sql`${c}`), sql`, `)})` : sql``;
  const data = await rows<{
    creator: string; key: string; sku: string; sku_name: string | null; cat_name: string | null; pid: string | null;
    orders: number; qty: number; gmv: number; vgmv: number; lgmv: number;
  }>(sql`
    select x.*, k.name as cat_name from (
      select creator, upper(coalesce(seller_sku, sku_id)) as key, max(coalesce(seller_sku, sku_id)) as sku, max(sku_name) as sku_name,
        max(product_id) as pid,
        (count(distinct order_id) filter (where valid))::int as orders,
        coalesce(sum(qty) filter (where valid), 0)::int as qty,
        coalesce(sum(pay) filter (where valid), 0)::float8 as gmv,
        coalesce(sum(pay) filter (where valid and content_type = 'Video'), 0)::float8 as vgmv,
        coalesce(sum(pay) filter (where valid and content_type = 'Livestream'), 0)::float8 as lgmv
      from ${AL}
      where creator <> '(unknown)' ${where} ${salesRange(range)}
      group by creator, upper(coalesce(seller_sku, sku_id))
    ) x
    left join sku_items k on upper(k.sku) = x.key
    order by x.gmv desc`);
  const out = new Map<string, SkuSales[]>();
  for (const r of data) {
    out.set(r.creator, [
      ...(out.get(r.creator) ?? []),
      { key: r.key, sku: r.sku, name: r.cat_name ?? r.sku_name ?? r.sku, productId: r.pid, orders: r.orders, qty: r.qty, gmv: r.gmv, videoGmv: r.vgmv, liveGmv: r.lgmv },
    ]);
  }
  return out;
}

// ───────────────────────── Product ideas ─────────────────────────

export type TopProduct = { productId: string; name: string; gmv: number };

/** Best-selling products across all affiliates – the pool for "samples she hasn't received". */
export async function getTopProducts(range: DateRange, limit = 8): Promise<TopProduct[]> {
  const own = textArr(await getOwnAccounts());
  const data = await rows<{ pid: string; name: string | null; gmv: number }>(sql`
    select al.product_id as pid, coalesce(max(p.short_name), max(p.name), al.product_id) as name,
      coalesce(sum(pay) filter (where valid), 0)::float8 as gmv
    from ${AL}
    left join products p on p.product_id = al.product_id
    where creator <> all(${own}) ${salesRange(range)}
    group by al.product_id
    order by gmv desc
    limit ${limit}`);
  return data.filter((d) => d.gmv > 0).map((d) => ({ productId: d.pid, name: d.name ?? d.pid, gmv: d.gmv }));
}

// ───────────────────────── Enriched rows ─────────────────────────

export type AffiliateAction = { label: string; tone: "good" | "brand" | "neutral" | "warn" | "serious" | "critical"; text: string };

export type Affiliate = AffiliateBase & {
  type: ContentType | null;
  lines: SampleLine[];
  skus: SkuSales[];
  action: AffiliateAction | null;
  /** Products she has neither received as a sample nor sold – only judged on the data that is loaded. */
  suggest: string[];
};

const BIG = 2000;

/**
 * The table rows with everything needed to show or export them: sample lines, sales per SKU,
 * the recommended action (sample follow-up first, otherwise the creator segment) and product ideas.
 */
export async function loadAffiliates(
  f: AffiliateFilter,
  sort: AffiliateSort,
  dir: "asc" | "desc",
  period: Period,
  limit: number,
  offset: number,
): Promise<{ items: Affiliate[]; total: number; withoutPhone: number }> {
  const base = await queryAffiliates(f, sort, dir, limit, offset);
  const names = base.rows.map((r) => r.username);
  const sampled = base.rows.filter((r) => r.samples > 0).map((r) => r.username);
  const sellers = base.rows.filter((r) => r.orders > 0).map((r) => r.username);

  const [lines, skus, score, analysis, top] = await Promise.all([
    getSampleLines(sampled.length > BIG ? names : sampled, f.range),
    getSkuSales(sellers.length > BIG ? null : sellers, f.range),
    getSampleScorecard(f.range),
    analyse(period),
    getTopProducts(f.range),
  ]);
  const verdict = new Map<string, ScoreRow>(score.rows.map((r) => [r.username, r]));
  const seg = new Map(analysis.classified.map((c) => [c.username, c]));

  const items = base.rows.map((r): Affiliate => {
    const ls = lines.get(r.username) ?? [];
    const sk = skus.get(r.username) ?? [];
    const sc = verdict.get(r.username);
    const cl = seg.get(r.username);

    let action: AffiliateAction | null = null;
    if (sc && sc.verdict !== "ok") {
      const v = VERDICTS[sc.verdict];
      action = { label: v.label, tone: v.tone, text: sc.advice || v.todo };
    } else if (cl?.segment && !["steady", "sample_no_post", "untapped"].includes(cl.segment)) {
      const s = SEGMENTS[cl.segment];
      action = { label: s.label, tone: s.tone, text: cl.reason || s.playbook };
    }

    const have = new Set<string>([...ls.map((l) => l.productId), ...sk.map((x) => x.productId)].filter((x): x is string => !!x));
    const suggest = top.filter((t) => !have.has(t.productId)).slice(0, 3).map((t) => t.name);

    return {
      ...r,
      type: sc?.type ?? cl?.contentType ?? contentType({ videoGmv: r.videoGmv, liveGmv: r.liveGmv, approach: r.approach }),
      lines: ls,
      skus: sk,
      action,
      suggest,
    };
  });
  return { items, total: base.total, withoutPhone: base.withoutPhone };
}
