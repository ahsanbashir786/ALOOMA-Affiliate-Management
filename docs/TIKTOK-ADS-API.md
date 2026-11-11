# TikTok Ads (GMV Max) connection

Reads your **GMV Max** campaigns, creatives and daily results from **TikTok API for Business** (the "Marketing API"). It is a different service from TikTok Shop: its own portal, its own app, its own keys and its own login. For now it is **read-only**; the system cannot change anything in your ads.

## One-time setup

1. **App** in business-api.tiktok.com/portal → *My Apps*. Permissions (scope): Ad account information, Ads management (Campaign, Ad group, Ad, Change log, GMV Max…), Reporting, TikTok Shop, and the Creative management parts you asked for.
2. **Redirect URL** in the app: `http://localhost:3000/api/tiktok-ads/callback` for your PC. On the server use `https://YOUR-DOMAIN/api/tiktok-ads/callback`. **Settings → Connection → Ad Management → Redirect address** shows the exact address the system will send; it must be identical (no extra slash).
3. **Private settings.** Add these to the `.env` file (never paste the secret in chat, email or GitHub), then restart the app:
   ```
   TIKTOK_ADS_APP_ID=your app ID
   TIKTOK_ADS_APP_SECRET=your app secret
   ```
   `TIKTOK_ADS_REDIRECT_URI` is only needed if the address must differ from the website's own.
4. **Settings → Connection → Ad Management (GMV Max) → Connect TikTok Ads.** Log in with the TikTok For Business account that owns the ads and tick your ad account.
5. Press **Check Connection**. It asks TikTok for the ad accounts, the GMV Max shops, the campaigns and one week of results, and shows **which fields came back and what the first record looks like**. Nothing is saved.
6. Open **Data Sync → Ads Management** and press **Sync Now**.

Your TikTok Shop must be linked to the ad account in TikTok Ads Manager, otherwise GMV Max returns no shop and there is nothing to read.

## What is synced (Data Sync → Ads Management)

| Card | What it holds | Table |
|---|---|---|
| Ad Accounts | Name, currency, time zone, status of each ad account the login covers | `ads_advertisers` |
| Shops | The TikTok Shop(s) linked to each ad account for GMV Max | `ads_stores` |
| GMV Max Campaigns | Name, status, type (product / LIVE), budget, ROAS target, dates | `ads_campaigns` |
| Campaign Results | One row per campaign per day: cost, net cost, orders, sales (gross revenue), ROI, cost per order | `ads_campaign_daily` |
| Videos | Each GMV Max video of each shop: who made it (TikTok account), when, which product, authorization status and type, whether it can be boosted | `ads_videos` |
| Creative Boosts | The creative boosts (sessions) of every campaign that is on or spent money in the last two weeks: video, status, budget, schedule | `ads_boosts` |
| Product Results | One row per campaign, product and day: cost, orders, sales, ROI, cost per order, impressions, clicks, click rate, conversion rate | `ads_product_daily` |
| Creative Results | One row per campaign, product, video and day: the same numbers plus title, TikTok account, 2-second and 6-second view rates | `ads_creative_daily` |

Every row also keeps **TikTok's full answer** (`raw` column), so a field we did not map yet is never lost and can be added later without a new sync. The card's **What TikTok sent** shows the first record of the last good run.

## How the sync stays correct

| Point | How it works |
|---|---|
| Schedule | Off, every 30 min, 1 hour, 3 hours, 12 hours or daily (owner sets it). Runs inside the app. |
| Never duplicates | Rows are inserted or updated by their key; identical rows are left alone. Running twice changes nothing. |
| Restated numbers | TikTok adjusts ad numbers after the day ends. Every sync reads the **last 14 days** again, and once a day the **last 60 days**, so a corrected day is picked up. |
| First sync | Reads campaign and product results back **one year**, and video results back **about six months** (what Ads Manager keeps), in 30-day pieces, newest first. Campaign results stop after three empty months in a row. If TikTok keeps less, the note says where its history stops. **Re-Read History** repeats it. If TikTok refuses a window as too old, the note says where its history stops. |
| Steps in order | Accounts → shops → campaigns → results. If an early step fails (for example the login is refused), the later steps are skipped, not run on stale data. |
| One account failing | If TikTok refuses one ad account for its own reasons, the others still sync and the card says which was skipped. |
| Rate limit | The sync waits when TikTok says "too many requests" and tries again (up to six times); TikTok's own hiccups are retried three times. Sign-in problems are never retried. |
| Unreadable data | If TikTok sends result lines but none of the numbers can be read (a renamed field), the dataset **fails with the field names it saw** instead of saving empty rows. |
| Product and creative results | TikTok returns these only when the request **names the campaign** (and, for videos, the **product**). The sync therefore asks for the campaigns and products that spent money in each window, taken from Campaign Results, so no call is wasted. Product results go ten campaigns at a time (one at a time if TikTok refuses a list). |
| Extra numbers | Which optional numbers TikTok accepts (impressions, clicks, rates, title…) is found out once with one tiny request per name and remembered; the sync then asks only for names that work. **Re-Read History** checks again. |
| Dimensions | If TikTok refuses a dimension choice the system tries the next one and remembers the first that works; the card says which one it used. |
| Safe restarts | A restart marks any run left "running" as interrupted, so nothing waits forever. Already-saved data is untouched. |
| Time zone | Days are the days in the ad account's own time zone, as TikTok reports them. |
| Privacy | Ad data only. No customer data is involved. |

