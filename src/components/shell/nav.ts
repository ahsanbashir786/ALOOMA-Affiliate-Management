import {
  Beaker,
  ClipboardList,
  Contact,
  Database,
  Gauge,
  History,
  LayoutDashboard,
  LineChart,
  Package,
  Tags,
  RefreshCw,
  Settings,
  ShoppingCart,
  Target,
  TrendingUp,
  Truck,
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
  /** Highlight only on this exact path (not on sub-pages). */
  exact?: boolean;
  /** Also highlight on these path prefixes. */
  also?: string[];
};
/** `collapsible` groups are closed unless the current page is inside them. */
export type NavGroup = { label: string; items: NavItem[]; collapsible?: boolean; icon?: LucideIcon };

/**
 * One section per kind of work, in the order people use them. Modules rebuilt on the TikTok sync sit at the top;
 * the screens still built on uploaded files wait in "Earlier version" until their module is rebuilt.
 */
export const NAV: NavGroup[] = [
  {
    label: "Overview",
    items: [{ href: "/command", label: "Command centre", icon: Gauge, min: "admin" }],
  },
  {
    label: "Affiliates",
    items: [
      { href: "/creators", label: "Creators", icon: Users, also: ["/creators/"] },
      { href: "/today", label: "Daily Actions", icon: ClipboardList, badge: "actions" },
      { href: "/progress", label: "Progress", icon: LineChart, min: "admin" },
    ],
  },
  {
    label: "Shop operations",
    collapsible: true,
    items: [
      { href: "/order-health", label: "Order health", icon: Truck },
      { href: "/demand", label: "Demand planning", icon: TrendingUp },
    ],
  },
  {
    label: "Reports",
    collapsible: true,
    items: [
      { href: "/", label: "Sales overview", icon: LayoutDashboard, usesPeriod: true, exact: true },
      { href: "/content", label: "Content", icon: Video, usesPeriod: true },
      { href: "/products", label: "Products", icon: Package, usesPeriod: true },
      { href: "/orders", label: "Shop orders", icon: ShoppingCart, usesPeriod: true },
    ],
  },
  {
    label: "Earlier version",
    icon: History,
    collapsible: true,
    items: [
      { href: "/affiliates", label: "Affiliate Data (old)", icon: Contact, usesPeriod: true, exact: true },
      { href: "/affiliates/analysis", label: "Affiliate analysis", icon: Contact, usesPeriod: true },
      { href: "/samples/products", label: "Sample products", icon: Beaker, usesPeriod: true },
      { href: "/samples/report", label: "Sample report", icon: Beaker, usesPeriod: true },
      { href: "/opportunities", label: "Segments & scenarios", icon: Target, usesPeriod: true },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/sync", label: "Data Sync", icon: RefreshCw, min: "manager" },
      { href: "/product-mapping", label: "Product Mapping", icon: Tags, min: "manager" },
      { href: "/data", label: "Data hub", icon: Database, min: "manager" },
      { href: "/settings", label: "Settings", icon: Settings, min: "admin" },
    ],
  },
];
