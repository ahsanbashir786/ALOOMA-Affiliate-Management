// Validates the importers and derived screens against REAL TikTok export files, in an isolated database.
//   DATABASE_URL=postgres://…/affiliate_real npx tsx --conditions=react-server scripts/test-real-exports.ts /path/to/exports
// Refuses to run unless the database name ends in _test or _real (it wipes it first). Never point it at production.
import { readdirSync } from "node:fs";
import path from "node:path";

const url = process.env.DATABASE_URL ?? "";
if (!/\/[^/]*_(test|real)(\?.*)?$/.test(url)) {
  console.error("Refusing to run: DATABASE_URL must point to a database whose name ends in _test or _real.");
  process.exit(2);
}
const dir = process.argv[2];
if (!dir) {
  console.error("Usage: test-real-exports.ts <folder with .xlsx exports>");
  process.exit(2);
}
let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && detail ? `  → ${detail}` : ""}`);
};
const rank = (f: string) => (/Staff/i.test(f) ? 4 : /SKU|BOM/i.test(f) ? 0 : /Affilates|Affiliate/i.test(f) ? 1 : /^Orders/i.test(f) ? 2 : 3);

async function main() {
  const { sql: client, db } = await import("../src/db");
  const { sql } = await import("drizzle-orm");
  const { importFromPath } = await import("../src/lib/ingest/service");
  const { refreshSamples } = await import("../src/lib/samples/service");
  const { generateActions } = await import("../src/lib/analytics/recommendations");
  const { getToday } = await import("../src/lib/workflow/today");
  const { getProgress } = await import("../src/lib/workflow/progress");
  const { getOwnerDecisions } = await import("../src/lib/workflow/records");
  const one = async <R extends Record<string, unknown>>(q: ReturnType<typeof sql>) => ((await db.execute(q)) as unknown as R[])[0];

  const tabs = (await db.execute(sql`select tablename from pg_tables where schemaname = 'public' and tablename not like '\\_\\_%' and tablename <> 'schema_migrations'`)) as unknown as { tablename: string }[];
  await db.execute(sql.raw(`truncate ${tabs.map((t) => `"${t.tablename}"`).join(", ")} restart identity cascade`));
  const files = readdirSync(dir).filter((f) => f.endsWith(".xlsx")).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  check(`found ${files.length} real export files`, files.length >= 3);

  const first: Record<string, { added: number; updated: number; rejected: number; conflicts: number }> = {};
  for (const f of files) {
    try {
      const r = await importFromPath(path.join(dir, f));
      first[f] = { added: r.added ?? r.imported, updated: r.updated ?? 0, rejected: Object.values((r as { rejected?: Record<string, number> }).rejected ?? {}).reduce((a, b) => a + b, 0), conflicts: (r as { conflicts?: number }).conflicts ?? 0 };
      check(`imports ${f} (${r.kind}: ${first[f].added} added, ${first[f].rejected} rejected)`, true);
    } catch (e) {
      check(`imports ${f}`, false, e instanceof Error ? e.message : String(e));
    }
  }
  await refreshSamples();
  await generateActions();

  const totals = async () => ({
    ol: (await one<{ n: number; g: number }>(sql`select count(*)::int n, coalesce(sum(payment_amount),0)::float8 g from order_lines`)),
    so: (await one<{ n: number }>(sql`select count(*)::int n from shop_order_lines`)).n,
    sm: (await one<{ n: number }>(sql`select count(*)::int n from samples`)).n,
    vd: (await one<{ n: number }>(sql`select count(*)::int n from videos`)).n,
    rc: (await one<{ n: number }>(sql`select count(*)::int n from recommendations`)).n,
  });
  const t1 = await totals();
  check("real data loaded: orders, shop orders, samples, videos", t1.ol.n > 1000 && t1.so > 1000 && t1.sm > 0 && t1.vd > 100, JSON.stringify(t1));

  // second pass: the same files again must change nothing
  const second: string[] = [];
  for (const f of files.filter((x) => /Affilates|^Orders|Video_Analysis/i.test(x))) {
    const r = await importFromPath(path.join(dir, f));
    if (/Affilates|^Orders/i.test(f) && ((r.added ?? 0) !== 0 || (r as { conflicts?: number }).conflicts)) second.push(`${f}: added ${r.added}, conflicts ${(r as { conflicts?: number }).conflicts}`);
  }
  await refreshSamples();
  await generateActions();
  const t2 = await totals();
  check("re-uploading the same order files adds nothing and raises no conflicts", second.length === 0, second.join("; "));
  check("repeat uploads and refreshes leave every total unchanged (no duplicates)", JSON.stringify(t1) === JSON.stringify(t2), JSON.stringify({ t1, t2 }));

  // sales attribution reconciles
  const rec = await one<{ a: number; b: number; dup: number }>(sql`
    select (select coalesce(sum(pay) filter (where basis = 'content'),0) from sample_sales)::float8 as a,
           (select coalesce(sum(content_gmv),0) from samples)::float8 as b,
           (select count(*) from (select order_id, sku_id from sample_sales group by 1,2 having count(*) > 1) x)::int as dup`);
  check("sample sales reconcile with the single attribution table, no sale credited twice", Math.abs(rec.a - rec.b) < 0.01 && rec.dup === 0, JSON.stringify(rec));
  const dupRec = await one<{ n: number }>(sql`select count(*)::int n from (select username, type from recommendations group by 1,2 having count(*) > 1) x`);
  check("refreshing recommendations never duplicates them", dupRec.n === 0);

  // screens run on real data
  const today = await getToday("focus");
  check(`Today's Work builds on real data (${today.counts.focus} in focus, ${today.counts.development} opportunities, ${today.sampleExceptions.unmatched} unmatched samples)`, today.rows.length >= 0);
  const pg = await getProgress(28);
  check("Progress builds on real data and labels coverage honestly", !!pg.sales.comparison && (pg.sales.comparison.current !== null || !!pg.sales.comparison.withheld));
  await getOwnerDecisions();
  check("owner decisions build on real data", true);
  console.log(`\n${pass} passed, ${fail} failed`);
  await client.end();
  process.exit(fail ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
