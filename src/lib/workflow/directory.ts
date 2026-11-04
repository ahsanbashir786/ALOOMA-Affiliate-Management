import "server-only";
import { sql } from "drizzle-orm";
import { AL, rows } from "@/lib/analytics/sql";
import { creatorStatus, winnerThreshold, type CreatorAction, type CreatorStatus } from "@/lib/affiliates/status";
import { addDaysISO } from "@/lib/time";
import { loadRelationships } from "./relationships";

/** One sampled product of a creator, with how it performs for that creator. */
export type DirProduct = {
  pid: string | null;
  name: string;
  skus: string[];
  ordersVideo: number;
  ordersLive: number;
  orders: number;
  gmv: number;
  videos: number;
  lastVideoOn: string | null;
  undatedVideos: number;
};

export type DirRow = {
  username: string;
  type: "Video" | "LIVE" | "Video + LIVE" | null;
  phone: string | null;
  products: DirProduct[];
  gmvAll: number;
  status: CreatorStatus;
  action: CreatorAction;
  overdue: boolean;
  paused: boolean;
};

export type DirSort = "gmv" | "attention" | "name" | "video";
export type Directory = { rows: DirRow[]; total: number; counts: Record<CreatorStatus | "all", number>; dataEnd: string | null };

const STATUS_ORDER: CreatorStatus[] = ["Silent", "Slipping", "Winner", "Rising", "Quiet", "Posted", "Waiting", "New", "Steady", "Paused"];
const inList = (xs: string[]) => sql.join(xs.map((x) => sql`${x}`), sql`, `);

/**
 * The affiliate directory: every creator we hold records for, one card each, with a line per product they received a sample of
 * (orders from video / LIVE, GMV, videos posted and the last one) and a one-word status + action.
 * Sales are valid orders (cancelled and returned excluded) from all uploaded data; "last 28 days" ends at the latest order we hold.
 * Product figures are per PRODUCT (all its sizes/variations together) and never counted twice.
 */
