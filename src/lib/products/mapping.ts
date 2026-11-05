import "server-only";
import { sql } from "drizzle-orm";
import { rows } from "@/lib/analytics/sql";
import { EXCLUDED, UNMAPPED, productName, productRank } from "./catalog";
import { skuFamily, suggestListing, type Families, type Suggestion } from "./suggest";

export type Listing = {
  productId: string;
  title: string;
  priceMin: number | null;
  priceMax: number | null;
  skus: number;
  lines: number;
  orders: number;
  creators: number;
  gmv: number;
  samples: number;
  variations: string[];
  families: { name: string; lines: number }[];
  /** Current mapping (null = none yet) and whether the owner confirmed it. */
  key: string | null;
  confirmed: boolean;
  suggestion: Suggestion;
};
export type AddOn = {
  skuId: string;
  productId: string;
  listingTitle: string;
  sellerSku: string;
  variation: string | null;
  lines: number;
  sharePct: number;
  homeTitle: string;
  suggestedKey: string;
  /** The saved override for this SKU, null = it follows its listing. */
  overrideKey: string | null;
  listingKey: string | null;
};
export type Coverage = { rows: { key: string; lines: number; gmv: number }[]; totalLines: number; totalGmv: number; unmappedLines: number; adds: boolean };
export type MapLog = { id: number; at: string; by: string | null; kind: string; ref: string; label: string; from: string | null; to: string | null; undone: boolean };

/** Every listing found in the TikTok data, with the facts that help to recognise it. */
async function listingFacts(): Promise<Omit<Listing, "key" | "confirmed" | "suggestion">[]> {
  const [base, fam, vars] = await Promise.all([
    rows<{ product_id: string; title: string | null; req_title: string | null; pmin: number | null; pmax: number | null; skus: number; lines: number; orders: number; creators: number; gmv: number | null; samples: number }>(sql`
      with ids as (
        select product_id from tt_skus where product_id is not null
        union select product_id from tt_affiliate_order_lines where product_id is not null
        union select product_id from tt_sample_requests where product_id is not null)
      select i.product_id,
        (select max(product_title) from tt_skus k where k.product_id = i.product_id) as title,
        (select max(product_title) from tt_sample_requests r where r.product_id = i.product_id) as req_title,
        (select min(price) from tt_skus k where k.product_id = i.product_id)::float8 as pmin,
        (select max(price) from tt_skus k where k.product_id = i.product_id)::float8 as pmax,
        (select count(*) from tt_skus k where k.product_id = i.product_id)::int as skus,
        (select count(*) from tt_affiliate_order_lines a where a.product_id = i.product_id)::int as lines,
        (select count(distinct order_id) from tt_affiliate_order_lines a where a.product_id = i.product_id)::int as orders,
        (select count(distinct creator) from tt_affiliate_order_lines a where a.product_id = i.product_id)::int as creators,
        (select sum(coalesce(price, 0) * coalesce(quantity, 1)) from tt_affiliate_order_lines a where a.product_id = i.product_id)::float8 as gmv,
        (select count(*) from tt_sample_requests r where r.product_id = i.product_id)::int as samples
      from ids i`),
    rows<{ product_id: string; sku: string | null; n: number }>(sql`select product_id, seller_sku as sku, count(*)::int as n from tt_affiliate_order_lines where product_id is not null group by 1, 2`),
    rows<{ product_id: string; name: string; n: number }>(sql`select product_id, sku_name as name, count(*)::int as n from tt_affiliate_order_lines where product_id is not null and sku_name is not null group by 1, 2`),
  ]);
  const famBy = new Map<string, Families>();
  for (const f of fam) { const m = famBy.get(f.product_id) ?? famBy.set(f.product_id, {}).get(f.product_id)!; const k = skuFamily(f.sku); if (k) m[k] = (m[k] ?? 0) + f.n; }
  const varBy = new Map<string, { name: string; n: number }[]>();
  for (const v of vars) (varBy.get(v.product_id) ?? varBy.set(v.product_id, []).get(v.product_id)!).push(v);
  return base.map((b) => ({
    productId: b.product_id, title: b.title ?? b.req_title ?? "Title unknown", priceMin: b.pmin, priceMax: b.pmax, skus: b.skus, lines: b.lines, orders: b.orders, creators: b.creators,
    gmv: b.gmv ?? 0, samples: b.samples,
    variations: (varBy.get(b.product_id) ?? []).sort((x, y) => y.n - x.n).slice(0, 4).map((v) => v.name),
    families: Object.entries(famBy.get(b.product_id) ?? {}).sort((x, y) => y[1] - x[1]).slice(0, 4).map(([name, lines]) => ({ name, lines })),
  }));
}

