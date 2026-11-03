// Prints what each feature produces from the data currently in the database (used for the import dependency audit).
// Usage: DATABASE_URL=... tsx --conditions=react-server scripts/audit-probe.ts
import { sql as pg } from "../src/db";
import { computePeriod } from "../src/lib/period-core";
import { analyse } from "../src/lib/analytics/recommendations";
import { kpisFor, getVideoAgeMix, getSourceMix } from "../src/lib/analytics/overview";
import { getPostingInsights } from "../src/lib/analytics/content";
import { getOrderHealth } from "../src/lib/analytics/orders";
import { refreshSamples } from "../src/lib/samples/service";
import { getSampleScorecard, getSampleTotals } from "../src/lib/samples/analysis";
import { queryAffiliates } from "../src/lib/affiliates/service";
import { getSampleReport } from "../src/lib/analytics/samples";

async function main() {
  const [b] = await pg`select to_char(min(created_at),'YYYY-MM-DD') mn, to_char(max(created_at),'YYYY-MM-DD') mx from order_lines`;
  const bounds = { min: b.mn ?? "2026-01-01", max: b.mx ?? "2026-01-01", hasData: !!b.mn };
  const period = computePeriod(bounds, { range: "28d" });
  const out: Record<string, unknown> = {};
  const count = <T,>(xs: T[], f: (x: T) => boolean) => xs.filter(f).length;

  const k = await kpisFor(period.start, period.end, []);
  out["overview.affiliate_gmv"] = Math.round(k.gmv);
  out["overview.cancel_rate_pct"] = +(k.cancelRate * 100).toFixed(1);

  const a = await analyse(period);
  const seg: Record<string, number> = {};
  for (const c of a.classified) seg[c.segment ?? "none"] = (seg[c.segment ?? "none"] ?? 0) + 1;
  out["segments"] = seg;
  out["creators.with_followers"] = count(a.classified, (c) => c.followers != null);
  out["creators.with_videos_per_week"] = count(a.classified, (c) => c.vpw != null);
  out["creators.with_views"] = count(a.classified, (c) => c.views != null);
  out["creators.type_known"] = count(a.classified, (c) => c.contentType != null);
  out["nonsellers.untapped_or_sample_no_post"] = a.nonSellers.length;

  const s = await refreshSamples();
  out["samples.matched_buyers"] = s.matched;
  const t = await getSampleTotals();
  out["samples.total"] = t.sent;
  out["samples.delivered"] = t.delivered;
  const sc = await getSampleScorecard();
  const v: Record<string, number> = {};
  for (const r of sc.rows) v[r.verdict] = (v[r.verdict] ?? 0) + 1;
  out["samples.verdicts"] = v;
  const res = await pg`select coalesce(result_override,result) r, count(*)::int n from samples group by 1 order by 1`;
  out["samples.results"] = Object.fromEntries(res.map((r) => [r.r, r.n]));

  const age = await getVideoAgeMix(period);
  out["content.video_age_total_gmv"] = Math.round(age.total);
  const ins = await getPostingInsights(period);
  out["content.posting_times_videos"] = ins?.sample ?? 0;

  const mix = await getSourceMix(period);
  out["overview.shop_wide_mix"] = mix.hasShopData;
  const oh = await getOrderHealth(period);
  out["orders.page_has_data"] = oh.hasData;
  const prod = await pg`select count(*)::int n, count(*) filter (where short_name is not null)::int named from products`;
  out["products.named"] = prod[0].named;

  const act = await queryAffiliates({ scope: "active" }, "gmv", "desc", 1, 0);
  const all = await queryAffiliates({ scope: "everyone" }, "gmv", "desc", 1, 0);
  out["affiliates.active"] = act.total;
  out["affiliates.everyone"] = all.total;
  const rep = await getSampleReport(period);
  out["samples.tiktok_report_available"] = !!rep;
  const live = await pg`select count(distinct creator)::int n from order_lines where content_type = 'Livestream'`;
  out["live.creators_from_orders"] = live[0].n;
  const lt = await pg`select coalesce(sum(live_streams),0)::int n from creator_txn_snapshots`;
  out["live.streams_counted_from_transaction_report"] = lt[0].n;

  console.log(JSON.stringify(out));
  await pg.end();
}
main();
