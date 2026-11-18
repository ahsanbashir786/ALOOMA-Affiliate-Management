# Affiliate Command And Creator Lifecycle

Goal: grow affiliate **sales**. Profit lives in its own part of the system and is not used here.

## The levers
Sales (28 days) = **Creators Who Sell** × **Posts Per Seller** × **Sales Per Post**.
`explainChange` (src/lib/affiliate/stages.ts) splits the change since the 28 days before between the three, using logarithmic shares, so the three effects add up exactly to the change in sales.
Sales that come from older videos show up in Sales Per Post.

## The journey (one stage per creator, the furthest reached)
Found → Sample Requested → Sample On The Way → Delivered, Not Posted → Posted, No Sale → Selling → Star, and Went Quiet on the side.
`stageOf` reads the same statuses as Affiliate Data, so the numbers agree.

## Sample guard
Counts creator-and-product pairs where a sample was sent and has not turned into sales: delivered not posted, posted no sale, sold once then quiet, plus requests waiting. It says "Fix Old Samples First" when 25% or more of sent samples are in the first two groups.

## Goal
A 28-day sales goal. Set it on the Command screen (stored in settings as `affiliate_target`); without one it is the average of the last three 28-day periods.

## Screens
`/affiliate` (Command) and `/affiliate/lifecycle?stage=…`, both under the Affiliate Data permission. Execution Plan, Affiliate Data and Product Analysis stay until their replacements are built (see the plan in the project notes).

## Tests
`npx tsx --conditions=react-server scripts/test-affiliate-stages.ts` (levers and stages) · `node scripts/e2e-affiliate.js` (browser, app on :3100).