/** Gives every listing that has no mapping yet its suggested product (not confirmed), so every screen has names from the first visit. Returns how many it added. */
export async function ensureSuggested(): Promise<number> {
  const [missing] = await rows<{ n: number }>(sql`
    select count(*)::int as n from (
      select product_id from tt_skus where product_id is not null union select product_id from tt_affiliate_order_lines where product_id is not null union select product_id from tt_sample_requests where product_id is not null) i
    where not exists (select 1 from product_map m where m.product_id = i.product_id)`);
  if (!missing?.n) return 0;
  const have = new Set((await rows<{ product_id: string }>(sql`select product_id from product_map`)).map((r) => r.product_id));
  const fams = await rows<{ product_id: string; sku: string | null; n: number }>(sql`select product_id, seller_sku as sku, count(*)::int as n from tt_affiliate_order_lines where product_id is not null group by 1, 2`);
  const famBy = new Map<string, Families>();
  for (const f of fams) { const m = famBy.get(f.product_id) ?? famBy.set(f.product_id, {}).get(f.product_id)!; const k = skuFamily(f.sku); if (k) m[k] = (m[k] ?? 0) + f.n; }
  let added = 0;
  for (const l of await listingFacts()) {
    if (have.has(l.productId)) continue;
    const s = suggestListing(l.title === "Title unknown" ? null : l.title, famBy.get(l.productId) ?? {});
    if (!s.key) continue;
    await rows(sql`insert into product_map (product_id, product_key, confirmed) values (${l.productId}, ${s.key}, false) on conflict (product_id) do nothing`);
    added++;
  }
  return added;
}

