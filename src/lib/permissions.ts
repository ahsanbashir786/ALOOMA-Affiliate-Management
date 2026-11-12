// A role can be allowed to open each of the screens. That is the only permission. Pure (safe in client components).
// The Admin role always has every screen, including ones added later.

export type PermissionKey = "execution" | "creators" | "products" | "ads" | "stock" | "sync" | "users" | "settings";

export type Permission = { key: PermissionKey; group: string; label: string; help: string };

export const PERMISSIONS: Permission[] = [
  { key: "execution", group: "Execution Plan", label: "Execution Plan", help: "See and work on the actions, assign people, update the plan" },
  { key: "creators", group: "Affiliate Data", label: "Affiliate Data", help: "See every creator and their profile, record contacts, export to Excel" },
  { key: "products", group: "Product Analysis", label: "Product Analysis", help: "See how every product is doing and why" },
  { key: "ads", group: "GMV Max", label: "GMV Max", help: "See GMV Max ad results and which videos are worth boosting" },
  { key: "stock", group: "Stock", label: "Stock And Costing", help: "See stock-in orders, cost per piece and FIFO stock; import stock files" },
  { key: "sync", group: "Data Sync", label: "Data Sync", help: "See what is synced and run a sync" },
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
  "/execution": "execution",
  "/creators": "creators",
  "/products": "products",
  "/ads": "ads",
  "/stock": "stock",
  "/sync": "sync",
  "/users": "users", // now a tab inside Settings; kept so the first-screen rule still works
  "/settings": "settings",
};
