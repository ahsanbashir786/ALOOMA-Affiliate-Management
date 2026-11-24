// A role can be allowed to open each of the screens. That is the only permission. Pure (safe in client components).
// The Admin role always has every screen, including ones added later.

export type PermissionKey = "execution" | "creators" | "products" | "ads" | "stock" | "profit" | "sync" | "users" | "settings" | "approve_samples";

export type Permission = { key: PermissionKey; group: string; label: string; help: string };

export const PERMISSIONS: Permission[] = [
  { key: "execution", group: "Affiliates", label: "Actions: By Product", help: "See and work on the product actions in Actions › By Product: assign people, set due dates, tick creators" },
  { key: "creators", group: "Affiliates", label: "Affiliate Screens", help: "Dashboard, Creator Outreach, Creators, Content, Actions and Team: see every creator, record contacts, export to Excel" },
  { key: "products", group: "Affiliates", label: "Products", help: "See how every product is doing and why (Products and each product's full analysis)" },
  { key: "ads", group: "GMV Max", label: "GMV Max", help: "See GMV Max ad results and which videos are worth boosting" },
  { key: "stock", group: "Stock", label: "Stock And Costing", help: "See stock-in orders, cost per piece and FIFO stock; import stock files" },
  { key: "profit", group: "Profit", label: "Profit And Loss", help: "See order profit, monthly profit and loss, and what can be claimed back" },
  { key: "sync", group: "Data Sync", label: "Data Sync", help: "See what is synced and run a sync" },
  { key: "approve_samples", group: "Affiliates", label: "Outreach: Approve Samples", help: "Approve or reject creators' sample requests on TikTok from the Outreach screen. An approval cannot be undone." },
  { key: "users", group: "Settings", label: "Settings: User Management", help: "Add people, create roles, choose what each role can open" },
  { key: "settings", group: "Settings", label: "Settings: Connection", help: "Connect, check and disconnect TikTok Shop and TikTok Ads" },
];

export const PERMISSION_LABEL = Object.fromEntries(PERMISSIONS.map((p) => [p.key, p.label])) as Record<PermissionKey, string>;
export const PERMISSION_GROUPS = [...new Set(PERMISSIONS.map((p) => p.group))];

/** The only built-in role. Everything else is created in Settings → User Management. */
export const ADMIN_ROLE = { key: "admin", name: "Admin", description: "The owner. Can open every screen, always." };

/** Turn one screen on or off for a role. */
export function withDependencies(current: PermissionKey[], key: PermissionKey, on: boolean): PermissionKey[] {
  const set = new Set(current);
  if (on) set.add(key); else set.delete(key);
  return [...set];
}

/** Which permission opens each screen (the menu). */
export const SCREEN_PERMISSION: Record<string, PermissionKey> = {
  "/affiliate": "creators",
  "/affiliate/outreach": "creators",
  "/creators": "creators",
  "/affiliate/products": "products",
  "/affiliate/content": "creators",
  "/affiliate/actions": "execution",
  "/affiliate/team": "creators",
  "/ads": "ads",
  "/stock": "stock",
  "/profit": "profit",
  "/sync": "sync",
  "/users": "users", // now a tab inside Settings; kept so the first-screen rule still works
  "/settings": "settings",
};

/** The screens a read-only login may be given. Users and Settings are never offered: they hold the team's emails and connections and the power to change things. */
export const READ_ONLY_SCREENS: PermissionKey[] = ["execution", "creators", "products", "ads", "stock", "profit", "sync"];
