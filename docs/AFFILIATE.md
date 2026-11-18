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

## Actions (`/affiliate/actions`)
One next action per creator, worked out live from the same rows as Affiliate Data (nothing is copied or stored, so it cannot double count). If a creator has something to do on several products, the product worth the most is shown, with "+N more products".
Ranked by the sales the action could bring (28 days), from measured numbers: Push = two more posts at her own sales per post, capped at her 28-day sales · Reward = one more post · Coach (slipping) and Revive (slipping) = win back the drop · Revive (quiet) = a typical active month · Chase and Coach (posted, no sale) = the usual sampled seller × how often a sampled creator sells. New creators (Approach) come last, and are held while the Sample Guard is high.
Recording a contact (the creator panel, "I contacted them") writes a staff event. A contacted creator waits 14 days under "Waiting For Result".

## Team (`/affiliate/team`)
Live: contacts today and this week, an activity log (undone items crossed out), per person.
Result: each contact is judged when 14 days have passed. Sales in the 14 days from the contact against the 14 days before, set against creators nobody contacted over the same days (only creators who were selling before count). The gap, in percentage points, is the effect of the work, per person and per action type.
Tests: `scripts/test-affiliate-actions.ts`, `scripts/test-affiliate-outcomes.ts`.
