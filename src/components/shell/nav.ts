import { ListChecks, Package, RefreshCw, Settings, Users, type LucideIcon } from "lucide-react";
import type { Role } from "@/lib/auth";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  min?: Role;
  /** Also highlight on these path prefixes. */
  also?: string[];
};
export type NavGroup = { label: string; items: NavItem[] };

/** The whole menu: the five screens of the system. */
export const NAV: NavGroup[] = [
  {
    label: "Affiliates",
    items: [
      { href: "/execution", label: "Execution Plan", icon: ListChecks },
      { href: "/creators", label: "Affiliate Data", icon: Users },
      { href: "/products", label: "Product Analysis", icon: Package },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/sync", label: "Data Sync", icon: RefreshCw, min: "manager" },
      { href: "/settings", label: "Settings", icon: Settings, min: "admin" },
    ],
  },
];