export async function getAffiliateDirectory(opts: { q: string; status: CreatorStatus | ""; sort: DirSort; samples?: "with" | "none" | "all"; page: number; size: number }): Promise<Directory> {
  const [refRow] = await rows<{ d: string | null }>(sql`select to_char(max(created_at), 'YYYY-MM-DD') as d from order_lines`);
  const ref = refRow?.d ?? null;
  const s28 = ref ? addDaysISO(ref, -27) : null;
  const p28s = ref ? addDaysISO(ref, -55) : null;
  const p28e = ref ? addDaysISO(ref, -28) : null;

  const known = await rows<{ c: string }>(sql`
    select distinct creator as c from order_lines where creator is not null and creator <> '(unknown)'
    union select distinct creator from samples where creator is not null
    union select username from creators where source = 'manual'`);
  const rel = await loadRelationships(known.map((k) => k.c));
  for (const [u, r] of await loadRelationships()) rel.set(u, r);

  const sales = ref
    ? await rows<{ creator: string; gmv_all: number; gmv28: number; prev28: number; ov: number; ol: number }>(sql`
        select al.creator,
          coalesce(sum(al.pay) filter (where al.valid), 0)::float8 as gmv_all,
          coalesce(sum(al.pay) filter (where al.valid and al.created_at::date between ${s28}::date and ${ref}::date), 0)::float8 as gmv28,
          coalesce(sum(al.pay) filter (where al.valid and al.created_at::date between ${p28s}::date and ${p28e}::date), 0)::float8 as prev28,
          (count(distinct al.order_id) filter (where al.valid and al.content_type = 'Video'))::int as ov,
          (count(distinct al.order_id) filter (where al.valid and al.content_type = 'Livestream'))::int as ol
        from ${AL} where al.creator is not null and al.creator <> '(unknown)' group by al.creator`)
    : [];
  const vids28 = ref
    ? await rows<{ creator: string; n: number }>(sql`select creator, count(distinct content_id)::int as n from content_items where kind = 'video' and posted_at::date between ${s28}::date and ${ref}::date group by creator`)
    : [];
  const smp = await rows<{ creator: string; sent: number; waiting: number; not_posted: number; posted: number }>(sql`
    select creator, count(*)::int as sent, (count(*) filter (where coalesce(result_override, result) in ('in_window', 'in_transit')))::int as waiting,
      (count(*) filter (where coalesce(result_override, result) = 'not_posted'))::int as not_posted,
      (count(*) filter (where coalesce(result_override, result) in ('posted_video', 'did_live')))::int as posted
    from samples where source = 'orders' and creator is not null and coalesce(order_status, '') <> 'Canceled' group by creator`);

  const sBy = new Map(sales.map((x) => [x.creator, x]));
  const vBy = new Map(vids28.map((x) => [x.creator, x.n]));
  const mBy = new Map(smp.map((x) => [x.creator, x]));
  const winner = winnerThreshold(sales.map((x) => x.gmv28));

  type Slim = { hasSample: boolean; username: string; gmvAll: number; status: CreatorStatus; action: CreatorAction; overdue: boolean; paused: boolean; ov: number; ol: number; v28: number };
  const all: Slim[] = [...rel.values()].map((r) => {
    const s = sBy.get(r.username);
    const m = mBy.get(r.username);
    const st = creatorStatus({
      paused: r.status === "paused",
      gmv28: s?.gmv28 ?? 0, prev28: s?.prev28 ?? 0, gmvAll: s?.gmv_all ?? 0, videos28: vBy.get(r.username) ?? 0, winnerGmv: winner,
      samples: { sent: m?.sent ?? 0, waiting: m?.waiting ?? 0, notPosted: m?.not_posted ?? 0, posted: m?.posted ?? 0 },
    });
    return { hasSample: (m?.sent ?? 0) > 0, username: r.username, gmvAll: s?.gmv_all ?? 0, status: st.status, action: st.action, overdue: r.overdue, paused: r.status === "paused", ov: s?.ov ?? 0, ol: s?.ol ?? 0, v28: vBy.get(r.username) ?? 0 };
  });
  const counts = { all: all.length } as Directory["counts"];
  for (const k of STATUS_ORDER) counts[k] = all.filter((a) => a.status === k).length;

  const q = opts.q.trim().toLowerCase().replace(/^@/, "");
  const sm = opts.samples ?? "all";
  const list = all.filter((a) => (!q || a.username.toLowerCase().includes(q)) && (!opts.status || a.status === opts.status) && (sm === "all" || (sm === "with") === a.hasSample));
  list.sort((a, b) => {
    if (opts.sort === "name") return a.username.localeCompare(b.username);
    if (opts.sort === "video") return b.v28 - a.v28 || b.gmvAll - a.gmvAll || a.username.localeCompare(b.username);
    if (opts.sort === "attention") return Number(b.overdue) - Number(a.overdue) || STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || b.gmvAll - a.gmvAll || a.username.localeCompare(b.username);
    return b.gmvAll - a.gmvAll || a.username.localeCompare(b.username);
  });
  const total = list.length;
  const page = list.slice((opts.page - 1) * opts.size, opts.page * opts.size);
  const names = page.map((p) => p.username);
  if (!names.length) return { rows: [], total, counts, dataEnd: ref };

  const [contact, prodRows, salesP, vidsP] = await Promise.all([
    rows<{ username: string; phone: string | null; approach: string | null }>(sql`select username, phone, approach from creators where username in (${inList(names)})`),
    rows<{ creator: string; pid: string | null; name: string | null; skus: string[] }>(sql`
      select s.creator, s.product_id as pid,
        case when max(p.short_name) like '%…' then coalesce(max(k.name), max(p.short_name)) else coalesce(max(p.short_name), max(k.name), max(s.product_name), 'Sample') end as name,
        array_agg(distinct upper(s.seller_sku)) filter (where s.seller_sku is not null) as skus
      from samples s left join products p on p.product_id = s.product_id left join sku_items k on upper(k.sku) = upper(s.seller_sku)
      where s.source = 'orders' and s.creator in (${inList(names)}) and coalesce(s.order_status, '') <> 'Canceled'
      group by s.creator, s.product_id order by s.creator, min(s.approved_at)`),
    rows<{ creator: string; pid: string; ov: number; ol: number; ot: number; gmv: number }>(sql`
      select al.creator, al.product_id as pid,
        (count(distinct al.order_id) filter (where al.valid and al.content_type = 'Video'))::int as ov,
        (count(distinct al.order_id) filter (where al.valid and al.content_type = 'Livestream'))::int as ol,
        (count(distinct al.order_id) filter (where al.valid))::int as ot,
        coalesce(sum(al.pay) filter (where al.valid), 0)::float8 as gmv
      from ${AL} where al.creator in (${inList(names)}) group by al.creator, al.product_id`),
    rows<{ creator: string; pid: string; n: number; last: string | null; undated: number }>(sql`
      select ci.creator, pid, count(distinct ci.content_id)::int as n, to_char(max(ci.posted_at::date), 'YYYY-MM-DD') as last,
        (count(distinct ci.content_id) filter (where ci.posted_at is null))::int as undated
      from content_items ci cross join lateral unnest(ci.product_ids) as pid
      where ci.kind = 'video' and ci.creator in (${inList(names)}) group by ci.creator, pid`),
  ]);
  const cBy = new Map(contact.map((c) => [c.username, c]));
  const spBy = new Map(salesP.map((x) => [`${x.creator}|${x.pid}`, x]));
  const vpBy = new Map(vidsP.map((x) => [`${x.creator}|${x.pid}`, x]));

  return {
    total,
    counts,
    dataEnd: ref,
    rows: page.map((a): DirRow => {
      const c = cBy.get(a.username);
      const mine = prodRows.filter((p) => p.creator === a.username);
      const products: DirProduct[] = mine.map((p) => {
        const sp = p.pid ? spBy.get(`${a.username}|${p.pid}`) : undefined;
        const vp = p.pid ? vpBy.get(`${a.username}|${p.pid}`) : undefined;
        return { pid: p.pid, name: p.name ?? "Sample", skus: p.skus ?? [], ordersVideo: sp?.ov ?? 0, ordersLive: sp?.ol ?? 0, orders: sp?.ot ?? 0, gmv: sp?.gmv ?? 0, videos: vp?.n ?? 0, lastVideoOn: vp?.last ?? null, undatedVideos: vp?.undated ?? 0 };
      });
      const type = a.ov > 0 && a.ol > 0 ? "Video + LIVE" : a.ov > 0 ? "Video" : a.ol > 0 ? "LIVE" : c?.approach === "both" ? "Video + LIVE" : c?.approach === "live" ? "LIVE" : c?.approach === "video" ? "Video" : null;
      return { username: a.username, type, phone: c?.phone ?? null, products, gmvAll: a.gmvAll, status: a.status, action: a.action, overdue: a.overdue, paused: a.paused };
    }),
  };
}

export { STATUS_ORDER };
