"use server";

import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, count, eq, ne } from "drizzle-orm";
import * as z from "zod";
import { db } from "@/db";
import { rolePermissions, roles, sessions, users } from "@/db/schema";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS, READ_ONLY_SCREENS, withDependencies, type PermissionKey } from "@/lib/permissions";

export type Result = { ok?: string; error?: string } | undefined;
const refresh = () => { revalidatePath("/users"); revalidatePath("/", "layout"); };
const RoleId = z.string().uuid();

const NewUser = z.object({
  name: z.string().trim().min(2, "Enter a name."),
  email: z.email("Enter a valid email.").trim().toLowerCase(),
  roleId: RoleId,
  password: z.string().min(8, "Password needs at least 8 characters."),
});

export async function createUser(_: Result, fd: FormData): Promise<Result> {
  await requirePermission("users");
  const p = NewUser.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const [role] = await db.select({ id: roles.id }).from(roles).where(eq(roles.id, p.data.roleId));
  if (!role) return { error: "Choose a role." };
  const exists = await db.select({ id: users.id }).from(users).where(eq(users.email, p.data.email)).limit(1);
  if (exists.length) return { error: "A user with that email already exists." };
  await db.insert(users).values({ name: p.data.name, email: p.data.email, roleId: p.data.roleId, passwordHash: await bcrypt.hash(p.data.password, 12) });
  refresh();
  return { ok: `Added ${p.data.name}. Share the password with them securely.` };
}

async function otherActiveAdmins(exceptId: string) {
  const [{ n }] = await db.select({ n: count() }).from(users).innerJoin(roles, eq(roles.id, users.roleId)).where(and(eq(roles.isAdmin, true), eq(users.active, true), ne(users.id, exceptId)));
  return n;
}

export async function updateUser(id: string, patch: { roleId?: string; active?: boolean }): Promise<Result> {
  const me = await requirePermission("users");
  const [target] = await db.select({ id: users.id, roleId: users.roleId, isAdmin: roles.isAdmin }).from(users).innerJoin(roles, eq(roles.id, users.roleId)).where(eq(users.id, id)).limit(1);
  if (!target) return { error: "User not found." };
  let newIsAdmin = target.isAdmin;
  if (patch.roleId) {
    const [r] = await db.select({ isAdmin: roles.isAdmin }).from(roles).where(eq(roles.id, RoleId.parse(patch.roleId)));
    if (!r) return { error: "Choose a role." };
    newIsAdmin = r.isAdmin;
  }
  const losesAdmin = target.isAdmin && (!newIsAdmin || patch.active === false);
  if (losesAdmin && (await otherActiveAdmins(id)) === 0) return { error: "There must be at least one active admin." };
  if (id === me.id && patch.active === false) return { error: "You can't deactivate your own account." };
  await db.update(users).set({ ...(patch.roleId ? { roleId: patch.roleId } : {}), ...(patch.active !== undefined ? { active: patch.active } : {}), }).where(eq(users.id, id));
  if (patch.active === false) await db.delete(sessions).where(eq(sessions.userId, id));
  refresh();
  return { ok: "Saved." };
}

export async function resetPassword(_: Result, fd: FormData): Promise<Result> {
  await requirePermission("users");
  const id = String(fd.get("id") ?? "");
  const password = String(fd.get("password") ?? "");
  if (password.length < 8) return { error: "Password needs at least 8 characters." };
  await db.update(users).set({ passwordHash: await bcrypt.hash(password, 12) }).where(eq(users.id, id));
  await db.delete(sessions).where(eq(sessions.userId, id));
  return { ok: "Password updated. They'll need to sign in again." };
}

// ───────── roles ─────────
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "role";

