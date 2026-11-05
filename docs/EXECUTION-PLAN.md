# Execution Plan

The daily work screen (`/execution`). Products only shows numbers; this screen turns them into actions.
The system writes the actions from the product analysis, the team assigns, does and ticks them off.

## How actions are made (`src/lib/execution/rules.ts`)
Every product is read after each sync. A rule fires when its numbers say so, and writes one task with: the reason in numbers, a checklist, the creators to contact, the sales at stake, a priority and a due date.

| Category | Action | Fires when |
|---|---|---|
| Content | Ask creators for new videos | Few or fewer new videos, or under 30% of video/LIVE sales from new content |
| Content | Fix the hook | Under 8% of new videos get 3+ orders in 14 days, or 10+ points worse than before |
| Content | Refresh old videos | 60%+ of video/LIVE sales come from videos over 30 days old |
| Content | LIVE push | LIVE sales fell 25%+, or LIVE is under 10% of sales |
| Content | Low views | Views per new video fell 40%+ |
| Creators | Win back | Creator sold well before and now almost nothing |
| Creators | Recruit | Top creator 30%+, top 3 over 55%, or creators fell 15%+ |
| Creators | Back winners | Creators up 30%+ from new videos |
| Creators | Follow up new | Creators who just made a first sale |
| Samples | Chase unposted | Delivered 14+ days ago, no video, no sale |
| Samples | Send more | A sample earns RM 40+ and fewer were sent |
| Samples | Be stricter | 40%+ of delivered samples never posted |
| Shop & Offer | Returns | Returns 5+ points up, or 10%+ |
| Shop & Offer | Rescue | Product is Slipping or Dying |
| Shop & Offer | Keep up | Product is Growing: stock, offer, samples |

Priority = how much money is at stake compared with the product's sales (10%+ High, 3%+ Medium, else Low). Due: High 3 days, Medium 7, Low 14.

## Life of a task
- One open task per problem (`ep_tasks_open_fingerprint`). While open, the system only refreshes its numbers, never makes a copy.
- Status: Not Started (default), Pending, Done. Also Not Needed (with a reason) and Solved (the system closed it because the numbers improved).
- A finished task is not written again for 14 days; a Not Needed one for 30 days.
- Who handles it: the product's leads (set in Team view); else the owner of most of the creators named; else nobody. Several people can share one task.
- The plan is refreshed when the numbers change (checked on page open) and with Update Plan.

## Screen
Progress strip and numbers · List (group by Product, Category, Status, Person, Due Date, Priority) · Board · Team (performance per person, progress by category, who handles which product) · right-side panel with why, checklist, creators with ready Malay/English messages, notes and history · filters, search, keyboard (arrows, Esc).

## Permissions
Owner and manager: everything. Other team members: only tasks assigned to them (status, checklist, notes).

## Tests
`scripts/test-execution.ts` (rules and writing) · `scripts/e2e-execution.js` (browser, app on :3100).
Migration: `0014_execution_plan.sql` (run `npm run db:migrate`).
