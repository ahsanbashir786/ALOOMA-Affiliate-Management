// Roles and permissions: the starting roles, the rules for dependencies, and who can open which screen.
// Run: DATABASE_URL=postgres://postgres@localhost:5433/affiliate_test npx tsx --conditions=react-server scripts/test-permissions.ts
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { can } from "@/lib/can";
import { DEFAULT_ROLES, PERMISSIONS, SCREEN_PERMISSION, withDependencies, type PermissionKey } from "@/lib/permissions";

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + extra}`); };
const q = async (s: ReturnType<typeof sql>) => (await db.execute(s)) as unknown as Record<string, unknown>[];

(async () => {
  await q(sql`delete from users where email like 'e2e-%'`);
  await q(sql`delete from roles where key like 'e2e-%'`);
  const roles = await q(sql`select r.key, r.is_admin, array_agg(p.permission order by p.permission) filter (where p.permission is not null) as perms from roles r left join role_permissions p on p.role_id = r.id group by r.key, r.is_admin`);
  const by = new Map(roles.map((r) => [r.key as string, r]));
  check("roles: Admin, Affiliate Manager and Viewer exist", ["admin", "manager", "viewer"].every((k) => by.has(k)));
  check("roles: only Admin is the locked owner role", by.get("admin")!.is_admin === true && by.get("manager")!.is_admin === false && by.get("viewer")!.is_admin === false);
  for (const d of DEFAULT_ROLES) check(`roles: ${d.name} starts with its default permissions`, JSON.stringify([...d.permissions].sort()) === JSON.stringify(by.get(d.key)!.perms), String(by.get(d.key)!.perms));
  const [bad] = await q(sql`select count(*)::int as n from users where role_id is null`);
  check("users: everyone has a role", (bad.n as number) === 0);

  const admin = { isAdmin: true, permissions: [] as PermissionKey[] };
  const viewer = { isAdmin: false, permissions: DEFAULT_ROLES.find((r) => r.key === "viewer")!.permissions };
  const manager = { isAdmin: false, permissions: DEFAULT_ROLES.find((r) => r.key === "manager")!.permissions };
  check("can: Admin may do everything, even a permission added later", PERMISSIONS.every((p) => can(admin, p.key)) && can(admin, "future.thing" as PermissionKey));
  check("can: a Viewer opens the three working screens, not Data Sync, Users or Settings", can(viewer, "execution.view") && can(viewer, "affiliates.view") && can(viewer, "products.view") && !can(viewer, "sync.view") && !can(viewer, "users.manage") && !can(viewer, "tiktok.manage"));
  check("can: a Viewer works on assigned actions but cannot assign, export or record contacts", can(viewer, "execution.work") && !can(viewer, "execution.assign") && !can(viewer, "affiliates.export") && !can(viewer, "affiliates.work"));
  check("can: a Manager runs a sync but cannot manage users or the TikTok connection", can(manager, "sync.run") && !can(manager, "users.manage") && !can(manager, "tiktok.manage"));

  const on = withDependencies([], "execution.assign", true);
  check("dependencies: giving 'assign' also gives 'open the Execution Plan'", on.includes("execution.assign") && on.includes("execution.view"));
  const off = withDependencies(["execution.view", "execution.work", "execution.assign", "products.view"], "execution.view", false);
  check("dependencies: taking away 'open' also takes away what needs it, nothing else", !off.includes("execution.work") && !off.includes("execution.assign") && off.includes("products.view"));
  check("menu: every screen names one permission and each permission is known", Object.values(SCREEN_PERMISSION).every((k) => PERMISSIONS.some((p) => p.key === k)));
  check("permissions: every permission that needs another names a real one", PERMISSIONS.every((p) => !p.requires || PERMISSIONS.some((x) => x.key === p.requires)));

  // The migration keeps who was who: an admin user is still on the Admin role.
  const owners = await q(sql`select u.email from users u join roles r on r.id = u.role_id where r.is_admin`);
  check("users: at least one active person is on the Admin role", owners.length >= 1);
  await q(sql`delete from users where email like 'e2e-%'`);
  await q(sql`delete from roles where key like 'e2e-%'`);
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
