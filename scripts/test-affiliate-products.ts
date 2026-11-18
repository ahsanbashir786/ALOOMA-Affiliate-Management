import assert from "node:assert/strict";
import { fewCreators, judgeProduct } from "@/lib/affiliate/product-levers";

// sales fell: fewer videos posted is the main cause
const a = judgeProduct({ sales: { now: 800, prev: 1000 }, sellers: { now: 50, prev: 52 }, videos: { now: 60, prev: 100 } });
assert.equal(a.main?.key, "posts"); assert.equal(a.lever, "content"); assert.match(a.headline, /Fewer videos/);
assert.ok(Math.abs(a.moves!.reduce((n, m) => n + m.effect, 0) - -200) < 1e-6, "the three effects add up to the change");
// sales fell because creators left
const b = judgeProduct({ sales: { now: 600, prev: 1000 }, sellers: { now: 20, prev: 50 }, videos: { now: 40, prev: 40 } });
assert.equal(b.main?.key, "sellers"); assert.equal(b.lever, "creators");
// each video sells less
const c = judgeProduct({ sales: { now: 500, prev: 1000 }, sellers: { now: 30, prev: 30 }, videos: { now: 60, prev: 60 } });
assert.equal(c.main?.key, "perPost"); assert.equal(c.lever, "quality");
// growth names what gained most and asks for no action
const d = judgeProduct({ sales: { now: 1500, prev: 1000 }, sellers: { now: 60, prev: 40 }, videos: { now: 80, prev: 78 } });
assert.equal(d.main?.key, "sellers"); assert.equal(d.lever, null); assert.match(d.headline, /More creators/);
// steady band
assert.match(judgeProduct({ sales: { now: 1020, prev: 1000 }, sellers: { now: 10, prev: 10 }, videos: { now: 10, prev: 10 } }).headline, /Steady/);
// flat overall, but two big moves cancel out: say so and still point at the lever that lost
const f2 = judgeProduct({ sales: { now: 990, prev: 1000 }, sellers: { now: 50, prev: 50 }, videos: { now: 100, prev: 50 } });
assert.match(f2.headline, /cancelled out/); assert.equal(f2.main?.key, "perPost"); assert.equal(f2.lever, "quality");
// no video list for the period: still says what it can
const e = judgeProduct({ sales: { now: 500, prev: 1000 }, sellers: { now: 20, prev: 40 }, videos: { now: null, prev: null } });
assert.equal(e.moves, null); assert.match(e.headline, /Fewer creators/); assert.equal(e.lever, "creators");
// nothing at all
assert.match(judgeProduct({ sales: { now: 0, prev: 0 }, sellers: { now: 0, prev: 0 }, videos: { now: 0, prev: 0 } }).headline, /No affiliate sales/);
// few creators
assert.equal(fewCreators(5, [5, 40, 60, 80, 100]), true); assert.equal(fewCreators(50, [5, 40, 60, 80, 100]), false); assert.equal(fewCreators(0, [0, 0]), false);
console.log("affiliate products: all passed");
