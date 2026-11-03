import {
  Beaker,
  Gauge,
  TrendingUp,
  Truck,
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
  /** Highlight only on this exact path (not on sub-pages). */
  exact?: boolean;
};
/** `collapsible` groups are closed unless the current page is inside them. */
export type NavGroup = { label: string; items: NavItem[]; collapsible?: boolean };

/** Operational destinations first; analysis and administration are folded away. One entry per kind of information. */
export const NAV: NavGroup[] = [
  {
    label: "Work",
    items: [
      { href: "/command", label: "Command centre", icon: Gauge, min: "admin" },
      { href: "/today", label: "Today's Work", icon: ClipboardList, badge: "actions" },
      { href: "/affiliates", label: "Affiliates", icon: Contact, usesPeriod: true, exact: true },
      { href: "/samples", label: "Samples", icon: Beaker, usesPeriod: true },
      { href: "/progress", label: "Progress", icon: LineChart, min: "admin" },
    ],
  },
  {
    label: "Operations",
    collapsible: true,
    items: [
      { href: "/order-health", label: "Order health", icon: Truck },
      { href: "/demand", label: "Demand planning", icon: TrendingUp },
    ],
  },
  {
    label: "Analysis",
    collapsible: true,
    items: [
      { href: "/", label: "Sales overview", icon: LayoutDashboard, usesPeriod: true, exact: true },
      { href: "/affiliates/analysis", label: "Affiliate analysis", icon: Contact, usesPeriod: true },
      { href: "/content", label: "Content", icon: Video, usesPeriod: true },
      { href: "/products", label: "Products", icon: Package, usesPeriod: true },
      { href: "/opportunities", label: "Segments & scenarios", icon: Target, usesPeriod: true },
      { href: "/orders", label: "Shop orders", icon: ShoppingCart, usesPeriod: true },
    ],
  },
  {
    label: "Administration",
    collapsible: true,
    items: [
      { href: "/data", label: "Data hub", icon: Database, min: "manager" },
      { href: "/settings", label: "Settings", icon: Settings, min: "admin" },
    ],
  },
];
