# System map and clean-up plan

Written from the code as it is today. Nothing was changed to produce this page.

## 1. How the work should flow

| Station | Job | Screen |
|---|---|---|
| 1. Data in | Upload TikTok files, check they are correct | Data hub |
| 2. Decide | See every creator and product, and what to do next | Affiliate Data Management (the table) |
| 3. Do | Message the creator, record what happened | Side panel, then Today's Work |
| 4. Track | Did the work lead to videos and sales? | Progress (owner) |
| 5. Summary | A few numbers for each morning | Command centre (owner) |

Everything else (Overview, Content, Products, Orders, Opportunities, Samples, Order health, Demand) is **analysis or operations** and should only read the same numbers, never decide differently.

## 2. Every screen today

| Screen | Station | Keep? |
|---|---|---|
| Data hub | 1 | Keep |
| Affiliate Data Management | 2 | Keep (the main screen) |
| Today's Work | 3 | Keep, rebuild around table actions |
| Side panel (creator) | 3 | Keep (shared everywhere) |
| Progress | 4 | Keep |
| Command centre | 5 | Keep |
| Samples (4 tabs: tracker, creators, products, report) | 2 and 3 | **Merge**: delivery and posting check only; chase and messages move to the table |
| Creator page `/creators/[name]` | 2 and 3 | Keep as a full history page; remove its own advice text |
| Affiliate analysis | analysis | Review, overlaps with the table |
| Opportunities (segments and scenarios) | 2 | **Merge** into the table filters |
| Sales overview, Content, Products, Shop orders | analysis | Keep, read only |
| Order health, Demand planning | operations | Keep, separate module |
| Settings | admin | Keep |

## 3. Duplicates found (the real problem)

| # | What is duplicated | Where | Risk | Fix |
|---|---|---|---|---|
| D1 | **"What should we do for this creator" is worked out four times** | `affiliates/status.ts` (table), `samples/states.ts` verdicts (Samples), `analytics/recommendations.ts` (Today's Work, Overview, Opportunities, Creator page), `segments` (Overview, Creator page) | The same creator can be "Chase" in one place, "Coach" in another and "Reactivate" in a third | One rule set (the table's status and action) used by all screens |
| D2 | **Messages written three times** | `affiliates/action-messages.ts`, `samples/states.ts` waMessage, recommendation instructions | Different wording and different numbers for the same creator | Keep only `action-messages.ts` |
| D3 | **Two data loaders for creators** | `workflow/directory.ts` (table) and `affiliates/service.ts` (analysis page, data hub, old Excel export) | Totals could differ between pages | The table's loader becomes the single source |
| D4 | **Two Excel exports** | `/api/affiliates/export` (old) and `/api/affiliates/directory-export` (new) | Staff download the wrong one | Keep the new one, remove the old |
| D5 | **Four Samples tabs and the table both show sample lines** | Samples pages, table lines | Two places to chase | Samples keeps delivery checks, the table keeps chasing |
| D6 | **Recording an action** | Table panel, Today's Work menu, creator page buttons | Three code paths for the same event | One shared action component |
| D7 | **Sales numbers** | Overview, Command centre, Products, Progress each query separately | Small differences between pages | One shared "valid orders" definition (already exists as `AL`); check every page uses it |

## 4. Order of clean-up (one section at a time)

| Step | Section | Result | Risk |
|---|---|---|---|
| 1 | Today's Work | Reads the table's status and action; shows "done today"; removes its own recommendation text (D1, D2, D6) | Medium |
| 2 | Samples | Delivery and posting check only; chase and message buttons open the shared panel (D1, D2, D5) | Medium |
| 3 | Creator page, Opportunities, Overview | Remove their own advice and use the same status and action (D1) | Low |
| 4 | Exports and loaders | Remove the old export and merge the loaders (D3, D4) | Low |
| 5 | Command centre and Progress | Numbers from one shared definition (D7) | Low |

## 5. Safety rules for every step

1. Your data and past records are never deleted or changed.
2. A test and a screenshot check before every push.
3. Nothing is removed from the menu until you agree.
4. Each step is small and pushed on its own, so it can be undone.
