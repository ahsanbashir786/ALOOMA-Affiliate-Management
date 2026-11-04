import "server-only";
import { sql } from "drizzle-orm";
import { AL, rows } from "@/lib/analytics/sql";
import { creatorStatus, explainStatus, NEEDS_ACTION, winnerThreshold, type CreatorAction, type CreatorStatus, type StatusInput } from "@/lib/affiliates/status";
import { addDaysISO, fmtDayLabel, todayKL } from "@/lib/time";
import { listingName } from "@/lib/affiliates/product-name";
import { loadRelationships } from "./relationships";

/** One sampled product of a creator: its own sales, videos, status and action. */
export type DirLine = {
  pid: string | null;
  name: string;
  skus: string[];
  /** No sample was sent: this line carries the creator's overall status. */
  noSample: boolean;
  ordersVideo: number;
  ordersLive: number;
  orders: number;
  gmvVideo: number;
  gmvLive: number;
  gmv: number;
  videos: number;
  videos28: number;
  lastVideoOn: string | null;
  lastVideoLabel: string | null;
  undatedVideos: number;
  status: CreatorStatus;
  action: CreatorAction;
  reason: string;
};

export type DirRow = {
  username: string;
  type: "Video" | "LIVE" | "Video + LIVE" | null;
  phone: string | null;
  lines: DirLine[];
  /** Every sampled product, even when filters hide some lines (used for the all-products message). */
  allLines: DirLine[];
  gmvAll: number;
  overdue: boolean;
  paused: boolean;
  lastContactedOn: string | null;
};

export type DirSort = "gmv" | "lately" | "attention" | "video" | "stale" | "name";
export type DirOpts = {
  q?: string;
  samples?: "with" | "none" | "all";
  product?: string;
  status?: CreatorStatus | "";
  /** A single action, or "todo" for every action that needs work. */
  action?: CreatorAction | "todo" | "";
  type?: "video" | "live" | "both" | "";
  wa?: "yes" | "no" | "";
  contact?: "never" | "recent" | "overdue" | "";
  sort?: DirSort;
  /** Period shown in the table's orders, GMV and videos (status always uses the latest 28 days). */
  range?: { start: string; end: string };
  page?: number;
  size?: number;
};
export type Directory = {
  rows: DirRow[];
  total: number;
  totalLines: number;
  /** Lines per action / status under the other filters (so the chips show what clicking them would give). */
  actionCounts: Record<CreatorAction | "todo", number>;
  statusCounts: Record<CreatorStatus, number>;
  products: { pid: string; name: string; creators: number }[];
  dataEnd: string | null;
};

export const STATUS_ORDER: CreatorStatus[] = ["Silent", "Slipping", "Winner", "Rising", "Quiet", "Posted", "Waiting", "New", "Steady", "Paused"];
export const ACTION_ORDER: CreatorAction[] = ["Chase", "Push", "Reward", "Revive", "Coach", "Approach", "Resume", "Wait", "Keep"];
/** Action urgency for "needs attention first". */
const ATTN: Record<CreatorAction, number> = { Chase: 0, Push: 1, Revive: 2, Reward: 3, Coach: 4, Approach: 5, Resume: 6, Wait: 7, Keep: 8 };
const MIN_PRODUCT_SELLERS = 5;

/**
 * The affiliate data table: every creator we hold records for, with a line per product they received a sample of.
 * Each line has its OWN status and action (from that product's sales, videos and sample), so a creator can be a winner on one
 * product and silent on another. Sales are valid orders (cancelled and returned excluded) from all uploaded data; "lately" is the latest
 * 28 days ending at the latest order we hold. Product figures are per PRODUCT (all sizes together), never counted twice.
 */
