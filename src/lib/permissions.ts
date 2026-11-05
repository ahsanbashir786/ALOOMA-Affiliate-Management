// Everything a role can be allowed to do. Pure (safe in client components). The Admin role always has all of these, including ones added later.

export type PermissionKey =
  | "execution.view" | "execution.work" | "execution.assign"
  | "affiliates.view" | "affiliates.work" | "affiliates.export" | "contacts.edit"
  | "products.view"
  | "sync.view" | "sync.run"
  | "tiktok.manage"
  | "users.manage";

export type Permission = { key: PermissionKey; group: string; label: string; help: string; requires?: PermissionKey };

export const PERMISSIONS: Permission[] = [
  { key: "execution.view", group: "Execution Plan", label: "Open the Execution Plan", help: "See the actions, creators and team progress" },
  { key: "execution.work", group: "Execution Plan", label: "Work on assigned actions", help: "Change status, tick steps and creators, add notes on actions assigned to them", requires: "execution.view" },
  { key: "execution.assign", group: "Execution Plan", label: "Assign and manage actions", help: "Assign people, set dates, change any action, update the plan", requires: "execution.view" },
  { key: "affiliates.view", group: "Affiliate Data", label: "Open Affiliate Data", help: "See every creator, their profile and the side panel" },
  { key: "affiliates.work", group: "Affiliate Data", label: "Record contacts and set owners", help: "Mark contacted, promises, pause, add creators, set owners", requires: "affiliates.view" },
  { key: "affiliates.export", group: "Affiliate Data", label: "Export to Excel", help: "Download the creator table", requires: "affiliates.view" },
  { key: "contacts.edit", group: "Affiliate Data", label: "Edit WhatsApp numbers", help: "WhatsApp numbers are personal data", requires: "affiliates.view" },
  { key: "products.view", group: "Product Analysis", label: "Open Product Analysis", help: "See how every product is doing and why" },
  { key: "sync.view", group: "Data Sync", label: "Open Data Sync", help: "See what is synced, when, and any failures" },
  { key: "sync.run", group: "Data Sync", label: "Run a sync", help: "Press Sync Now, choose what to sync", requires: "sync.view" },
  { key: "tiktok.manage", group: "Settings", label: "Manage the TikTok connection", help: "Connect, reconnect, check and disconnect TikTok Shop; set the sync schedule" },
  { key: "users.manage", group: "Users & Roles", label: "Manage users and roles", help: "Add people, change roles, reset passwords, edit what each role can do" },
];

export const PERMISSION_LABEL = Object.fromEntries(PERMISSIONS.map((p) => [p.key, p.label])) as Record<PermissionKey, string>;
export const PERMISSION_GROUPS = [...new Set(PERMISSIONS.map((p) => p.group))];

/** Starting permissions of the roles every installation gets. */
export const DEFAULT_ROLES: { key: string; name: string; description: string; isAdmin: boolean; permissions: PermissionKey[] }[] = [
  { key: "admin", name: "Admin", description: "The owner. Can do everything, always.", isAdmin: true, permissions: PERMISSIONS.map((p) => p.key) },
  {
    key: "manager", name: "Affiliate Manager", description: "Runs the programme day to day: assigns work, syncs data.", isAdmin: false,
    permissions: ["execution.view", "execution.work", "execution.assign", "affiliates.view", "affiliates.work", "affiliates.export", "contacts.edit", "products.view", "sync.view", "sync.run"],
  },
  { key: "viewer", name: "Viewer", description: "Looks, and works on the actions assigned to them.", isAdmin: false, permissions: ["execution.view", "execution.work", "affiliates.view", "products.view"] },
];

/** Switching a permission on also needs the one it depends on; switching one off also removes what depends on it. */
export function withDependencies(current: PermissionKey[], key: PermissionKey, on: boolean): PermissionKey[] {
  const set = new Set(current);
  if (on) {
    set.add(key);
    const need = PERMISSIONS.find((p) => p.key === key)?.requires;
    if (need) set.add(need);
  } else {
    set.delete(key);
    for (const p of PERMISSIONS) if (p.requires === key) set.delete(p.key);
  }
  return [...set];
}

/** Which permission opens each screen (the menu). */
export const SCREEN_PERMISSION: Record<string, PermissionKey> = {
  "/execution": "execution.view",
  "/creators": "affiliates.view",
  "/products": "products.view",
  "/sync": "sync.view",
  "/users": "users.manage",
  "/settings": "tiktok.manage",
};
