"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { and, eq, ne, sql } from "drizzle-orm";
import * as z from "zod";
import { db } from "@/db";
import { sessions, settings, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { DEFAULT_THRESHOLDS } from "@/lib/analytics/settings";

export type Result = { ok?: string; error?: string } | undefined;
const Role = z.enum(["admin", "manager", "viewer"]);

const NewUser = z.object({
  name: z.string().trim().min(2, "Enter a name."),
  email: z.email("Enter a valid email.").trim().toLowerCase(),
  role: Role,
  password: z.string().min(8, "Password needs at least 8 characters."),
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

export async function updateUser(id: string, patch: { role?: z.infer<typeof Role>; active?: boolean }): Promise<Result> {
  const me = await requireUser("admin");
  const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!target) return { error: "User not found." };
  const losesAdmin = target.role === "admin" && ((patch.role && patch.role !== "admin") || patch.active === false);
  if (losesAdmin && (await otherActiveAdmins(id)) === 0) return { error: "There must be at least one active admin." };
  if (id === me.id && patch.active === false) return { error: "You can't deactivate your own account." };
  await db.update(users).set({ ...(patch.role ? { role: Role.parse(patch.role) } : {}), ...(patch.active !== undefined ? { active: patch.active } : {}) }).where(eq(users.id, id));
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

const Thresholds = z.object({
  targetVideosPerWeek: z.coerce.number().min(0.25).max(21),
  minSellerGmv: z.coerce.number().min(0).max(1_000_000),
  starTopShare: z.coerce.number().min(1).max(50).transform((n) => n / 100),
  strongPercentile: z.coerce.number().min(30).max(95).transform((n) => n / 100),
  declineThreshold: z.coerce.number().min(10).max(90).transform((n) => n / 100),
  growthThreshold: z.coerce.number().min(10).max(500).transform((n) => n / 100),
  upliftHaircut: z.coerce.number().min(10).max(100).transform((n) => n / 100),
  upliftWeeks: z.coerce.number().int().min(1).max(26),
  lowConversionMinViews: z.coerce.number().min(0),
  untappedMinFollowers: z.coerce.number().min(0),
  highCancelRate: z.coerce.number().min(5).max(90).transform((n) => n / 100),
});

export async function saveThresholds(_: Result, fd: FormData): Promise<Result> {
  await requireUser("admin");
  if (fd.get("reset")) {
    await db.delete(settings).where(eq(settings.key, "thresholds"));
    revalidatePath("/settings");
    return { ok: "Restored the defaults." };
  }
  const p = Thresholds.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: `Check “${String(p.error.issues[0].path[0])}”: ${p.error.issues[0].message}` };
  await db
    .insert(settings)
    .values({ key: "thresholds", value: { ...DEFAULT_THRESHOLDS, ...p.data } })
    .onConflictDoUpdate({ target: settings.key, set: { value: { ...DEFAULT_THRESHOLDS, ...p.data }, updatedAt: new Date() } });
  revalidatePath("/", "layout");
  return { ok: "Saved. Segments and recommendations use these rules from now on – refresh recommendations in the Action centre to apply them." };
}

export async function saveOwnAccounts(_: Result, fd: FormData): Promise<Result> {
  await requireUser("admin");
  const list = String(fd.get("accounts") ?? "")
    .split(/[\s,]+/)
    .map((s) => s.replace(/^@/, "").trim())
    .filter(Boolean);
  await db
    .insert(settings)
    .values({ key: "own_accounts", value: list })
    .onConflictDoUpdate({ target: settings.key, set: { value: list, updatedAt: new Date() } });
  revalidatePath("/", "layout");
  return { ok: list.length ? `Saved ${list.length} account${list.length === 1 ? "" : "s"}.` : "Cleared – brand accounts will be detected automatically." };
}
