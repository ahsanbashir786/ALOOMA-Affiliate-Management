import "server-only";
import { can, firstAllowedScreen, requireUser, type SessionUser } from "@/lib/auth";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { SCREEN_PERMISSION, type PermissionKey } from "@/lib/permissions";
import { NAV } from "@/components/shell/nav";

const LABEL = new Map(NAV.flatMap((g) => g.items).map((i) => [i.href, i.label]));

/**
 * Opens a screen for someone allowed to, otherwise gives back the Permission Denied page to render instead.
 *   const { user, denied } = await gate("products", "Product Analysis");  if (denied) return denied;
 */
export async function gate(permission: PermissionKey, screen: string): Promise<{ user: SessionUser; denied: React.ReactElement | null }> {
  const user = await requireUser();
  if (can(user, permission)) return { user, denied: null };
  const homeHref = firstAllowedScreen(user);
  return {
    user,
    denied: <PermissionDenied need={permission} screen={screen} roleName={user.roleName} home={homeHref ? { href: homeHref, label: LABEL.get(homeHref) ?? "the app" } : null} canManageRoles={can(user, "users")} />,
  };
}
export { SCREEN_PERMISSION };
