import { Banknote, Boxes, ListChecks, Package, RefreshCw, Rocket, Settings, Users, type LucideIcon } from "lucide-react";
import type { PermissionKey } from "@/lib/permissions";

export type NavItem = { href: string; label: string; icon: LucideIcon; /** The permission that opens this screen. */ perm: PermissionKey; /** A screen with parts under different permissions opens with any of these (Settings: Connection and User Management). */ perms?: PermissionKey[] };
export type NavGroup = { label: string; items: NavItem[] };

/** The whole menu. Everyone sees every item; a role without the permission gets the Permission Denied page when opening it. */
export const NAV: NavGroup[] = [
  {
    label: "Affiliates",
    items: [
      { href: "/execution", label: "Execution Plan", icon: ListChecks, perm: "execution" },
      { href: "/creators", label: "Affiliate Data", icon: Users, perm: "creators" },
      { href: "/products", label: "Product Analysis", icon: Package, perm: "products" },
    ],
  },
  {
    label: "Advertising",
    items: [{ href: "/ads", label: "GMV Max", icon: Rocket, perm: "ads" }],
  },
  {
    label: "Profit",
    items: [
      { href: "/profit", label: "Profit And Loss", icon: Banknote, perm: "profit" },
      { href: "/stock", label: "Stock And Costing", icon: Boxes, perm: "stock" },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/sync", label: "Data Sync", icon: RefreshCw, perm: "sync" },
      { href: "/settings", label: "Settings", icon: Settings, perm: "settings", perms: ["settings", "users"] },
    ],
  },
];

/** Can this person open the screen? (Any of its permissions will do.) */
export const navAllowed = (user: { isAdmin: boolean; permissions: PermissionKey[] }, item: NavItem) => (item.perms ?? [item.perm]).some((p) => user.isAdmin || user.permissions.includes(p));
