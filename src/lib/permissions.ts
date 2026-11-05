// A role can be allowed to open each of the six screens. That is the only permission. Pure (safe in client components).
// The Admin role always has every screen, including ones added later.

export type PermissionKey = "execution" | "creators" | "products" | "sync" | "users" | "settings";

export type Permission = { key: PermissionKey; group: string; label: string; help: string };

export const PERMISSIONS: Permission[] = [
  { key: "execution", group: "Execution Plan", label: "Execution Plan", help: "See and work on the actions, assign people, update the plan" },
  { key: "creators", group: "Affiliate Data", label: "Affiliate Data", help: "See every creator and their profile, record contacts, export to Excel" },
  { key: "products", group: "Product Analysis", label: "Product Analysis", help: "See how every product is doing and why" },
  { key: "sync", group: "Data Sync", label: "Data Sync", help: "See what is synced and run a sync" },
  { key: "users", group: "Users & Roles", label: "Users & Roles", help: "Add people, create roles, choose which screens each role can open" },
  { key: "settings", group: "Settings", label: "Settings", help: "Connect, check and disconnect TikTok Shop" },
];

export const PERMISSION_LABEL = Object.fromEntries(PERMISSIONS.map((p) => [p.key, p.label])) as Record<PermissionKey, string>;
export const PERMISSION_GROUPS = [...new Set(PERMISSIONS.map((p) => p.group))];

/** The only built-in role. Everything else is created from the Users & Roles screen. */
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
  "/sync": "sync",
  "/users": "users",
  "/settings": "settings",
};
