import {
  Beaker,
  Contact,
  ClipboardList,
  Database,
  LayoutDashboard,
  LineChart,
  Package,
  ShoppingCart,
  Settings,
  Target,
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

/** Four main places for the affiliate manager; analysis pages are secondary. */
export const NAV: NavGroup[] = [
  {
    label: "Work",
    items: [
      { href: "/today", label: "Today's Work", icon: ClipboardList, badge: "actions" },
      { href: "/affiliates", label: "Affiliates", icon: Contact, usesPeriod: true },
      { href: "/samples", label: "Samples", icon: Beaker, usesPeriod: true },
      { href: "/progress", label: "Progress", icon: LineChart, min: "admin" },
    ],
  },
  {
    label: "Analysis",
    items: [
      { href: "/", label: "Overview", icon: LayoutDashboard, usesPeriod: true },
      { href: "/content", label: "Content", icon: Video, usesPeriod: true },
      { href: "/products", label: "Products", icon: Package, usesPeriod: true },
      { href: "/opportunities", label: "Opportunities", icon: Target, usesPeriod: true },
      { href: "/orders", label: "Shop orders (detail)", icon: ShoppingCart, usesPeriod: true },
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
