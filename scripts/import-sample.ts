// Imports every .xlsx in a folder (dev convenience). Usage: npm run import:sample -- ./path/to/exports
import { readdirSync } from "node:fs";
import path from "node:path";
import { importFromPath } from "../src/lib/ingest/service";
import { refreshSamples } from "../src/lib/samples/service";
import { generateActions } from "../src/lib/analytics/recommendations";
import { sql } from "../src/db";

// SKU lists first (names for samples), orders next (they set the data window
// used to guess report years), the staff sheet last (matches against everything).
const rank = (f: string) =>
  /Staff/i.test(f) ? 4 : /SKU|BOM/i.test(f) ? 0 : /Affilates|Affiliate/i.test(f) ? 1 : /^Orders/i.test(f) ? 2 : 3;

async function main() {
  const dir = path.resolve(process.argv[2] ?? "sample-data");
  const files = readdirSync(dir).filter((f) => f.endsWith(".xlsx")).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));

  for (const f of files) {
    const t0 = Date.now();
    try {
      const r = await importFromPath(path.join(dir, f));
      console.log(
        `✓ ${r.kind.padEnd(22)} ${String(r.imported).padStart(6)} rows (skipped ${r.skipped}, replaced ${r.replacedUploads}) ${((Date.now() - t0) / 1000).toFixed(1)}s  ${f}`,
      );
      for (const n of r.notes) console.log(`    ${n}`);
    } catch (e) {
      console.error(`✗ ${f}: ${e instanceof Error ? e.message : e}`);
    }
  }
  const s = await refreshSamples();
  console.log(`Samples: ${s.matched} buyers matched to creators.`);
  const a = await generateActions();
  console.log(`Actions: ${a.created} new of ${a.total} recommendations.`);
  await sql.end();
}
main();