## TikTok calls used (from TikTok's own developer library)

| Purpose | Call |
|---|---|
| Ad accounts | `GET /oauth2/advertiser/get/`, `GET /advertiser/info/` |
| Shops | `GET /gmv_max/store/list/` |
| Campaigns | `GET /gmv_max/campaign/get/` (types `PRODUCT_GMV_MAX`, `LIVE_GMV_MAX`) |
| Results | `GET /gmv_max/report/get/` (filters `campaign_ids`, `item_group_ids`, `item_ids`) |
| Videos | `GET /gmv_max/video/get/` (needs the shop id and its Business Center id) |
| Boosts | `GET /campaign/gmv_max/session/list/` |
| Later: create / change / stop a boost | `POST /campaign/gmv_max/session/create/` (`advertiser_id`, `campaign_id`, `store_id`, `session` with `budget`, `product_list[{spu_id}]`, `item_id`, schedule), `…/update/`, `…/delete/` |

## The GMV Max screens (what they read)

**Date range.** One picker for the whole GMV Max section (quick choices Lifetime, Today, Yesterday, Last 7/14/30/90 days, This week, Last week, This month, Last month, or any two days on the calendar). It is kept in the address (`?range=30d` or `?range=custom&from=…&to=…`) and follows you from tab to tab. Each tab opens with its own choice when none is made: Ads Today and Campaign Health Last 7 days, Product Performance Last 30 days, Boost Picks, Creator Scoreboard and Boost Log Lifetime. The comparison is always the period of the same length just before (none for Lifetime). The Batch Planner has no picker. On Boost Picks the numbers follow the dates but the group of a video is always judged on all history. Code: `src/lib/ads/range.ts`, `src/components/ads/range-picker.tsx`.

| Screen | Reads | Rule |
|---|---|---|
| Ads Today | `ads_campaign_daily` | Latest day with results against the day before; last 7 and 30 days against the period before; alerts from Campaign Health and the video groups |
| Boost Picks | `ads_creative_daily` (all time), `tt_videos`, `ads_videos`, `ads_boosts`, Boost Log | One group per video and product, see below |
| Batch Planner | The ticked videos | Minimum total RM 35 for up to 10 videos (+RM 3.5 for each extra), split by ROI and orders. A plan only |
| Boost Log | `ads_boost_batches`, `ads_boost_batch_videos` (migration 0028) | Sales a day in the 7 days before the boost date against up to 7 days from it |
| Campaign Health | `ads_campaign_daily`, `ads_campaigns` | No Sales (spend 10+ and no orders), Stopped Spending (nothing in 3 days), ROI Dropped (under 70% of the period before), Watch, Healthy |
| Product Performance | `ads_product_daily`, `product_map` | Push More (ROI 15% above your average), Fix Or Pause (no orders, or ROI under 70% of your average), Hold |
| Creator Scoreboard | The video groups, by creator | All time |
| Video Detail | All of the above for one video | 60 days of spend and sales |

Video groups (`src/lib/ads/groups.ts`). Good ROI = your all-time ROI rounded up (at least 3) unless you type one; proven = 3 orders or more; stopped = no spend for more than 7 days, or TikTok says not delivering. All three can be changed on the screen.

| Group | Meaning | Boost? |
|---|---|---|
| Stopped While Selling | Good ROI and proven, but stopped | Yes |
| Sold, Then Dropped | Good ROI on 1 or 2 orders, then stopped | Yes |
| Selling, Low Spend | Good and running, but under half the typical 7-day spend | Yes |
| Never Started | No ad spend ever. Includes videos that sell on their own (Shop sync) and never appeared in the ads results | Yes |
| Winning Now | Good and well funded | Leave it |
| Fading | Good overall, but the last 7 days are under 60% of its own ROI | No |
| Wasting Money | RM 20+ spent at under half the good ROI | No |
| Blocked | TikTok will not boost it | No |
| Not Enough Proof | Too little to judge | No |

## Delivery status of a video (what can be boosted)

The creative-level report returns `creative_delivery_status` for each video. Values seen on your account: `DELIVERING`, `LEARNING`, `IN_QUEUE`, `NOT_DELIVERYING` (TikTok's own spelling), `NOT_ACTIVE`, `AUTHORIZATION_NEEDED`, `UNAVAILABLE`, `REJECTED` (and `EXCLUDED` in TikTok's documentation). TikTok's rule for a creative boost: the status cannot be `AUTHORIZATION_NEEDED`, `EXCLUDED`, `REJECTED` or `UNAVAILABLE`. The GMV Max screen leaves those videos out and says how many. The status is stored per video and day in `ads_creative_daily.delivery_status`; normal syncs read the last 14 days, so press **Re-Read History** once to fill older days.

