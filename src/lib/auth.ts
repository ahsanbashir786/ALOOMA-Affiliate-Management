import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { rolePermissions, roles, sessions, users } from "@/db/schema";
import { PERMISSIONS, SCREEN_PERMISSION, type PermissionKey } from "@/lib/permissions";

export const SESSION_COOKIE = "ams_session";
const SESSION_DAYS = 14;


const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db.insert(sessions).values({ tokenHash: hashToken(token), userId, expiresAt });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    // HTTPS-only cookie in production. Set COOKIE_SECURE=false only for a temporary plain-http test by IP address.
    secure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === "true" : process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  jar.delete(SESSION_COOKIE);
}

/** Who is signed in, and everything their role allows. */
export type SessionUser = {
  id: string; name: string; email: string;
  /** The role's short key (admin, manager, viewer, or one you made) and its display name. */
  role: string; roleName: string; isAdmin: boolean;
  permissions: PermissionKey[];
  /** An extra, per-person permission to edit WhatsApp numbers (on top of the role). */
};

export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const [row] = await db
    .select({ id: users.id, name: users.name, email: users.email, roleId: users.roleId, role: roles.key, roleName: roles.name, isAdmin: roles.isAdmin })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .innerJoin(roles, eq(roles.id, users.roleId))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date()), eq(users.active, true)))
    .limit(1);
  if (!row) return null;
  const perms = row.isAdmin ? PERMISSIONS.map((p) => p.key) : (await db.select({ p: rolePermissions.permission }).from(rolePermissions).where(eq(rolePermissions.roleId, row.roleId))).map((x) => x.p as PermissionKey);
  const { roleId: _roleId, ...rest } = row;
  void _roleId;
  return { ...rest, permissions: perms };
});

/** Redirects to /login unless someone is signed in. What they may do is checked with can() or requirePermission(). */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export { can } from "@/lib/can";
import { can } from "@/lib/can";

/** For actions and routes: signs in, and sends the person to the Permission Denied page unless their role allows this. */
export async function requirePermission(permission: PermissionKey): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user, permission)) redirect(`/denied?need=${permission}`);
  return user;
}

/** Where a person lands after signing in. */
export const landingFor = () => "/execution";

/** The first screen this person is allowed to open (used by the Permission Denied page). */
export function firstAllowedScreen(user: Pick<SessionUser, "isAdmin" | "permissions">): string | null {
  return Object.entries(SCREEN_PERMISSION).find(([, perm]) => can(user, perm))?.[0] ?? null;
}

/** WhatsApp numbers are personal data: only roles with the permission, and people ticked individually, may edit or upload them. */
export const mayEditContacts = (user: Pick<SessionUser, "isAdmin" | "permissions">) => can(user, "creators");
