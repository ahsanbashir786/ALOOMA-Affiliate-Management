import { Banknote, Boxes, Compass, ListTodo, UserCheck, Clapperboard, PackageSearch, Send, RefreshCw, Rocket, Settings, Users, type LucideIcon } from "lucide-react";
import type { PermissionKey } from "@/lib/permissions";

export type NavChild = { href: string; label: string; /** The value of ?channel= that makes this child the open one (empty = none). */ channel: string };
export type NavItem = { /** Small items shown under this one. */ children?: NavChild[]; href: string; label: string; icon: LucideIcon; /** The permission that opens this screen. */ perm: PermissionKey; /** A screen with parts under different permissions opens with any of these (Settings: Connection and User Management). */ perms?: PermissionKey[] };
export type NavGroup = { label: string; items: NavItem[] };

/** The whole menu. Everyone sees every item; a role without the permission gets the Permission Denied page when opening it. */
export const NAV: NavGroup[] = [
  {
    label: "Affiliates",
    items: [
      { href: "/affiliate", label: "Command", icon: Compass, perm: "creators" },
      { href: "/affiliate/outreach", label: "Creator Outreach", icon: Send, perm: "creators" },
      { href: "/creators", label: "Creators", icon: Users, perm: "creators" },
      { href: "/affiliate/products", label: "Products", icon: PackageSearch, perm: "creators", perms: ["creators", "products"] },
      { href: "/affiliate/content", label: "Content", icon: Clapperboard, perm: "creators" },
      { href: "/affiliate/actions", label: "Actions", icon: ListTodo, perm: "creators", perms: ["creators", "execution"] },
      { href: "/affiliate/team", label: "Team", icon: UserCheck, perm: "creators" },
    ],
  },
  {
    label: "Advertising",
    items: [{ href: "/ads", label: "GMV Max", icon: Rocket, perm: "ads" }],
  },
  {
    label: "Profit",
    items: [
      { href: "/profit", label: "Profit And Loss", icon: Banknote, perm: "profit", children: [{ href: "/profit", label: "All", channel: "" }, { href: "/profit?channel=tiktok", label: "TikTok", channel: "tiktok" }, { href: "/profit?channel=shopee", label: "Shopee", channel: "shopee" }] },
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
