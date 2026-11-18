# Roles, permissions and read-only access

## What a role can open

Settings → User Management → **Roles & Permissions**. A role is a list of screens it may open (Execution Plan, Affiliate Data, Product Analysis, GMV Max, Stock And Costing, Profit And Loss, Data Sync, Settings: Connection, Settings: User Management). **Admin** always has every screen.

A screen a role may **not** open is **not shown at all**: not in the menu, not in the quick search (Ctrl + K), not as a tab. Someone who types the address still gets the Permission Denied page.

## Read-only login (for an AI assistant or any reviewer)

Settings → User Management → **Read-Only Access**.

1. Give it a name (for example `ChatGPT Review`) and a login email (it does not need to be a real mailbox).
2. Tick the screens it may open. Users and Settings are never offered.
3. Choose when it ends (1, 3, 7, 30 days or never; 7 is the default).
4. **Create Read-Only Login.** A 24-character random password is shown **once**. **Copy Instructions For ChatGPT Or Claude** gives a ready-to-paste text with the address, email, password, what it may do and what to look at.
5. When the review is done: **Switch Off** (the login, its role and any open session are deleted). **Change end date** moves the end.

What a read-only login can and cannot do:

| | |
|---|---|
| Can | open the ticked screens and read everything on them, use the quick search |
| Cannot | save, assign, tick, import, add or remove anything; run a sync; connect or disconnect; download any Excel or CSV; open Settings or User Management (never, even if ticked) |
| Hidden | creators' WhatsApp numbers show as `+60••••••••` everywhere (lists, profile, side panel, Execution Plan lists); no WhatsApp links |
| Marked | a blue banner says the login is read-only |

How it is enforced (not just hidden buttons): every action that changes something goes through `requirePermission` / `requireWriter`, which turn a read-only login away to a "This Login Is Read-Only" page; the sync, test and export routes refuse it with 403; `can()` never allows Users or Settings for a read-only role. The end date is checked on every sign-in and on every click.

**Think before sharing:** a login can see your sales, costs, profit and ad spend, and what an AI tool sees may be stored by that service. Use a short end date, tick only the screens needed, and switch it off afterwards. A normal person (not an AI tool) can also be given a read-only login the same way.

## Files

`migrations/0042_read_only_access.sql` · `src/lib/{can,auth,permissions,whatsapp}.ts` · `src/app/actions/users.ts` (createReadOnlyAccess, removeReadOnlyAccess, setReadOnlyExpiry) · `src/components/users/read-only-access.tsx` · `scripts/e2e-readonly.js` (30 checks), `scripts/test-permissions.ts`, `scripts/e2e-permissions.js`
