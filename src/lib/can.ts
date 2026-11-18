import type { PermissionKey } from "@/lib/permissions";

/** A read-only role can never manage users or settings, whatever is ticked for it. */
const NEVER_READ_ONLY: PermissionKey[] = ["users", "settings", "approve_samples"];

/** The same check as `can` in auth, for client components (no server code). */
export const can = (user: { isAdmin: boolean; permissions: PermissionKey[]; readOnly?: boolean }, permission: PermissionKey) => {
  if (user.readOnly && NEVER_READ_ONLY.includes(permission)) return false;
  return user.isAdmin || user.permissions.includes(permission);
};

/** Can this person change anything (save, sync, import, export)? */
export const mayWrite = (user: { readOnly?: boolean }) => !user.readOnly;
