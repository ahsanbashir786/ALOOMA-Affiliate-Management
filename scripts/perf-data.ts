// Times the heavy data loaders (no cache), so a change can be measured before and after.
//   DATABASE_URL=... SWR_OFF=1 npx tsx --conditions=react-server scripts/perf-data.ts
import { loadCreatorRows } from "@/lib/creators/load";
import { analyseProducts } from "@/lib/products/analysis";
import { loadDashboard } from "@/lib/affiliate/dashboard";
import { loadContent } from "@/lib/affiliate/content-load";
import { addDaysISO, todayKL } from "@/lib/time";

const time = async (label: string, f: () => Promise<unknown>) => { const t = Date.now(); await f(); console.log(`${label.padEnd(34)} ${((Date.now() - t) / 1000).toFixed(2)} s`); };
(async () => {
  const end = todayKL(), r7 = { start: addDaysISO(end, -6), end }, r90 = { start: addDaysISO(end, -89), end };
  await time("creators, all time", () => loadCreatorRows());
  await time("creators, last 7 days", () => loadCreatorRows({ range: r7 }));
  await time("creators, last 90 days", () => loadCreatorRows({ range: r90 }));
  await time("products, default", () => analyseProducts());
  await time("products, last 90 days", () => analyseProducts(r90));
  await time("command, last 28 days", () => loadDashboard(undefined));
  await time("command, last 90 days", () => loadDashboard(r90));
  await time("content", () => loadContent());
  process.exit(0);
})();
