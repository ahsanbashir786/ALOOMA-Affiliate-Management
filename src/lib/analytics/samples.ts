import "server-only";
import { sql } from "drizzle-orm";
import type { Period } from "@/lib/period-core";
import { pickSnapshot, type SnapshotRef } from "./snapshots";
import { getOwnAccounts } from "./settings";
import { rows, safeDiv, textArr } from "./sql";

export type SampleRow = {
  username: string;
  contentGmv: number;
  requested: number;
  shipped: number;
  postingRate: number;
  videos: number;
  lives: number;
  roi45: number;
  roi90: number;
  orderGmv: number;
};

export type SampleReport = {
  snapshot: SnapshotRef;
  rows: SampleRow[];
  totals: { creators: number; requested: number; shipped: number; posted: number; noContent: number; contentGmv: number; avgRoi45: number; avgRoi90: number; breakeven: number };
  roiBuckets: { label: string; n: number }[];
};

export async function getSampleReport(period: Period): Promise<SampleReport | null> {
  const snapshot = await pickSnapshot("sample_analysis", period.start, period.end);
  if (!snapshot) return null;
  const own = await getOwnAccounts();
  const data = await rows<{
    username: string; content_gmv: number; requested: number; shipped: number; rate: number; v: number; l: number;
    roi45: number; roi90: number; gmv: number;
  }>(sql`
    select s.username, s.content_gmv, s.requested, s.shipped, s.posting_rate as rate, s.videos_with_samples as v,
           s.live_with_samples as l, s.roi45, s.roi90,
           coalesce((select sum(a.payment_amount) from order_lines a
                     where a.creator = s.username and a.created_at >= ${snapshot.start}::date and a.created_at < (${snapshot.end}::date + 1)),0)::float8 as gmv
    from sample_snapshots s
    where s.upload_id = ${snapshot.uploadId} and s.username <> all(${textArr(own)})`);
  const list: SampleRow[] = data.map((d) => ({
    username: d.username, contentGmv: d.content_gmv, requested: d.requested, shipped: d.shipped, postingRate: d.rate,
    videos: d.v, lives: d.l, roi45: d.roi45, roi90: d.roi90, orderGmv: d.gmv,
  }));
  const shipped = list.filter((r) => r.shipped > 0);
  const posted = shipped.filter((r) => r.videos + r.lives > 0);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const buckets = [
    { label: "No return (ROI 0)", n: shipped.filter((r) => r.roi45 <= 0).length },
    { label: "Below break-even (0–1)", n: shipped.filter((r) => r.roi45 > 0 && r.roi45 < 1).length },
    { label: "1–3×", n: shipped.filter((r) => r.roi45 >= 1 && r.roi45 < 3).length },
    { label: "3× or more", n: shipped.filter((r) => r.roi45 >= 3).length },
  ];
  return {
    snapshot,
    rows: list,
    totals: {
      creators: list.length,
      requested: list.reduce((a, r) => a + r.requested, 0),
      shipped: list.reduce((a, r) => a + r.shipped, 0),
      posted: posted.length,
      noContent: shipped.length - posted.length,
      contentGmv: list.reduce((a, r) => a + r.contentGmv, 0),
      avgRoi45: avg(shipped.map((r) => r.roi45)),
      avgRoi90: avg(shipped.map((r) => r.roi90)),
      breakeven: safeDiv(shipped.filter((r) => r.roi45 >= 1).length, shipped.length),
    },
    roiBuckets: buckets,
  };
}
