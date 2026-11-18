import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { rolePermissions, roles, users } from "@/db/schema";
import { PERMISSIONS, type PermissionKey } from "@/lib/permissions";
import { UsersScreen } from "@/components/users/users-screen";

/** People, roles and the screen switches. Used in Settings → User Management. The caller has already checked the permission. */
export async function UsersPanel({ meId }: { meId: string }) {
  const [people, roleRows, perms, counts] = await Promise.all([
    db.select({ id: users.id, name: users.name, email: users.email, roleId: users.roleId, active: users.active, lastLoginAt: users.lastLoginAt, expiresAt: users.expiresAt }).from(users).orderBy(asc(users.name)),
    db.select().from(roles).orderBy(asc(roles.isAdmin), asc(roles.createdAt)),
    db.select().from(rolePermissions),
    db.select({ roleId: users.roleId, n: sql<number>`count(*)::int` }).from(users).where(eq(users.active, true)).groupBy(users.roleId),
  ]);
  const all = PERMISSIONS.map((p) => p.key);
  // Read-only logins (each has a role of its own) are managed in their own tab, not mixed in with the team.
  const roRoles = new Set(roleRows.filter((r) => r.readOnly).map((r) => r.id));
  const ai = people.filter((u) => roRoles.has(u.roleId)).map((u) => ({ id: u.id, name: u.name, email: u.email, active: u.active, lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null, expiresAt: u.expiresAt ? u.expiresAt.toISOString() : null, screens: perms.filter((p) => p.roleId === u.roleId).map((p) => PERMISSIONS.find((x) => x.key === p.permission)?.label ?? p.permission) }));
  const list = roleRows.filter((r) => !r.readOnly).map((r) => ({
    id: r.id, key: r.key, name: r.name, isAdmin: r.isAdmin,
    permissions: (r.isAdmin ? all : perms.filter((p) => p.roleId === r.id).map((p) => p.permission)) as PermissionKey[],
    people: counts.find((c) => c.roleId === r.id)?.n ?? 0,
  })).sort((a, b) => Number(b.isAdmin) - Number(a.isAdmin));
  return <UsersScreen users={people.filter((u) => !roRoles.has(u.roleId)).map((u) => ({ id: u.id, name: u.name, email: u.email, roleId: u.roleId, active: u.active, lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null }))} roles={list} readOnlyLogins={ai} meId={meId} />;
}
