import type { Metadata } from "next";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { rolePermissions, roles, users } from "@/db/schema";
import { gate } from "@/lib/gate";
import { PERMISSIONS, type PermissionKey } from "@/lib/permissions";
import { PageHeader } from "@/components/ui/primitives";
import { UsersScreen } from "@/components/users/users-screen";

export const metadata: Metadata = { title: "Users & Roles" };
export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const { user: me, denied } = await gate("users", "Users & Roles");
  if (denied) return denied;
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
  return (
    <div className="space-y-6">
      <PageHeader title="Users & Roles" description="Who can use the system, and which screens each role may open. Changes apply on the person's next click." />
      <UsersScreen users={people.map((u) => ({ ...u, lastLoginAt: u.lastLoginAt ? `${u.lastLoginAt.toISOString()}` : null }))} roles={list} meId={me.id} />
    </div>
  );
}