export async function getAffiliateDirectory(opts: DirOpts): Promise<Directory> {
  const [refRow] = await rows<{ d: string | null }>(sql`select to_char(max(created_at), 'YYYY-MM-DD') as d from order_lines`);
  const ref = refRow?.d ?? null;
  const s28 = ref ? addDaysISO(ref, -27) : null;
  const p28s = ref ? addDaysISO(ref, -55) : null;
  const p28e = ref ? addDaysISO(ref, -28) : null;

  const inR = (col: ReturnType<typeof sql>) => (opts.range ? sql`${col} between ${opts.range.start}::date and ${opts.range.end}::date` : sql`true`);

  const known = await rows<{ c: string }>(sql`
    select distinct creator as c from order_lines where creator is not null and creator <> '(unknown)'
    union select distinct creator from samples where creator is not null
    union select username from creators where source = 'manual'`);
  const rel = await loadRelationships(known.map((k) => k.c));
  for (const [u, r] of await loadRelationships()) rel.set(u, r);

  type CSale = { creator: string; gmv_all: number; gmv28: number; prev28: number; ov: number; ol: number };
  type PSale = { creator: string; pid: string; ov: number; ol: number; ot: number; gv: number; gl: number; gmv: number; gmv28: number; prev28: number };
  const [csales, psales, vids28, contact, prodRows, vidsP] = await Promise.all([
    ref
      ? rows<CSale>(sql`
          select al.creator,
            coalesce(sum(al.pay) filter (where al.valid and ${inR(sql`al.created_at::date`)}), 0)::float8 as gmv_all,
            coalesce(sum(al.pay) filter (where al.valid and al.created_at::date between ${s28}::date and ${ref}::date), 0)::float8 as gmv28,
            coalesce(sum(al.pay) filter (where al.valid and al.created_at::date between ${p28s}::date and ${p28e}::date), 0)::float8 as prev28,
            (count(distinct al.order_id) filter (where al.valid and ${inR(sql`al.created_at::date`)} and al.content_type = 'Video'))::int as ov,
            (count(distinct al.order_id) filter (where al.valid and ${inR(sql`al.created_at::date`)} and al.content_type = 'Livestream'))::int as ol
          from ${AL} where al.creator is not null and al.creator <> '(unknown)' group by al.creator`)
      : Promise.resolve([] as CSale[]),
    ref
      ? rows<PSale>(sql`
          select al.creator, al.product_id as pid,
            (count(distinct al.order_id) filter (where al.valid and ${inR(sql`al.created_at::date`)} and al.content_type = 'Video'))::int as ov,
            (count(distinct al.order_id) filter (where al.valid and ${inR(sql`al.created_at::date`)} and al.content_type = 'Livestream'))::int as ol,
            (count(distinct al.order_id) filter (where al.valid and ${inR(sql`al.created_at::date`)}))::int as ot,
            coalesce(sum(al.pay) filter (where al.valid and ${inR(sql`al.created_at::date`)} and al.content_type = 'Video'), 0)::float8 as gv,
            coalesce(sum(al.pay) filter (where al.valid and ${inR(sql`al.created_at::date`)} and al.content_type = 'Livestream'), 0)::float8 as gl,
            coalesce(sum(al.pay) filter (where al.valid and ${inR(sql`al.created_at::date`)}), 0)::float8 as gmv,
            coalesce(sum(al.pay) filter (where al.valid and al.created_at::date between ${s28}::date and ${ref}::date), 0)::float8 as gmv28,
            coalesce(sum(al.pay) filter (where al.valid and al.created_at::date between ${p28s}::date and ${p28e}::date), 0)::float8 as prev28
          from ${AL} where al.creator is not null and al.product_id is not null group by al.creator, al.product_id`)
      : Promise.resolve([] as PSale[]),
    ref
      ? rows<{ creator: string; n: number }>(sql`select creator, count(distinct content_id)::int as n from content_items where kind = 'video' and posted_at::date between ${s28}::date and ${ref}::date group by creator`)
      : Promise.resolve([] as { creator: string; n: number }[]),
    rows<{ username: string; phone: string | null; approach: string | null }>(sql`select username, phone, approach from creators`),
    rows<{ creator: string; pid: string | null; short: string | null; full: string | null; sku_name: string | null; smp_name: string | null; skus: string[] | null; sent: number; waiting: number; not_posted: number; posted: number }>(sql`
      select s.creator, s.product_id as pid,
        max(p.short_name) as short, max(p.name) as full, max(k.name) as sku_name, max(s.product_name) as smp_name,
        array_agg(distinct upper(s.seller_sku)) filter (where s.seller_sku is not null) as skus,
        count(*)::int as sent,
        (count(*) filter (where coalesce(s.result_override, s.result) in ('in_window', 'in_transit')))::int as waiting,
        (count(*) filter (where coalesce(s.result_override, s.result) = 'not_posted'))::int as not_posted,
        (count(*) filter (where coalesce(s.result_override, s.result) in ('posted_video', 'did_live')))::int as posted
      from samples s left join products p on p.product_id = s.product_id left join sku_items k on upper(k.sku) = upper(s.seller_sku)
      where s.source = 'orders' and s.creator is not null and coalesce(s.order_status, '') <> 'Canceled'
      group by s.creator, s.product_id order by s.creator, min(s.approved_at)`),
    rows<{ creator: string; pid: string; n: number; n28: number; last: string | null; undated: number }>(sql`
      select ci.creator, pid, (count(distinct ci.content_id) filter (where ${inR(sql`ci.posted_at::date`)}))::int as n,
        (count(distinct ci.content_id) filter (where ${ref ? sql`ci.posted_at::date between ${s28}::date and ${ref}::date` : sql`false`}))::int as n28,
        to_char(max(ci.posted_at::date) filter (where ${inR(sql`ci.posted_at::date`)}), 'YYYY-MM-DD') as last,
        (count(distinct ci.content_id) filter (where ci.posted_at is null))::int as undated
      from content_items ci cross join lateral unnest(ci.product_ids) as pid
      where ci.kind = 'video' and ci.creator is not null group by ci.creator, pid`),
  ]);

  const cBy = new Map(csales.map((x) => [x.creator, x]));
  const pBy = new Map(psales.map((x) => [`${x.creator}|${x.pid}`, x]));
  const v28By = new Map(vids28.map((x) => [x.creator, x.n]));
  const vpBy = new Map(vidsP.map((x) => [`${x.creator}|${x.pid}`, x]));
    const infoBy = new Map(contact.map((c) => [c.username, c]));
  const prodBy = new Map<string, typeof prodRows>();
  for (const p of prodRows) (prodBy.get(p.creator) ?? prodBy.set(p.creator, []).get(p.creator)!).push(p);

  // Winner bars: per product (top 10% of that product's sellers) when enough creators sell it, otherwise the overall bar.
  const globalWinner = winnerThreshold(csales.map((x) => x.gmv28));
  const byProduct = new Map<string, number[]>();
  for (const x of psales) (byProduct.get(x.pid) ?? byProduct.set(x.pid, []).get(x.pid)!).push(x.gmv28);
  const winnerFor = new Map<string, number>();
  for (const [pid, xs] of byProduct) winnerFor.set(pid, xs.filter((v) => v > 0).length >= MIN_PRODUCT_SELLERS ? winnerThreshold(xs) : globalWinner);

  const all: DirRow[] = [...rel.values()].map((r) => {
    const cs = cBy.get(r.username);
    const info = infoBy.get(r.username);
    const paused = r.status === "paused";
    const mine = prodBy.get(r.username) ?? [];
    const lines: DirLine[] = [];
    for (const p of mine) {
      const sp = p.pid ? pBy.get(`${r.username}|${p.pid}`) : undefined;
      const vp = p.pid ? vpBy.get(`${r.username}|${p.pid}`) : undefined;
      const input: StatusInput = {
        paused,
        gmv28: sp?.gmv28 ?? 0, prev28: sp?.prev28 ?? 0, gmvAll: sp?.gmv ?? 0, videos28: vp?.n28 ?? 0,
        winnerGmv: (p.pid && winnerFor.get(p.pid)) || globalWinner,
        samples: { sent: p.sent, waiting: p.waiting, notPosted: p.not_posted, posted: p.posted },
      };
      const st = creatorStatus(input);
      lines.push({
        pid: p.pid, name: listingName(p.short, p.full, p.sku_name ?? p.smp_name), skus: p.skus ?? [], noSample: false,
        ordersVideo: sp?.ov ?? 0, ordersLive: sp?.ol ?? 0, orders: sp?.ot ?? 0, gmvVideo: sp?.gv ?? 0, gmvLive: sp?.gl ?? 0, gmv: sp?.gmv ?? 0,
        videos: vp?.n ?? 0, videos28: vp?.n28 ?? 0, lastVideoOn: vp?.last ?? null, lastVideoLabel: vp?.last ? fmtDayLabel(vp.last) : null, undatedVideos: vp?.undated ?? 0,
        status: st.status, action: st.action, reason: explainStatus(input, st.status),
      });
    }
    if (!lines.length) {
      // No sample: one line with the creator's overall status.
      const input: StatusInput = {
        paused, gmv28: cs?.gmv28 ?? 0, prev28: cs?.prev28 ?? 0, gmvAll: cs?.gmv_all ?? 0, videos28: v28By.get(r.username) ?? 0, winnerGmv: globalWinner,
        samples: { sent: 0, waiting: 0, notPosted: 0, posted: 0 },
      };
      const st = creatorStatus(input);
      lines.push({
        pid: null, name: "No sample sent", skus: [], noSample: true, ordersVideo: cs?.ov ?? 0, ordersLive: cs?.ol ?? 0, orders: 0,
        gmvVideo: 0, gmvLive: 0, gmv: 0, videos: 0, videos28: v28By.get(r.username) ?? 0, lastVideoOn: null, lastVideoLabel: null, undatedVideos: 0,
        status: st.status, action: st.action, reason: explainStatus(input, st.status),
      });
    }
    const ov = cs?.ov ?? 0, ol = cs?.ol ?? 0;
    const type = ov > 0 && ol > 0 ? "Video + LIVE" : ov > 0 ? "Video" : ol > 0 ? "LIVE" : info?.approach === "both" ? "Video + LIVE" : info?.approach === "live" ? "LIVE" : info?.approach === "video" ? "Video" : null;
    return { username: r.username, type, phone: info?.phone ?? null, lines, allLines: lines, gmvAll: cs?.gmv_all ?? 0, overdue: r.overdue, paused, lastContactedOn: r.lastContactedOn };
  });

  const q = (opts.q ?? "").trim().toLowerCase().replace(/^@/, "");
  const sm = opts.samples ?? "all";
  const today = todayKL();
  const weekAgo = addDaysISO(today, -7);
  const creatorOk = (a: DirRow) =>
    (!q || a.username.toLowerCase().includes(q)) &&
    (sm === "all" || (sm === "with") === !a.lines[0].noSample) &&
    (!opts.type || (opts.type === "video" ? a.type === "Video" : opts.type === "live" ? a.type === "LIVE" : a.type === "Video + LIVE")) &&
    (!opts.wa || (opts.wa === "yes") === !!a.phone) &&
    (!opts.contact ||
      (opts.contact === "never" ? !a.lastContactedOn : opts.contact === "recent" ? !!a.lastContactedOn && a.lastContactedOn >= weekAgo : a.overdue));
  const lineOk = (l: DirLine, skip?: "status" | "action") =>
    (!opts.product || l.pid === opts.product) &&
    (skip === "status" || !opts.status || l.status === opts.status) &&
    (skip === "action" || !opts.action || (opts.action === "todo" ? NEEDS_ACTION.includes(l.action) : l.action === opts.action));

  // Chip counts: lines that pass every OTHER filter.
  const actionCounts = { todo: 0 } as Directory["actionCounts"];
  for (const a of ACTION_ORDER) actionCounts[a] = 0;
  const statusCounts = {} as Directory["statusCounts"];
  for (const s of STATUS_ORDER) statusCounts[s] = 0;
  for (const a of all) {
    if (!creatorOk(a)) continue;
    for (const l of a.lines) {
      if (lineOk(l, "action")) {
        actionCounts[l.action]++;
        if (NEEDS_ACTION.includes(l.action)) actionCounts.todo++;
      }
      if (lineOk(l, "status")) statusCounts[l.status]++;
    }
  }

  // Products to filter by: every sampled product, most creators first.
  const pm = new Map<string, { pid: string; name: string; creators: number }>();
  for (const a of all) for (const l of a.lines) if (l.pid) {
    const e = pm.get(l.pid) ?? { pid: l.pid, name: l.name, creators: 0 };
    e.creators++;
    pm.set(l.pid, e);
  }
  const products = [...pm.values()].sort((x, y) => y.creators - x.creators || x.name.localeCompare(y.name));

  // Keep only the matching lines of the matching creators.
  const filtered: DirRow[] = [];
  for (const a of all) {
    if (!creatorOk(a)) continue;
    const ls = a.lines.filter((l) => lineOk(l));
    if (ls.length) filtered.push({ ...a, lines: ls, allLines: a.lines });
  }
  const lately = (a: DirRow) => a.lines.reduce((m, l) => Math.max(m, l.videos28), 0);
  const lastVid = (a: DirRow) => a.lines.reduce((m, l) => (l.lastVideoOn && l.lastVideoOn > m ? l.lastVideoOn : m), "");
  const best = (a: DirRow) => Math.min(...a.lines.map((l) => ATTN[l.action]));
  filtered.sort((a, b) => {
    switch (opts.sort) {
      case "name": return a.username.localeCompare(b.username);
      case "video": return lately(b) - lately(a) || b.gmvAll - a.gmvAll || a.username.localeCompare(b.username);
      case "stale": {
        // Longest since the last video first; creators with no video at all come first.
        const x = lastVid(a), y = lastVid(b);
        return x.localeCompare(y) || b.gmvAll - a.gmvAll || a.username.localeCompare(b.username);
      }
      case "lately": return (cBy.get(b.username)?.gmv28 ?? 0) - (cBy.get(a.username)?.gmv28 ?? 0) || a.username.localeCompare(b.username);
      case "attention": return Number(b.overdue) - Number(a.overdue) || best(a) - best(b) || b.gmvAll - a.gmvAll || a.username.localeCompare(b.username);
      default: return b.gmvAll - a.gmvAll || a.username.localeCompare(b.username);
    }
  });

  const size = opts.size ?? 15;
  const page = Math.max(1, opts.page ?? 1);
  return {
    rows: filtered.slice((page - 1) * size, page * size),
    total: filtered.length,
    totalLines: filtered.reduce((n, a) => n + a.lines.length, 0),
    actionCounts,
    statusCounts,
    products,
    dataEnd: ref,
  };
}
