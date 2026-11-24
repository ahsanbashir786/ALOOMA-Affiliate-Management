# Affiliate Command And Creator Lifecycle

Goal: grow affiliate **sales**. Profit lives in its own part of the system and is not used here.

## The levers
Sales (28 days) = **Active Sellers** × **Posts Per Seller** × **Sales Per Post**.
`explainChange` (src/lib/affiliate/stages.ts) splits the change since the 28 days before between the three, using logarithmic shares, so the three effects add up exactly to the change in sales.
Sales that come from older videos show up in Sales Per Post.

## The journey (one stage per creator, the furthest reached)
Found → Sample Requested → Sample On The Way → Delivered, Not Posted → Posted, No Sale → Selling → Star, and Went Quiet on the side.
`stageOf` reads the same statuses as Affiliate Data, so the numbers agree.

## Sample guard
Counts creator-and-product pairs where a sample was sent and has not turned into sales: delivered not posted, posted no sale, sold once then quiet, plus requests waiting. It says "Fix Old Samples First" when 25% or more of sent samples are in the first two groups.

## Goal
Removed at this stage: Command shows sales against the previous period of the same length, with no goal to set.

## Screens
`/affiliate` (Command) and `/affiliate/lifecycle?stage=…`, both under the Affiliate Data permission. Execution Plan, Affiliate Data and Product Analysis stay until their replacements are built (see the plan in the project notes).

## Tests
`npx tsx --conditions=react-server scripts/test-affiliate-stages.ts` (levers and stages) · `node scripts/e2e-affiliate.js` (browser, app on :3100).

## Actions (`/affiliate/actions`)
One next action per creator, worked out live from the same rows as Affiliate Data (nothing is copied or stored, so it cannot double count). If a creator has something to do on several products, the product worth the most is shown, with "+N more products".
Ranked by the sales the action could bring (28 days), from measured numbers: Push = two more posts at her own sales per post, capped at her 28-day sales · Reward = one more post · Coach (slipping) and Revive (slipping) = win back the drop · Revive (quiet) = a typical active month · Chase and Coach (posted, no sale) = the usual sampled seller × how often a sampled creator sells. New creators (Approach) come last, and are held while the Sample Status is high.
Recording a contact (the creator panel, "I contacted them") writes a staff event. A contacted creator waits 14 days under "Waiting For Result".

## Team (`/affiliate/team`)
Live: contacts today and this week, an activity log (undone items crossed out), per person.
Result: each contact is judged when 14 days have passed. Sales in the 14 days from the contact against the 14 days before, set against creators nobody contacted over the same days (only creators who were selling before count). The gap, in percentage points, is the effect of the work, per person and per action type.
Tests: `scripts/test-affiliate-actions.ts`, `scripts/test-affiliate-outcomes.ts`.

## Content (`/affiliate/content`)
Each video is judged on its own affiliate sales (valid order lines, by video id): the last 14 days against the 14 days before, ending on the latest day of data. Thresholds are in `src/lib/affiliate/content.ts`.
- **Heating Up**: RM 100 or more in the last 14 days and at least 30% above the 14 days before → boost now.
- **Fading**: RM 150 or more in the 14 days before and less than half of that now → ask the creator for a fresh video.
- **Stopped Selling**: RM 300 or more in its life, last sale within 90 days, nothing in the last 28 days → ask for a replacement.
- **Ready For GMV Max**: GMV Max's own groups (Proven Left Alone, Hidden Gem, Selling Low Spend, Worth Exploring) that are not boosted now, and that still sell (RM 50 or more in 28 days) or are proven (RM 300 or more in life). The video ids are the same in both systems (`ads_creative_daily.creative_id` = `tt_videos.video_id`), so the two screens always agree.
The age mix shows sales (28 days) by how old the video is; a high share from videos over 30 days means sales will fall as they fade.
Test: `scripts/test-affiliate-content.ts`.

## Products (`/affiliate/products`)
Each of the 13 products with the same three levers, from the Product Analysis numbers: **creators who sold it**, **videos posted that link it**, **sales per video**. `judgeProduct` (src/lib/affiliate/product-levers.ts) splits the change in the product's sales between them (the three effects add up to the change) and writes one plain sentence: what moved and what to do. Flat sales that hide two big moves in opposite directions are flagged ("two levers cancelled out"). "Short Of Creators" marks a product with fewer than half the median number of sellers; this is where new-creator outreach will start (Slice 5).
Each row links to Actions and Content filtered to that product (`?product=`), and to the full Product Analysis page. Execution Plan, Affiliate Data and Product Analysis are unchanged and stay until you approve their removal.
Test: `scripts/test-affiliate-products.ts`.

