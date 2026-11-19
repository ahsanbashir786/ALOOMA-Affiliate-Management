import assert from "node:assert/strict";
import { evaluate, preferredRootIds, rootOf, type Category } from "@/lib/affiliate/eligibility";

const cats: Category[] = [
  { id: "600001", parent_id: "0", local_name: "Home Supplies" }, { id: "601450", parent_id: "0", local_name: "Textiles & Soft Furnishings" },
  { id: "600024", parent_id: "0", local_name: "Home Improvement" }, { id: "824328", parent_id: "0", local_name: "Muslim Fashion" },
  { id: "600942", parent_id: "0", local_name: "Beauty & Personal Care" }, { id: "601352", parent_id: "0", local_name: "Fashion Accessories" },
  { id: "700000", parent_id: "0", local_name: "Phones & Electronics" }, { id: "851848", parent_id: "600001", local_name: "Bedding" }, { id: "999", parent_id: "851848", local_name: "Quilts" },
];
const pref = preferredRootIds(cats);
assert.deepEqual(pref.ids.sort(), ["600001", "600024", "600942", "601352", "601450", "824328"], "the owner's six categories are found despite spelling, plural and & differences");
assert.deepEqual(pref.missing, []);
assert.deepEqual(preferredRootIds(cats.filter((c) => c.id !== "824328")).missing, ["Muslim Fashion"], "a category TikTok does not list is reported");
assert.equal(rootOf("999", cats), "600001", "a deep category belongs to its top-level one");

const base = { level: 5, categoryIds: ["600001"] };
assert.equal(evaluate(base, pref.ids, cats).status, "eligible");
assert.equal(evaluate({ ...base, categoryIds: ["851848"] }, pref.ids, cats).status, "eligible", "a sub-category counts through its top-level category");
const low = evaluate({ ...base, level: 3 }, pref.ids, cats);
assert.equal(low.status, "not"); assert.deepEqual(low.reasons, ["Level 3, needs 5 or higher"]);
assert.equal(evaluate({ ...base, level: 5 }, pref.ids, cats).status, "eligible", "level 5 is accepted");
const wrongCat = evaluate({ ...base, categoryIds: ["700000"] }, pref.ids, cats);
assert.equal(wrongCat.status, "not"); assert.deepEqual(wrongCat.reasons, ["Main categories are not in your list"]);
assert.equal(evaluate({ ...base, level: null }, pref.ids, cats).status, "unknown", "a level TikTok does not show is not 'not eligible'");
assert.equal(evaluate({ level: 6, categoryIds: [] }, pref.ids, cats).status, "unknown");
assert.equal(evaluate({ ...base, blocked: true }, pref.ids, cats).status, "not");
assert.equal(evaluate(null, pref.ids, cats).status, "unknown");
assert.equal(evaluate({ level: 2, categoryIds: ["700000"] }, pref.ids, cats).reasons.length, 2, "both reasons are given");

// good signs only order creators, they never make a level-3 creator eligible
const strong = evaluate({ ...base, officialRecommend: true, pps: 4.6, rating: 4.5, postRate: 0.8, sampleScore: 85, risingStar: true }, pref.ids, cats);
const plain = evaluate(base, pref.ids, cats);
assert.ok(strong.fit! > plain.fit!, "good signs raise the fit score"); assert.ok(strong.good.includes("Recommended by TikTok"));
const trap = evaluate({ ...base, level: 3, officialRecommend: true, pps: 5 }, pref.ids, cats);
assert.equal(trap.status, "not"); assert.ok(trap.fit! <= 40, "a not-eligible creator never scores high");
assert.ok(evaluate({ ...base, invited90d: true }, pref.ids, cats).fit! < plain.fit!, "a recent invitation lowers the order");
assert.ok(evaluate({ ...base, officialRecommend: true, pps: 5, rating: 5, postRate: 100, sampleScore: 100, level: 9 }, pref.ids, cats).fit! <= 100);
console.log("affiliate eligibility: all passed");
