/**
 * Static configuration for navigation system.
 *
 * @see STYLE_RULES.md Section 3 - No Magic Strings
 */

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
// Type Utilities
// -----------------------------------------------------------------------------

/** Derive literal types from routes */
export type AuthRoute = (typeof AUTH_ROUTES)[number];
export type WorkspaceRoutePrefix = (typeof WORKSPACE_ROUTE_PREFIXES)[number];
export type WorkspaceRouteExact = (typeof WORKSPACE_ROUTES_EXACT)[number];
