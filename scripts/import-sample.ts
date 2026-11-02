// Imports every .xlsx in ./sample-data (dev convenience). Usage: npm run import:sample
import { readdirSync } from "node:fs";
import path from "node:path";
import { importFromPath } from "../src/lib/ingest/service";
import { sql } from "../src/db";

async function main() {
  const dir = path.resolve(process.argv[2] ?? "sample-data");
  const files = readdirSync(dir).filter((f) => f.endsWith(".xlsx")).sort();
  // Orders first so the data window is known when guessing other periods' year.
  files.sort((a, b) => Number(/Affilates|Affiliate/i.test(b)) - Number(/Affilates|Affiliate/i.test(a)));

  for (const f of files) {
    const t0 = Date.now();
    try {
      const r = await importFromPath(path.join(dir, f));
      console.log(
        `✓ ${r.kind.padEnd(22)} ${String(r.imported).padStart(6)} rows (skipped ${r.skipped}, replaced ${r.replacedUploads}) ${((Date.now() - t0) / 1000).toFixed(1)}s  ${f}`,
      );
    } catch (e) {
      console.error(`✗ ${f}: ${e instanceof Error ? e.message : e}`);
    }
  }
  await sql.end();
}
main();
