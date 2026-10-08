/**
 * Unified navigation orchestrator.
 *
 * Renders appropriate shell variant based on current route:
 * - 'topnav': Marketing pages (horizontal navbar)
 * - 'sidebar': Workspace pages (vertical sidebar)
 * - 'none': Auth pages (no shell)
 */

import { memo, type ReactElement } from "react";

import { useAuthUser } from "@hooks/useAuthUser";

import type { AppShellProps } from "./types";
import { useNavigationConfig } from "./hooks/useNavigationConfig";
import { TopNavbar } from "./variants/TopNavbar";

export const AppShell = memo(function AppShell(
  props: AppShellProps,
): ReactElement {
  const { children } = props;
  const { variant } = useNavigationConfig();
  const user = useAuthUser();

  if (variant === "none") {
    return <>{children}</>;
  }

  if (variant === "topnav") {
    return (
      <div className="bg-app flex min-h-full flex-col">
        <TopNavbar user={user} />
        <div className="min-h-0 flex-1 pt-[var(--global-top-nav-height)]">
          {children}
        </div>
      </div>
    );
  }

  // The workspace tool rail was removed (ADR-0010 site-scope D7); the sidebar
  // variant now renders only the workspace content. The account affordance and
  // Library link live in the page's WorkspaceTopBar.
  return (
    <div className="bg-app flex h-full min-h-0 overflow-hidden">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-black">
        {children}
      </div>
    </div>
  );
});

AppShell.displayName = "AppShell";
