/**
 * Hook for detecting route-based shell variant and providing nav configuration.
 *
 * @see ARCHITECTURE_STANDARD.md Section 1 - hooks/
 */

import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import {
  AUTH_ROUTES,
  WORKSPACE_ROUTE_PREFIXES,
  WORKSPACE_ROUTES_EXACT,
} from "../constants";
import type { NavigationConfig, ShellVariant } from "../types";

/**
 * Determines shell variant based on current pathname.
 */
function resolveVariant(pathname: string): ShellVariant {
  if ((AUTH_ROUTES as readonly string[]).includes(pathname)) {
    return "none";
  }

  if ((WORKSPACE_ROUTES_EXACT as readonly string[]).includes(pathname)) {
    return "sidebar";
  }

  const isWorkspacePrefix = WORKSPACE_ROUTE_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix),
  );
  if (isWorkspacePrefix) {
    return "sidebar";
  }

  return "topnav";
}

/**
 * Provides navigation configuration based on current route.
 */
export function useNavigationConfig(): NavigationConfig {
  const location = useLocation();

  const variant = useMemo(
    () => resolveVariant(location.pathname),
    [location.pathname],
  );

  return {
    variant,
    currentPath: location.pathname,
  };
}
