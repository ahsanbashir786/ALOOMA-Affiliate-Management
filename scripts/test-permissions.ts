// Roles and permissions: the starting roles, the rules for dependencies, and who can open which screen.
// Run: DATABASE_URL=postgres://postgres@localhost:5433/affiliate_test npx tsx --conditions=react-server scripts/test-permissions.ts
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { can } from "@/lib/can";
import { PERMISSIONS, SCREEN_PERMISSION, withDependencies, type PermissionKey } from "@/lib/permissions";

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + extra}`); };
const q = async (s: ReturnType<typeof sql>) => (await db.execute(s)) as unknown as Record<string, unknown>[];

(async () => {
  await q(sql`delete from users where email like 'e2e-%'`);
  await q(sql`delete from roles where key like 'e2e-%'`);
  const roles = await q(sql`select r.key, r.is_admin, array_agg(p.permission order by p.permission) filter (where p.permission is not null) as perms from roles r left join role_permissions p on p.role_id = r.id group by r.key, r.is_admin`);
  const by = new Map(roles.map((r) => [r.key as string, r]));
  const all = PERMISSIONS.map((p) => p.key).sort();
  check("permissions: exactly the seven screens", JSON.stringify(all) === JSON.stringify(["ads", "creators", "execution", "products", "settings", "sync", "users"]));
  check("roles: Admin exists and is the locked owner role", by.get("admin")?.is_admin === true);
  check("roles: Admin holds every screen", JSON.stringify(by.get("admin")!.perms) === JSON.stringify(all));
  const [old] = await q(sql`select count(*)::int as n from role_permissions where permission like '%.%'`);
  check("roles: no old-style permissions are left", (old.n as number) === 0);
  const [bad] = await q(sql`select count(*)::int as n from users where role_id is null`);
  check("users: everyone has a role", (bad.n as number) === 0);

  const admin = { isAdmin: true, permissions: [] as PermissionKey[] };
  const viewer = { isAdmin: false, permissions: ["execution", "creators", "products"] as PermissionKey[] };
  check("can: Admin opens every screen, even one added later", PERMISSIONS.every((p) => can(admin, p.key)) && can(admin, "future" as PermissionKey));
  check("can: a role opens only the screens it was given", can(viewer, "execution") && can(viewer, "creators") && can(viewer, "products") && !can(viewer, "sync") && !can(viewer, "users") && !can(viewer, "settings"));
  check("can: nothing ticked opens nothing", PERMISSIONS.every((p) => !can({ isAdmin: false, permissions: [] }, p.key)));

  const on = withDependencies(["products"], "sync", true);
  check("toggle: switching a screen on adds only that screen", on.length === 2 && on.includes("sync") && on.includes("products"));
  const off = withDependencies(["execution", "products"], "execution", false);
  check("toggle: switching a screen off removes only that screen", off.length === 1 && off[0] === "products");
  check("menu: every menu screen names one permission and each is known", Object.values(SCREEN_PERMISSION).every((k) => PERMISSIONS.some((p) => p.key === k)) && Object.keys(SCREEN_PERMISSION).length === 7);

  // The migration keeps who was who: an admin user is still on the Admin role.
  const owners = await q(sql`select u.email from users u join roles r on r.id = u.role_id where r.is_admin`);
  check("users: at least one active person is on the Admin role", owners.length >= 1);
  await q(sql`delete from users where email like 'e2e-%'`);
  await q(sql`delete from roles where key like 'e2e-%'`);
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
