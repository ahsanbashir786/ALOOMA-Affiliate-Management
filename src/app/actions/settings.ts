"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { and, eq, ne, sql } from "drizzle-orm";
import * as z from "zod";
import { db } from "@/db";
import { sessions, settings, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";

export type Result = { ok?: string; error?: string } | undefined;
const Role = z.enum(["admin", "manager", "viewer"]);

const NewUser = z.object({
  name: z.string().trim().min(2, "Enter a name."),
  email: z.email("Enter a valid email.").trim().toLowerCase(),
  role: Role,
  password: z.string().min(8, "Password needs at least 8 characters."),
  canEditContacts: z.string().optional(),
});

export async function createUser(_: Result, fd: FormData): Promise<Result> {
  await requireUser("admin");
  const p = NewUser.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const exists = await db.select({ id: users.id }).from(users).where(eq(users.email, p.data.email)).limit(1);
  if (exists.length) return { error: "A user with that email already exists." };
  await db.insert(users).values({
    name: p.data.name,
    email: p.data.email,
    role: p.data.role,
    canEditContacts: !!p.data.canEditContacts,
    passwordHash: await bcrypt.hash(p.data.password, 12),
  });
  revalidatePath("/settings");
  return { ok: `Added ${p.data.name}. Share the password with them securely.` };
}

async function otherActiveAdmins(exceptId: string) {
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(users)
    .where(and(eq(users.role, "admin"), eq(users.active, true), ne(users.id, exceptId)));
  return n;
}

export async function updateUser(id: string, patch: { role?: z.infer<typeof Role>; active?: boolean; canEditContacts?: boolean }): Promise<Result> {
  const me = await requireUser("admin");
  const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!target) return { error: "User not found." };
  const losesAdmin = target.role === "admin" && ((patch.role && patch.role !== "admin") || patch.active === false);
  if (losesAdmin && (await otherActiveAdmins(id)) === 0) return { error: "There must be at least one active admin." };
  if (id === me.id && patch.active === false) return { error: "You can't deactivate your own account." };
  await db.update(users).set({ ...(patch.role ? { role: Role.parse(patch.role) } : {}), ...(patch.active !== undefined ? { active: patch.active } : {}), ...(patch.canEditContacts !== undefined ? { canEditContacts: patch.canEditContacts } : {}) }).where(eq(users.id, id));
  if (patch.active === false || (patch.role && patch.role !== target.role)) await db.delete(sessions).where(eq(sessions.userId, id));
  revalidatePath("/settings");
  return { ok: "Saved." };
}

export async function resetPassword(_: Result, fd: FormData): Promise<Result> {
  await requireUser("admin");
  const id = String(fd.get("id") ?? "");
  const password = String(fd.get("password") ?? "");
  if (password.length < 8) return { error: "Password needs at least 8 characters." };
  await db.update(users).set({ passwordHash: await bcrypt.hash(password, 12) }).where(eq(users.id, id));
  await db.delete(sessions).where(eq(sessions.userId, id));
  return { ok: "Password updated. They'll need to sign in again." };
}

const Workflow = z.object({
  followUpDays: z.coerce.number().int().min(1).max(30),
  promiseFollowUpDays: z.coerce.number().int().min(0).max(14),
  helpDays: z.coerce.number().int().min(1).max(30),
  maxUnanswered: z.coerce.number().int().min(2).max(10),
  todayLimit: z.coerce.number().int().min(3).max(100).optional().transform((v) => v ?? 15),
  developmentLimit: z.coerce.number().int().min(0).max(30).optional().transform((v) => v ?? 5),
  stuckTransitDays: z.coerce.number().int().min(3).max(60),
  inactiveDays: z.coerce.number().int().min(7).max(365),
  stalledOverdueDays: z.coerce.number().int().min(3).max(90),
});

/** Defaults for the daily workflow (follow-up spacing, list size). Changing them never rewrites past staff actions. */
export async function saveWorkflowSettings(_: Result, fd: FormData): Promise<Result> {
  await requireUser("admin");
  if (fd.get("reset")) {
    await db.delete(settings).where(eq(settings.key, "workflow"));
    revalidatePath("/", "layout");
    return { ok: "Restored the defaults." };
  }
  const p = Workflow.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: `Check “${String(p.error.issues[0].path[0])}”: ${p.error.issues[0].message}` };
  await db
    .insert(settings)
    .values({ key: "workflow", value: p.data })
    .onConflictDoUpdate({ target: settings.key, set: { value: p.data, updatedAt: new Date() } });
  revalidatePath("/", "layout");
  return { ok: "Saved. New follow-up dates use these rules; dates already scheduled are recalculated from the same staff actions." };
}
