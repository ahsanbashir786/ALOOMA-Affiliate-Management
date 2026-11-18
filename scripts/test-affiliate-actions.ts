import assert from "node:assert/strict";
import { baselineOf, buildQueue, expectedGain, splitQueue } from "@/lib/affiliate/actions";

type L = Record<string, unknown>;
const line = (o: L) => ({ pid: "p1", name: "Quilt", noSample: false, sampled: true, status: "Steady", action: "Push", gmv: 1000, gmv28: 400, prev28: 300, videos28: 1, doneOn: null, sampleSkus: [], reason: "r", ...o });
const row = (u: string, lines: L[], extra: L = {}, gmvAll = 1000, paused = false) => ({ username: u, lines: lines.map(line), allLines: lines.map(line), gmvAll, paused, extra: { gmv28: 0, firstOn: "2026-01-01", lastSaleOn: "2026-11-10", ...extra } }) as never;

const b = baselineOf([row("a", [{}], { gmv28: 400 }), row("b", [{ status: "Silent", action: "Chase", gmv28: 0 }], { gmv28: 0 }), row("c", [{}], { gmv28: 200 }), row("d", [{ sampled: false }], { gmv28: 0 })]);
assert.equal(b.sellRate, 2 / 3, "2 of the 3 sampled creators sell");
assert.equal(b.avgSeller28, 300);

assert.equal(expectedGain(row("x", [{}]), line({ action: "Push", gmv28: 400, videos28: 1 }) as never, b), 400, "Push is capped at 28-day sales");
assert.equal(expectedGain(row("x", [{}]), line({ action: "Push", gmv28: 400, videos28: 4 }) as never, b), 200, "two more posts at 100 each");
assert.equal(expectedGain(row("x", [{}]), line({ action: "Reward", gmv28: 400, videos28: 4 }) as never, b), 100);
assert.equal(expectedGain(row("x", [{}]), line({ action: "Coach", status: "Slipping", gmv28: 100, prev28: 400 }) as never, b), 300, "win back the drop");
assert.equal(expectedGain(row("x", [{}]), line({ action: "Chase", status: "Silent" }) as never, b), 200, "2/3 × 300");
assert.equal(expectedGain(row("x", [{}]), line({ action: "Approach" }) as never, b), 0);

// one item per creator: the most valuable line wins, the rest are counted
const q = buildQueue([
  row("multi", [{ pid: "p1", action: "Push", gmv28: 100, videos28: 1 }, { pid: "p2", action: "Push", gmv28: 900, videos28: 1 }], { gmv28: 1000 }),
  row("quiet", [{ status: "Quiet", action: "Revive", gmv: 600, gmv28: 0 }], { gmv28: 0, firstOn: "2026-05-01", lastSaleOn: "2026-06-26" }, 600),
  row("paused", [{ action: "Push" }], {}, 1, true),
  row("fine", [{ action: "Keep" }]),
  row("new", [{ status: "New", action: "Approach", sampled: false, gmv: 0, gmv28: 0 }], {}, 0),
], "2026-11-17", b);
assert.deepEqual(q.map((i) => i.username).sort(), ["multi", "new", "quiet"], "paused and nothing-to-do creators are left out");
const multi = q.find((i) => i.username === "multi")!;
assert.equal(multi.pid, "p2"); assert.equal(multi.also, 1); assert.equal(multi.lever, "content");
assert.equal(q.find((i) => i.username === "quiet")!.lever, "creators");

// splitting: contacted lately waits; new creators are always last, and held when the guard is high
const items = q.map((i) => (i.username === "quiet" ? { ...i, doneOn: "2026-11-10" } : i));
const s = splitQueue(items, "2026-11-17", false);
assert.deepEqual(s.todo.map((i) => i.username), ["multi", "new"]);
assert.deepEqual(s.waiting.map((i) => i.username), ["quiet"]);
const h = splitQueue(items, "2026-11-17", true);
assert.deepEqual(h.todo.map((i) => i.username), ["multi"]); assert.deepEqual(h.held.map((i) => i.username), ["new"]);
const old = splitQueue(q.map((i) => (i.username === "quiet" ? { ...i, doneOn: "2026-10-01" } : i)), "2026-11-17", false);
assert.equal(old.waiting.length, 0, "an old contact no longer waits");
console.log("affiliate actions: all passed");