/** A new role, starting with the same permissions as another one (or none). Changes take effect on the next click anyone makes. */
export async function createRole(name: string, copyFrom: string | null): Promise<Result & { id?: string }> {
  await requirePermission("users");
  const n = z.string().trim().min(2, "Give the role a name.").max(40).safeParse(name);
  if (!n.success) return { error: n.error.issues[0].message };
  const taken = await db.select({ id: roles.id }).from(roles);
  const keys = new Set((await db.select({ k: roles.key }).from(roles)).map((r) => r.k));
  void taken;
  let key = slug(n.data), i = 2;
  while (keys.has(key)) key = `${slug(n.data)}-${i++}`;
  const [created] = await db.insert(roles).values({ key, name: n.data }).returning({ id: roles.id });
  if (copyFrom) {
    const [src] = await db.select({ id: roles.id, isAdmin: roles.isAdmin }).from(roles).where(eq(roles.id, RoleId.parse(copyFrom)));
    if (src) {
      const perms = src.isAdmin ? PERMISSIONS.map((p) => p.key) : (await db.select({ p: rolePermissions.permission }).from(rolePermissions).where(eq(rolePermissions.roleId, src.id))).map((x) => x.p);
      if (perms.length) await db.insert(rolePermissions).values(perms.filter((p) => p !== "users").map((permission) => ({ roleId: created.id, permission })));
    }
  }
  refresh();
  return { ok: `Created ${n.data}.`, id: created.id };
}

export async function renameRole(roleId: string, name: string): Promise<Result> {
  await requirePermission("users");
  const n = z.string().trim().min(2, "Give the role a name.").max(40).safeParse(name);
  if (!n.success) return { error: n.error.issues[0].message };
  const [r] = await db.select({ isAdmin: roles.isAdmin }).from(roles).where(eq(roles.id, RoleId.parse(roleId)));
  if (!r) return { error: "Role not found." };
  if (r.isAdmin) return { error: "The Admin role cannot be renamed." };
  await db.update(roles).set({ name: n.data }).where(eq(roles.id, roleId));
  refresh();
  return { ok: "Saved." };
}

export async function deleteRole(roleId: string): Promise<Result> {
  await requirePermission("users");
  const [r] = await db.select({ isAdmin: roles.isAdmin, name: roles.name }).from(roles).where(eq(roles.id, RoleId.parse(roleId)));
  if (!r) return { error: "Role not found." };
  if (r.isAdmin) return { error: "The Admin role cannot be deleted." };
  const [{ n }] = await db.select({ n: count() }).from(users).where(eq(users.roleId, roleId));
  if (n > 0) return { error: `${n} ${n === 1 ? "person has" : "people have"} the ${r.name} role. Move them to another role first.` };
  await db.delete(roles).where(eq(roles.id, roleId));
  refresh();
  return { ok: "Role deleted." };
}

/** Switches one permission on or off for a role. Admin cannot be changed; you cannot remove your own way back into this screen. */
export async function setRolePermission(roleId: string, permission: string, on: boolean): Promise<Result & { permissions?: PermissionKey[] }> {
  const me = await requirePermission("users");
  const key = PERMISSIONS.find((p) => p.key === permission)?.key;
  if (!key) return { error: "Unknown permission." };
  const [r] = await db.select({ id: roles.id, isAdmin: roles.isAdmin, name: roles.name }).from(roles).where(eq(roles.id, RoleId.parse(roleId)));
  if (!r) return { error: "Role not found." };
  if (r.isAdmin) return { error: "Admin always has every permission." };
  const current = (await db.select({ p: rolePermissions.permission }).from(rolePermissions).where(eq(rolePermissions.roleId, r.id))).map((x) => x.p as PermissionKey);
  const next = withDependencies(current, key, on);
  // Someone must always be able to manage users and roles: the Admin role does, and nobody can lock themselves out.
  const [mine] = await db.select({ roleId: users.roleId }).from(users).where(eq(users.id, me.id));
  if (!on && key === "users" && mine?.roleId === r.id) return { error: "You have this role. Removing this permission would lock you out of User Management." };
  const add = next.filter((p) => !current.includes(p));
  const drop = current.filter((p) => !next.includes(p));
  for (const p of drop) await db.delete(rolePermissions).where(and(eq(rolePermissions.roleId, r.id), eq(rolePermissions.permission, p)));
  if (add.length) await db.insert(rolePermissions).values(add.map((permission) => ({ roleId: r.id, permission }))).onConflictDoNothing();
  refresh();
  return { ok: "Saved.", permissions: next };
}


// ───────── read-only access (for example, a login given to ChatGPT or Claude to look at the system) ─────────
const NewReadOnly = z.object({
  name: z.string().trim().min(2, "Give the login a name, for example ChatGPT Review.").max(60),
  email: z.email("Enter an email address for the login (it does not need to be a real mailbox).").trim().toLowerCase(),
  days: z.coerce.number().int().min(0).max(365),
});

