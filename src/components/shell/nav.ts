import {
  Beaker,
  ClipboardList,
  Database,
  LayoutDashboard,
  Package,
  ShoppingCart,
  Settings,
  Target,
  Users,
  Video,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/lib/auth";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  min?: Role;
  badge?: "actions";
  usesPeriod?: boolean;
};
export type NavGroup = { label: string; items: NavItem[] };

export const NAV: NavGroup[] = [
  {
    label: "Analyse",
    items: [
      { href: "/", label: "Overview", icon: LayoutDashboard, usesPeriod: true },
      { href: "/creators", label: "Creators", icon: Users, usesPeriod: true },
      { href: "/content", label: "Content", icon: Video, usesPeriod: true },
      { href: "/products", label: "Products", icon: Package, usesPeriod: true },
      { href: "/samples", label: "Samples", icon: Beaker, usesPeriod: true },
      { href: "/orders", label: "Orders", icon: ShoppingCart, usesPeriod: true },
    ],
  },
  {
    label: "Improve",
    items: [
      { href: "/opportunities", label: "Opportunities", icon: Target, usesPeriod: true },
      { href: "/actions", label: "Action centre", icon: ClipboardList, badge: "actions" },
    ],
  },
  {
    label: "Manage",
    items: [
      { href: "/data", label: "Data hub", icon: Database, min: "manager" },
      { href: "/settings", label: "Settings", icon: Settings, min: "admin" },
    ],
  },
];