## Creating a creative boost (built, off until the owner switches it on)

One video at a time, from the video page (`/ads/video/<id>`, panel "Boost This Video In TikTok", also reached by the Boost button in the Batch Planner). Batch boosts do not exist in TikTok's API, so batches are still made in TikTok Ads Manager.

| Step | What happens |
|---|---|
| Who | Only a role with the **Settings** permission (the owner). Anyone else sees why they cannot |
| Switch and limits | Settings, Connection, Ad Management, "Boost From The App": On or Off (default Off), most for one boost a day (default RM 30), most for all boosts started here a day (default RM 50; the budgets of boosts still running count, stopping frees them) |
| Checks before asking TikTok | Switch is On; budget within both limits; the video is in a Product GMV Max campaign that is not switched off; its TikTok status is not Authorization needed, Excluded, Rejected or Unavailable; no boost already running for it; not boosted in the last 90 seconds |
| Confirm | Tick "I understand this spends real money", then a confirm box with the amount, the days and the most it can spend |
| Call | `POST /campaign/gmv_max/session/create/` with `session.bid_type = CREATIVE_NO_BID`, `product_list = [{spu_id}]` (the product, our `product_id`), `item_id`, `budget`, and `schedule_type` `SCHEDULE_FROM_NOW` (until stopped) or `SCHEDULE_START_END` with an end time in UTC+0. Never retried by itself |
| Answer | TikTok's own message is shown as it is. The budget TikTok documents as a minimum is 10 (USD) a day; TikTok decides |
| Kept | Every try (done, refused, stopped) in `ads_boost_actions` with who, when, request and TikTok's answer, shown in Settings. A successful boost also enters the Boost Log |
| Stop | A Stop button next to a running boost: `POST /campaign/gmv_max/session/delete/` with `advertiser_id` and `session_id`. Stopping is always allowed for the owner, even when boosting is switched Off |

Not verified against your real account: whether your app's approved permissions include writing. If TikTok refuses, its message appears on the page.

## Checked against TikTok's own documentation (Nov 2026)

| Question | What TikTok's pages say |
|---|---|
| Exploration status (Outstanding / Performing / Underperforming / Calculating / Exploring) | **Not in the API.** The only status metric for a video is `creative_delivery_status` (In queue, Learning, Delivering, Not delivering, Authorization needed, Excluded, Unavailable, Rejected, Not active). No permission adds it. |
| Batch creative boost (several chosen videos, one budget) | **Not in the API.** A creative boost session is for one video (`item_id` required). No permission adds it. |
| Which videos a boost covers | `/campaign/gmv_max/session/get/` returns `item_id` only for single-video creative boosts. |
| Ended boosts | `/campaign/gmv_max/session/list/` lists **active** sessions only; ended ones are readable only by their id, so the sync keeps every session it has seen. |
| Video facts | Title, TikTok account name, authorization type (`tt_account_authorization_type`), content type and status come back only when the request names one campaign and one product (which the video sync does). |
| Video results | Only days with ad cost are returned. |

## Safety

| Point | How |
|---|---|
| Login | Stored encrypted in the database; the key is made from the app secret, so a copy of the database alone cannot use it. TikTok Ads logins do not expire; if TikTok stops accepting it, the screen says **Reconnect**. |
| Read-only | The system only reads. (Creating boosts from the app is a later step, with a spending limit and a confirm box.) |
| Who | Only roles with **Settings: Connection** can connect, check or disconnect. Roles with **Data Sync** can press Sync Now. |
| Off switch | **Disconnect** deletes the login. Synced data stays. |

## If something fails

| Message | Meaning / what to do |
|---|---|
| "Access token is invalid…" | TikTok no longer accepts the login. Press **Reconnect** in Settings. |
| "auth_code is invalid" | The connect link expired or was used twice. Press **Connect** again. |
| Redirect address mismatch on TikTok's page | The address in the TikTok app differs from the one shown in Settings. Make them identical. |
| "No GMV Max shop is linked…" | Link the TikTok Shop to the ad account in TikTok Ads Manager. |
| "none of the numbers … could be read. Fields sent: …" | TikTok renamed a field. Send the field names; the mapping is one line to change in `src/lib/tiktok-ads/map.ts`. |
| "Invalid dimension / metric" on creative or product results | TikTok does not allow that combination for your account. The sync tries the next one; if all fail the message is shown. |

Test: `npm run test:ads` (a pretend TikTok and a `*_test` database). Browser check: `node scripts/fake-ads-api.js`, start the app with the `TIKTOK_ADS_*` variables shown at the top of that file, then `node scripts/e2e-ads.js`.

## Not verified yet

The field and endpoint names for GMV Max were taken from TikTok's public documentation and developer libraries, not from a live account. **Check Connection** and the **What TikTok sent** boxes show the real answers on first use; if anything differs, only the small mapping in `src/lib/tiktok-ads/map.ts` and the endpoint list in `src/lib/tiktok-ads/sync.ts` need a change.