export async function getMappingView() {
  await ensureSuggested();
  const [facts, maps, skuMaps, skuLines, cov, tot, log] = await Promise.all([
    listingFacts(),
    rows<{ product_id: string; product_key: string; confirmed: boolean }>(sql`select product_id, product_key, confirmed from product_map`),
    rows<{ sku_id: string; product_key: string }>(sql`select sku_id, product_key from sku_map`),
    rows<{ product_id: string; sku_id: string; sku: string | null; variation: string | null; n: number }>(sql`
      select product_id, sku_id, max(seller_sku) as sku, max(sku_name) as variation, count(*)::int as n from tt_affiliate_order_lines where product_id is not null and sku_id is not null group by 1, 2`),
    rows<{ k: string; lines: number; gmv: number }>(sql`
      select coalesce(sm.product_key, pm.product_key, 'unmapped') as k, count(*)::int as lines, coalesce(sum(coalesce(a.price, 0) * coalesce(a.quantity, 1)), 0)::float8 as gmv
      from tt_affiliate_order_lines a left join sku_map sm on sm.sku_id = a.sku_id left join product_map pm on pm.product_id = a.product_id group by 1`),
    rows<{ lines: number; gmv: number }>(sql`select count(*)::int as lines, coalesce(sum(coalesce(price, 0) * coalesce(quantity, 1)), 0)::float8 as gmv from tt_affiliate_order_lines`),
    rows<{ id: number; at: string; by: string | null; kind: string; ref: string; from_key: string | null; to_key: string | null; undone: boolean; title: string | null }>(sql`
      select l.id, l.at::text, u.name as by, l.kind, l.ref, l.from_key, l.to_key, (l.undone_at is not null) as undone,
        coalesce((select max(k.product_title) from tt_skus k where k.product_id = l.ref), (select max(k.product_title) from tt_skus k where k.sku_id = l.ref)) as title
      from product_map_log l left join users u on u.id = l.user_id order by l.id desc limit 12`),
  ]);
  const mapBy = new Map(maps.map((m) => [m.product_id, m]));
  const overBy = new Map(skuMaps.map((m) => [m.sku_id, m.product_key]));
  const fams = new Map<string, Families>();
  for (const l of skuLines) { const m = fams.get(l.product_id) ?? fams.set(l.product_id, {}).get(l.product_id)!; const k = skuFamily(l.sku); if (k) m[k] = (m[k] ?? 0) + l.n; }
  const listings: Listing[] = facts.map((f) => {
    const m = mapBy.get(f.productId);
    return { ...f, key: m?.product_key ?? null, confirmed: m?.confirmed ?? false, suggestion: suggestListing(f.title === "Title unknown" ? null : f.title, fams.get(f.productId) ?? {}) };
  }).sort((a, b) => b.lines - a.lines || b.samples - a.samples);

  // Add-on SKUs: the same seller SKU in several listings, a big part of one (its home) and a tiny part of another.
  const byCode = new Map<string, typeof skuLines>();
  for (const l of skuLines) if (l.sku) (byCode.get(l.sku.toUpperCase()) ?? byCode.set(l.sku.toUpperCase(), []).get(l.sku.toUpperCase())!).push(l);
  const total = new Map(facts.map((f) => [f.productId, f.lines]));
  const titleBy = new Map(listings.map((l) => [l.productId, l.title]));
  const keyOf = (pid: string) => mapBy.get(pid)?.product_key ?? null;
  const addons: AddOn[] = [];
  for (const [code, list] of byCode) {
    if (new Set(list.map((l) => l.product_id)).size < 2) continue;
    const share = (l: (typeof list)[number]) => l.n / Math.max(1, total.get(l.product_id) ?? 1);
    const home = [...list].sort((a, b) => share(b) - share(a))[0];
    const homeKey = keyOf(home.product_id);
    if (share(home) < 0.25 || !homeKey || homeKey === EXCLUDED || homeKey === UNMAPPED) continue;
    for (const l of list) {
      if (l.product_id === home.product_id) continue;
      const k = keyOf(l.product_id);
      if (!k || k === homeKey || k === EXCLUDED || share(l) >= 0.1 || l.n < 3) continue;
      addons.push({ skuId: l.sku_id, productId: l.product_id, listingTitle: titleBy.get(l.product_id) ?? "", sellerSku: code, variation: l.variation, lines: l.n, sharePct: Math.round(share(l) * 1000) / 10,
        homeTitle: titleBy.get(home.product_id) ?? "", suggestedKey: homeKey, overrideKey: overBy.get(l.sku_id) ?? null, listingKey: k });
    }
  }
  // Add-ons the owner already decided stay visible even if the evidence changes.
  for (const [skuId, key] of overBy) if (!addons.some((a) => a.skuId === skuId)) {
    const l = skuLines.find((x) => x.sku_id === skuId);
    if (l) addons.push({ skuId, productId: l.product_id, listingTitle: titleBy.get(l.product_id) ?? "", sellerSku: (l.sku ?? "").toUpperCase(), variation: l.variation, lines: l.n, sharePct: 0, homeTitle: "", suggestedKey: key, overrideKey: key, listingKey: keyOf(l.product_id) });
  }
  addons.sort((a, b) => b.lines - a.lines);

  const covRows = cov.map((c) => ({ key: c.k, lines: c.lines, gmv: c.gmv })).sort((a, b) => productRank(a.key) - productRank(b.key));
  const coverage: Coverage = { rows: covRows, totalLines: tot[0]?.lines ?? 0, totalGmv: tot[0]?.gmv ?? 0, unmappedLines: covRows.find((c) => c.key === UNMAPPED)?.lines ?? 0, adds: covRows.reduce((n, c) => n + c.lines, 0) === (tot[0]?.lines ?? 0) };
  const logs: MapLog[] = log.map((l) => ({ id: l.id, at: l.at, by: l.by, kind: l.kind, ref: l.ref, label: l.title ?? l.ref, from: l.from_key ? productName(l.from_key) : null, to: l.to_key ? productName(l.to_key) : null, undone: l.undone }));
  return { listings, addons, coverage, log: logs, unconfirmed: maps.filter((m) => !m.confirmed).length };
}

/** For the banner on the Creators page: how much of the mapping still needs the owner. */
export async function getMappingStatus(): Promise<{ unconfirmed: number; unmappedLines: number }> {
  const [r] = await rows<{ unconfirmed: number; unmapped: number }>(sql`
    select (select count(*) from product_map pm where not pm.confirmed and exists (select 1 from tt_affiliate_order_lines a where a.product_id = pm.product_id))::int as unconfirmed,
      (select count(*) from tt_affiliate_order_lines a left join sku_map sm on sm.sku_id = a.sku_id left join product_map pm on pm.product_id = a.product_id where coalesce(sm.product_key, pm.product_key) is null)::int as unmapped`);
  return { unconfirmed: r?.unconfirmed ?? 0, unmappedLines: r?.unmapped ?? 0 };
}
