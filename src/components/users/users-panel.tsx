import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { rolePermissions, roles, users } from "@/db/schema";
import { PERMISSIONS, type PermissionKey } from "@/lib/permissions";
import { UsersScreen } from "@/components/users/users-screen";

/** People, roles and the screen switches. Used in Settings → User Management. The caller has already checked the permission. */
export async function UsersPanel({ meId }: { meId: string }) {
  const [people, roleRows, perms, counts] = await Promise.all([
    db.select({ id: users.id, name: users.name, email: users.email, roleId: users.roleId, active: users.active, lastLoginAt: users.lastLoginAt }).from(users).orderBy(asc(users.name)),
    db.select().from(roles).orderBy(asc(roles.isAdmin), asc(roles.createdAt)),
    db.select().from(rolePermissions),
    db.select({ roleId: users.roleId, n: sql<number>`count(*)::int` }).from(users).where(eq(users.active, true)).groupBy(users.roleId),
  ]);
  const all = PERMISSIONS.map((p) => p.key);
  const list = roleRows.map((r) => ({
    id: r.id, key: r.key, name: r.name, isAdmin: r.isAdmin,
    permissions: (r.isAdmin ? all : perms.filter((p) => p.roleId === r.id).map((p) => p.permission)) as PermissionKey[],
    people: counts.find((c) => c.roleId === r.id)?.n ?? 0,
  })).sort((a, b) => Number(b.isAdmin) - Number(a.isAdmin));
  return <UsersScreen users={people.map((u) => ({ ...u, lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null }))} roles={list} meId={meId} />;
}
