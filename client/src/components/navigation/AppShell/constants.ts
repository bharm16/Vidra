/**
 * Static configuration for navigation system.
 *
 * @see STYLE_RULES.md Section 3 - No Magic Strings
 */

import {
  Clock,
  CreditCard,
  FileText,
  Home,
  MessageCircle,
  Package,
  Layers,
  Video,
} from "@promptstudio/system/components/ui";
import type { NavItem } from "./types";
import { FEATURES } from "@/config/features.config";

// -----------------------------------------------------------------------------
// Route Configuration
// -----------------------------------------------------------------------------

/** Routes that should show no shell (auth pages) */
export const AUTH_ROUTES = [
  "/signin",
  "/signup",
  "/forgot-password",
  "/email-verification",
  "/reset-password",
  "/account",
  "/login",
  "/register",
  "/settings/billing",
  "/settings/billing/invoices",
] as const;

/** Route prefixes that trigger sidebar variant */
export const WORKSPACE_ROUTE_PREFIXES = ["/prompt/", "/session/"] as const;

/** Exact routes that trigger sidebar variant */
export const WORKSPACE_ROUTES_EXACT = ["/", "/assets", "/consistent"] as const;

// -----------------------------------------------------------------------------
// Navigation Items
// -----------------------------------------------------------------------------

/**
 * All navigation items with visibility configuration.
 *
 * - showInTopNav: Visible in horizontal marketing navbar
 * - showInSidebar: Visible in vertical workspace sidebar
 *
 * Marketing destinations are parked out of the top nav until they have real
 * content — the gallery landing's nav carries only the wordmark and the
 * auth-aware action (ADR-0008, design-overhaul decision 6). Their routes
 * stay live; only the nav links are gone.
 */
const ALL_NAV_ITEMS: readonly NavItem[] = [
  {
    to: "/home",
    label: "Home",
    icon: Home,
    showInTopNav: false,
    showInSidebar: true,
  },
  {
    to: "/assets",
    label: "Assets",
    icon: Layers,
    showInTopNav: false,
    showInSidebar: true,
  },
  {
    to: "/consistent",
    label: "Consistency",
    icon: Video,
    showInTopNav: false,
    showInSidebar: true,
  },
  {
    to: "/products",
    label: "Products",
    icon: Package,
    showInTopNav: false,
    showInSidebar: true,
  },
  {
    to: "/pricing",
    label: "Pricing",
    icon: CreditCard,
    showInTopNav: false,
    showInSidebar: true,
  },
  {
    to: "/docs",
    label: "Docs",
    icon: FileText,
    showInTopNav: false,
    showInSidebar: true,
  },
  {
    to: "/contact",
    label: "Support",
    icon: MessageCircle,
    showInTopNav: false,
    showInSidebar: true,
  },
  {
    to: "/history",
    label: "History",
    icon: Clock,
    showInTopNav: false,
    showInSidebar: false,
  },
] as const;

/** Destinations owned by ADR-0002 frozen stacks, hidden while their flag is off. */
const FROZEN_NAV_DESTINATIONS: ReadonlyMap<string, boolean> = new Map([
  ["/consistent", FEATURES.CONTINUITY_UI],
  ["/pricing", FEATURES.BILLING_UI],
]);

export const NAV_ITEMS: readonly NavItem[] = ALL_NAV_ITEMS.filter(
  (item) => FROZEN_NAV_DESTINATIONS.get(item.to) ?? true,
);

// -----------------------------------------------------------------------------
// Type Utilities
// -----------------------------------------------------------------------------

/** Derive literal types from routes */
export type AuthRoute = (typeof AUTH_ROUTES)[number];
export type WorkspaceRoutePrefix = (typeof WORKSPACE_ROUTE_PREFIXES)[number];
export type WorkspaceRouteExact = (typeof WORKSPACE_ROUTES_EXACT)[number];
