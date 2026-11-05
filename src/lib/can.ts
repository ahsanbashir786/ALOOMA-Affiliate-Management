import type { PermissionKey } from "@/lib/permissions";

/** The same check as `can` in auth, for client components (no server code). */
export const can = (user: { isAdmin: boolean; permissions: PermissionKey[] }, permission: PermissionKey) => user.isAdmin || user.permissions.includes(permission);
