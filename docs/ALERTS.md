# System Alerts

Settings → **System Alerts**. A bell in the top bar (owner and anyone who can open Settings) shows how many problems are waiting. Four areas only:

| Area | What raises an alert |
|---|---|
| **Connections** | TikTok Shop or TikTok Ads keys set but not connected; a login or permission refused (for example "Access denied", missing finance permission); a Shopee login with under 7 days left or already run out; Shopee connected to the wrong environment (sandbox vs live) |
| **Data Sync** | A data card failed (TikTok's own message is shown, a changed API version is called out); no good sync for 6 hours or 3 times the schedule; a sync "running" for over 3 hours. A card failing for over a day is Critical. Access errors are shown once, under Connections |
| **Server** | Disk 80% (Critical at 90%); memory 85% (95%); processor 90%+ for 3 readings in a row (95%+ for 5 is Critical); 5-minute load of 2+ per core; the app held up 500 ms+ three readings in a row |
| **App Errors** | Any error in a page, form or the browser (identical mistakes with different numbers are one problem). 10+ in an hour is Critical. Redirects and "not found" are not errors |

## How it works

- The server takes a reading every 2 minutes and checks everything (and the page re-checks when opened; **Check Now** forces it).
- A problem that goes away is marked resolved by itself and moves to *Recently resolved* (kept 14 days). If it comes back it opens again.
- **Seen** keeps an alert listed but stops it counting on the bell (it comes back as open if it gets worse). **Clear** (errors only) removes an error until it happens again.
- **Copy Diagnostic Report** puts one block of text on the clipboard for the developer: connections, every sync card's last good time and error, server numbers, open alerts and the last 10 errors with their page and stack. It never contains a key, password or customer data.
- Alerts are only shown in the app for now. There is no email, WhatsApp or Telegram message yet.

## Files

`migrations/0036_system_alerts.sql` (tables `system_alerts`, `app_error_log`, kept 7 days) · `src/lib/alerts/{checks,record,sampler,evaluate,queries,report}.ts` · `src/instrumentation.ts` (`onRequestError` saves every server error) · `src/components/shell/error-reporter.tsx` (browser errors) · `src/components/settings/alerts-panel.tsx` · `scripts/test-alerts.ts` (45 checks) · `scripts/e2e-alerts.js`
