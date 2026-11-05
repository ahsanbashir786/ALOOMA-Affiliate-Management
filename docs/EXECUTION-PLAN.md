# Execution Plan

The daily work screen (`/execution`). Products only shows numbers; this screen turns them into actions.
The system writes the actions from the product analysis, the team assigns, does and ticks them off.

## How actions are made (`src/lib/execution/rules.ts`)
Every product is read after each sync. A rule fires when its numbers say so, and writes one task with: the reason in numbers, a checklist, the creators to contact, the sales at stake, a priority and a due date.

| Category | Action | Fires when | Creators listed |
|---|---|---|---|
| Content | Ask for new videos | Few or fewer new videos, or under 30% of video/LIVE sales from new content | Every creator who sold it lately and made no new video, with their last video |
| Content | Brief creators on what works | Under 8% of new videos get 3+ orders in 14 days, or 10+ points worse | The 10 best videos ever, to learn from |
| Content | Refresh old videos | 60%+ of video/LIVE sales come from videos over 30 days old | Every creator who depends on old videos, with the exact old video and its link |
| Content | Promote best videos | 3+ videos sold RM 150+ | The creators of the 15 best videos (ask for the ad code) |
| Content | LIVE push | LIVE sales fell 25%+, or LIVE is under 10% of sales | Creators who sell through LIVE |
| Content | Low views | Views per new video fell 40%+ | Top sellers |
| Creators | Win back (just stopped) | Sold in the last period, almost nothing now | Everyone, biggest loss first |
| Creators | Check in (falling) | Selling 40%-75% less than before | Everyone |
| Creators | Past stars | Sold RM 500+ of it in total, nothing for 8+ weeks | Everyone, with their best video |
| Creators | Sleeping sellers | 3+ orders then quiet 8+ weeks (RM 100-500) | Everyone |
| Creators | One-time sellers | Sold once or twice, then never (5+ creators) | Everyone |
| Creators | Look after top sellers | 3+ creators with RM 300+ and not falling | Top 25 |
| Creators | Cross-sell | Active creators with RM 500+ total of other products who never sold this | Everyone, strongest first |
| Creators | Recruit | Top creator 30%+, top 3 over 55%, or creators fell 15%+ | Top 3 today |
| Creators | Back winners | Creators up 30%+ from new videos | Everyone |
| Creators | Follow up new | Creators who just made a first sale | Everyone |
| Samples | Chase unposted | Delivered 14+ days ago, no video, no sale | Everyone, longest waiting first |
| Samples | Send more | A sample earns RM 40+ and fewer were sent | Creators who sell it |
| Samples | Be stricter | 40%+ of delivered samples never posted | None |
| Shop & Offer | Returns / Rescue / Keep up | Returns up, product Slipping or Dying, or Growing | None |

**One main action per creator, per product.** A creator is listed only in the most important action that applies (order: sample not posted, win back / past star / falling, top seller / taking off, ad code, old video / new video, LIVE, cross-sell, new seller, one-time seller / another sample). The other asks are kept as "Also: ..." notes on that creator's line, and the message includes them, so nobody is contacted several times for one product. Actions about the product itself (best videos to learn from, top sellers, low views) only show examples and are not contact lists.

Every creator an action is about is stored (not only a few). Open the action to see them all: search, To Do / Done filter, paging, a tick for "contacted" (who and when), the creator's own videos with a Watch link, a personal Malay or English message with the video details filled in, a WhatsApp button when a number is known, and a CSV download. People marked "do not contact" are never listed. A tick survives plan refreshes.

History used: all sales ever (not only the last two periods), so a creator who sold well months ago but went quiet is found.

Priority = how much money is at stake compared with the product's sales (10%+ High, 3%+ Medium, else Normal). Due: High 3 days, Medium 7, Low 14.

## Life of a task
- One open task per problem (`ep_tasks_open_fingerprint`). While open, the system only refreshes its numbers, never makes a copy.
- Status: Not Started (default), Pending, Done. Also Not Needed (with a reason) and Solved (the system closed it because the numbers improved).
- A finished task is not written again for 14 days; a Not Needed one for 30 days.
- Who handles it: the owner of most of the creators named, else nobody until a manager assigns it. Several people can share one task.
- The plan is refreshed when the numbers change (checked on page open) and with Update Plan.

## Screen
Progress strip and numbers · List (group by Product, Category, Status, Person, Due Date, Priority) · Board · Team (performance per person, progress by category). Each product is its own card with a dark header. · right-side panel with why, checklist, creators with ready Malay/English messages, notes and history · filters, search, keyboard (arrows, Esc).

## Permissions
Owner and manager: everything. Other team members: only tasks assigned to them (status, checklist, notes).

## Tests
`scripts/test-execution.ts` (rules and writing) · `scripts/e2e-execution.js` (browser, app on :3100).
Migrations: `0014_execution_plan.sql`, `0015_execution_creators.sql` (run `npm run db:migrate`).

## Working in it
- Team members start on **My Work** (their open actions, grouped by due date). Owners and managers start on **All Work**, with a **Needs Attention** strip (actions with nobody, overdue).
- Quick views: My Work, All Work, Unassigned, Overdue. Priority filter: All, High, Medium, Normal, each with its number. Filters, search, group by.
- Managers: tick several actions and assign, set status or due date at once; click the assigned people in a row to change them.
- Marking Done or Not Needed shows an Undo for a few seconds.

## By Creator view (built, hidden for now)
The tab is switched off on the screen; the code (`creators-view.tsx`, `getCreatorAsks`) stays for later.

One card per creator with every open ask about them across all products (the same kind of ask in several products is one line with the product names). Tick all, or tick each ask; "One Message" and WhatsApp send one message that covers every ask (Malay or English). Filters: all creators or my actions, to contact or everyone, several asks, priority. "Open Action" opens the action in the side panel.