## Outreach (`/affiliate/outreach`)
The front door of the creator journey as a pipeline: **Suggested → Sample Requested → Approved → Shipped → Delivered → Posted**. After Posted the creator continues in Creator Lifecycle.
- **Suggested** has two sources. *Give More Samples* is our own data: creators selling now with nothing outstanding (no sample still unposted or on the way), best sellers first, with the products they were never offered. *New Creators From TikTok* is TikTok's Creator Marketplace search (`POST /affiliate_seller/202608/marketplace_creators/search`, read only, last 30 days of data). It is TikTok's list, not ours. If the API does not return the same "recommended" list as the Seller Center portal, a link opens Seller Center.
- **Sample requests** come from the existing sync (`tt_sample_requests`) and are placed by `requestStage`. A request that TikTok says cannot be approved, or that has expired, is not offered. Each card shows the creator's history (`historyOf`): sales, samples before, how many were not posted.
- **Approve / Reject** calls `POST /affiliate_seller/202507/sample_applications/{id}/review` and needs: (1) the **Approve Samples** permission (never given to a read-only login), (2) the owner's switch on the Outreach screen (**off by default**), (3) TikTok having granted `seller.affiliate_collaboration.write` (the connection stores the granted scopes). Both buttons ask first, because **TikTok cannot undo a decision**; a rejection needs one of TikTok's four reasons. After TikTok accepts, our copy is updated at once and a note (who, creator, product, application) is written to the Team activity log. If TikTok refuses, its own message is shown and nothing is marked done.
- Tests: `scripts/test-affiliate-outreach.ts` (logic), `scripts/test-affiliate-outreach-api.ts` (the TikTok calls against a pretend TikTok), `scripts/e2e-affiliate.js` (screen).
- **Not yet proven on your shop:** a real approval, and whether Malaysia returns creators from the marketplace search. The first real approval should be done with someone watching.

## Outreach eligibility rules (who is worth inviting or approving)
Set by the owner, in `src/lib/affiliate/eligibility.ts`:
1. The creator's **main categories** must include one of: Home Supplies, Textile & Soft Furnishing, Home Improvement, Muslim Fashion, Beauty and Personal Care, Fashion Accessories. The names are matched against TikTok's own top-level categories (`GET /product/202309/categories`, kept for 7 days).
2. The **creator level must be 5 or higher** (`creator_level` from TikTok's Creator Marketplace profile).
Where TikTok does not show a level or categories (it can be empty for some regions), the creator is **Not Sure**, never rejected. A creator blocked by your shop is Not Eligible.
Other things TikTok shows only **order** the list (fit score 0–100) and never decide eligibility: official recommended tag, rising star, fast growing, promotion score (PPS), sellers' rating, post rate after a sample, sample score, fulfilment score. Creators invited in the last 90 days are left out of the TikTok search (`affiliate_data.not_invited_l90_days`) and lowered in the order.
- **TikTok list:** the search asks only for your six categories (`category[].parent_category_id`); level and the extra signs come from `creator_profile` in the answer. Not Eligible creators are hidden behind a "Show them" switch.
- **Sample requests:** TikTok's sample-request data has no level or category, so the **Check Eligibility** button asks `GET /affiliate_seller/202608/marketplace_creators/{creator_open_id}` for fifteen waiting requesters at a time (paced, because of TikTok's shared speed limit) and keeps the answer for a week in `tt_creator_profiles`. Each request then shows Eligible / Not Eligible (with the reason, e.g. "Level 3, needs 5 or higher") / Not Sure / Not Checked, and can be filtered. Approving a Not Eligible request still works but warns first.
- The sample-request sync now stores TikTok's `creator_open_id` (needed for the profile call). Requests synced before this update get it at the next sync.
- Tests: `scripts/test-affiliate-eligibility.ts`, and the profile/category calls in `scripts/test-affiliate-outreach-api.ts`.

## Affiliate Data now has the stages (Creator Lifecycle is still there for now)
Affiliate Data gained, without losing anything it had: a **stage strip** (All Stages, Known Not Sampled, Sample Requested, Sample On The Way, Delivered Not Posted, Posted No Sale, Selling, Star, Went Quiet) with counts, a **Stage line** under each creator ("Stage: Went Quiet · 115 days"), and a **Stuck Longest First** sort. The stages are the same `stageOf` logic as Creator Lifecycle, so the counts are identical (checked by `scripts/e2e-affiliate.js`). The stage filter also applies to the Excel export. Creator Lifecycle's "Open In Affiliate Data" link now opens the matching stage. The Lifecycle screen stays in the menu until the owner approves removing it.

## Creator Lifecycle was merged into Affiliate Data and Outreach
The Creator Lifecycle screen is gone from the menu (old links still work and land on the matching Affiliate Data stage). Its first five stages (sample requested, on the way, delivered…) belong to **Outreach**; its performance stages live in **Affiliate Data** as the stage strip, which shows the five stages after the sample arrives: Delivered Not Posted, Posted No Sale, Selling, Star, Went Quiet.
The Command screen's **Creator Journey** now starts with **Suggested To Invite**: new creators from TikTok's Creator Marketplace that meet the owner's rules (level 5 or higher, the six categories), including creators who never requested a sample. The count is what Outreach last found (kept in settings `outreach_suggested`), so Command never asks TikTok itself. The next cards go to Outreach (requested, on the way) or to Affiliate Data (the later stages). Early stages no longer show "sales, 28 days".
**Sample Status** (formerly Sample Guard) counts samples already sent that are not selling now: delivered not posted, posted no sale, sold once then quiet. The "Chase Idle Samples First" warning shows when 25% or more of all sent samples are in the first two groups. For a date range other than 28 days the goal is the 28-day goal × days ÷ 28.

