// Pure unit tests for the insight maths (no database). Run: npx tsx scripts/test-insights.ts
import { changePct, holtForecast, unusualPoints } from "../src/lib/insights/series";

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && detail ? `  → ${detail}` : ""}`);
};

check("too little history → no forecast (honest empty state)", holtForecast([5, 6, 7], 4) === null);
const rising = holtForecast([10, 12, 14, 16, 18, 20, 22, 24], 4)!;
check("a steady rise is forecast to keep rising", rising.points[3].value > rising.points[0].value && Math.abs(rising.points[0].value - 26) < 1.5, JSON.stringify(rising.points));
check("a perfectly steady line has a narrow range", rising.points[0].high - rising.points[0].low < 1);
const flat = holtForecast([50, 50, 50, 50, 50, 50, 50, 50], 3)!;
check("a flat series stays flat", flat.points.every((p) => Math.abs(p.value - 50) < 0.5));
const noisy = holtForecast([10, 30, 5, 40, 8, 35, 12, 28], 3)!;
check("noisy history gives a wider range than steady history", noisy.points[0].high - noisy.points[0].low > rising.points[0].high - rising.points[0].low);
check("the range widens further into the future", noisy.points[2].high - noisy.points[2].low > noisy.points[0].high - noisy.points[0].low);
const falling = holtForecast([30, 20, 10, 5, 2, 1, 0, 0], 6)!;
check("forecast is never negative", falling.points.every((p) => p.value >= 0 && p.low >= 0));

const base = Array.from({ length: 40 }, (_, i) => 100 + (i % 5));
check("no unusual points in a calm series", unusualPoints(base).length === 0);
const spiky = [...base.slice(0, 35), 400, ...base.slice(36)];
const flags = unusualPoints(spiky);
check("a sudden spike is flagged on the right day", flags.length === 1 && flags[0].index === 35 && flags[0].z > 2.5, JSON.stringify(flags));
check("a short history flags nothing (no guessing)", unusualPoints([1, 2, 3, 100], 28).length === 0);
check("a flat history with no spread flags nothing", unusualPoints(Array(40).fill(7)).length === 0);

check("change % compares the last n periods with the n before", Math.round(changePct([1, 1, 1, 1, 2, 2, 2, 2], 4)!) === 100);
check("change % is null when the earlier total is zero or history is short", changePct([0, 0, 1, 1], 2) === null && changePct([1, 2, 3], 2) === null);

check("change % works with an odd, shorter history by using the largest equal halves", Math.round(changePct([1, 1, 1, 2, 2, 2], 3)!) === 100 && changePct([1, 2], 0) === null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