export type ReadOnlyResult = { ok?: string; error?: string; credentials?: { name: string; email: string; password: string; expiresAt: string | null; screens: string[] } } | undefined;

/**
 * Makes a read-only login: its own role (the chosen screens, read-only), a long random password, and an end date.
 * The password is shown once, here, and never again.
 */
export async function createReadOnlyAccess(_: ReadOnlyResult, fd: FormData): Promise<ReadOnlyResult> {
  await requirePermission("users");
  const p = NewReadOnly.safeParse({ name: fd.get("name"), email: fd.get("email"), days: fd.get("days") });
  if (!p.success) return { error: p.error.issues[0].message };
  const screens = fd.getAll("screens").map(String).filter((k): k is PermissionKey => READ_ONLY_SCREENS.includes(k as PermissionKey));
  if (!screens.length) return { error: "Choose at least one screen." };
  if ((await db.select({ id: users.id }).from(users).where(eq(users.email, p.data.email)).limit(1)).length) return { error: "A login with that email already exists." };
  const keys = new Set((await db.select({ k: roles.key }).from(roles)).map((r) => r.k));
  let key = `read-only-${slug(p.data.name)}`, i = 2;
  while (keys.has(key)) key = `read-only-${slug(p.data.name)}-${i++}`;
  const [role] = await db.insert(roles).values({ key, name: `Read-Only: ${p.data.name}`, description: "A login that can look but not change anything.", readOnly: true }).returning({ id: roles.id });
  await db.insert(rolePermissions).values(screens.map((permission) => ({ roleId: role.id, permission })));
  // 24 letters and digits without look-alikes (no 0/O, 1/l/I): about 120 bits.
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(24);
  const password = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
  const expiresAt = p.data.days > 0 ? new Date(Date.now() + p.data.days * 86_400_000) : null;
  await db.insert(users).values({ name: p.data.name, email: p.data.email, roleId: role.id, passwordHash: await bcrypt.hash(password, 12), expiresAt });
  revalidatePath("/settings");
  return { ok: "Created. Copy the details now: the password is not shown again.", credentials: { name: p.data.name, email: p.data.email, password, expiresAt: expiresAt ? expiresAt.toISOString() : null, screens: screens.map((k) => PERMISSIONS.find((x) => x.key === k)?.label ?? k) } };
}

/** Switches a read-only login off for good (the login, its role and any open sessions are deleted). */
export async function removeReadOnlyAccess(userId: string): Promise<Result> {
  await requirePermission("users");
  const [row] = await db.select({ id: users.id, roleId: users.roleId, readOnly: roles.readOnly }).from(users).innerJoin(roles, eq(roles.id, users.roleId)).where(eq(users.id, z.string().uuid().parse(userId))).limit(1);
  if (!row) return { error: "Login not found." };
  if (!row.readOnly) return { error: "That is not a read-only login." };
  await db.delete(sessions).where(eq(sessions.userId, row.id));
  await db.delete(users).where(eq(users.id, row.id));
  const [{ n }] = await db.select({ n: count() }).from(users).where(eq(users.roleId, row.roleId));
  if (n === 0) await db.delete(roles).where(eq(roles.id, row.roleId));
  revalidatePath("/settings");
  return { ok: "Switched off." };
}

/** Moves the end date of a read-only login (days from now; 0 = never ends). */
export async function setReadOnlyExpiry(userId: string, days: number): Promise<Result> {
  await requirePermission("users");
  const d = z.number().int().min(0).max(365).safeParse(days);
  if (!d.success) return { error: "Choose how long." };
  const [row] = await db.select({ id: users.id, readOnly: roles.readOnly }).from(users).innerJoin(roles, eq(roles.id, users.roleId)).where(eq(users.id, z.string().uuid().parse(userId))).limit(1);
  if (!row?.readOnly) return { error: "That is not a read-only login." };
  await db.update(users).set({ expiresAt: d.data > 0 ? new Date(Date.now() + d.data * 86_400_000) : null }).where(eq(users.id, row.id));
  revalidatePath("/settings");
  return { ok: "Saved." };
}