## Affiliate Command is now a dashboard (replaces the waterfall and the three cards)
- **Four headline cards** with a 12-week trend line: Affiliate Sales, Active Creators (made a sale), New Videos Posted (all videos and LIVE sessions in the dates), Sales Per Video. Each shows the change against the same number of days just before.
- **Sales And New Videos, Week By Week**: weekly sales as an area line and new videos/LIVE as bars on the same weeks (two scales), with the chosen dates shaded.
- **Where Sales Come From**: each week's sales split by video age when it sold (same ages as Product Analysis: new ≤14 days, recent 15–30, old 31–60, very old 61+, LIVE, product cards), as 100% bars.
- **Creators By Stage**: from Suggested To Invite to Went Quiet, each row opens Outreach (first three) or Affiliate Data (the rest).
- **Health Check**: four questions (`healthChecks` in `src/lib/affiliate/dashboard-logic.ts`), each Good, Watch or Problem, with a button to Actions or Content, and one headline sentence. Sales: Good if down less than 5%, Watch to 15%, Problem beyond. Creators: Good to −3%, Watch to −10%. New videos: Good to −10%, Watch to −30%. Old videos: Good under 40% of video/LIVE sales from videos older than 30 days, Watch under 65%, Problem above.
- **Sample Status** stays (clickable counts, "Chase Idle Samples First" when 25% or more of sent samples are idle).
- **Dates**: data reaches only the latest synced day. If the chosen dates end later, the whole window moves back so "Last 7 days" is still 7 days of data (`resolveWindow`); the screen says so.
- Removed: the formula chart, the three cards, the goal, the plain-text explanation lines and the "creators hold samples" sentence.
Tests: `scripts/test-affiliate-dashboard.ts`, `scripts/e2e-affiliate.js`.

## Structure (restructure, phases 1-2)

- **One model** (`src/lib/affiliate/model.ts`): Stage, Next Step, Tier and Status (the reason). Creators with a next step = To Do + Held + Waiting, on every screen.
- **Three lists, linked.** Creators (Affiliate Data), Products and Content share the same numbers. A product opens its creators (`/creators?product=`), videos (`/affiliate/content?product=`) and full analysis; a video opens its product and creator; a creator panel opens their videos (`/affiliate/content?creator=`).
- **Products** carries everything Product Analysis shows (tags, sparkline, age mix, creators, new videos, converting, orders) plus the three levers and the actions. Product Analysis stays until it is approved for removal.
- **Actions** has two tabs: By Creator and By Product (the full Execution Plan board).
- **Affiliate Data filters**: Search, Product, Owner on top; everything else under More Filters.

## Actions: one queue (phase 4)

- **Today** (default) is one list: creator next steps, product actions (open Execution Plan tasks) and fading or stopped videos, biggest sales first. Overdue product actions come first. No daily cap: the whole list is the work.
- **One handler.** An owner picks "Handled By" (setting `affiliate_default_owner`). Everything without its own owner counts as theirs. The strip shows Done Today, Last 7 Days, Daily Average (14 days) and Left To Do with the days to clear at that pace. "Done" = creators contacted + product actions marked Done, by that person.
- **By Creator** and **By Product** keep every feature they had. Links with `lever`, `product` or `view` still open By Creator.

## Team: one record (phase 5)

Team and the Today strip count the same events: creators contacted from Actions (`staff_events`), creators ticked inside a product action (`ep_task_creators.contacted_at`, counted once if the same person contacted the same creator that day), and product actions marked Done (`ep_events`, status Done). Contacts of both kinds are judged 14 days later against creators nobody contacted. Old history is untouched.

## Clean-up (phase 6)

- Menu (Affiliates): Command, Outreach, Creators, Products, Content, Actions, Team. "Affiliate Data" is now **Creators**.
- `/execution` redirects to Actions › By Product. `/products` redirects to Products (tag, sort and dates kept). The product detail page `/products/[key]` stays.
- Permissions keep their keys. Products opens with `creators` or `products`; Actions with `creators` or `execution` (a role with only `execution` sees By Product). The system opens on Command.

## Look and feel: read at a glance

- Every page header carries its menu icon. Long explanations sit behind ⓘ, never as paragraphs.
- Headline numbers use one tile (`StatTile`): icon, short label, the number, a ▲▼ change pill, a few words or ⓘ, optional trend line.
- One icon per idea (`src/components/ui/icon-set.ts`): stages (Creators strip, Command funnel), next steps (Chase, Push, Reward…), work kinds (creator, product action, video), video lists (heating, fading, stopped, ready) and product tags.
