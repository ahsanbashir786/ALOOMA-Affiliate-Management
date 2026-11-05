import { ListChecks, Package, RefreshCw, Settings, ShieldCheck, Users, type LucideIcon } from "lucide-react";
import type { PermissionKey } from "@/lib/permissions";

export type NavItem = { href: string; label: string; icon: LucideIcon; /** The permission that opens this screen. */ perm: PermissionKey };
export type NavGroup = { label: string; items: NavItem[] };

/** The whole menu. Everyone sees every item; a role without the permission gets the Permission Denied page when opening it. */
export const NAV: NavGroup[] = [
  {
    label: "Affiliates",
    items: [
      { href: "/execution", label: "Execution Plan", icon: ListChecks, perm: "execution.view" },
      { href: "/creators", label: "Affiliate Data", icon: Users, perm: "affiliates.view" },
      { href: "/products", label: "Product Analysis", icon: Package, perm: "products.view" },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/sync", label: "Data Sync", icon: RefreshCw, perm: "sync.view" },
      { href: "/users", label: "Users & Roles", icon: ShieldCheck, perm: "users.manage" },
      { href: "/settings", label: "Settings", icon: Settings, perm: "tiktok.manage" },
    ],
  },
];
