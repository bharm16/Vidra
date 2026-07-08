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
import { CreditBalanceProvider } from "@/contexts/CreditBalanceContext";

import type { AppShellProps } from "./types";
import { useNavigationConfig } from "./hooks/useNavigationConfig";
import { TopNavbar } from "./variants/TopNavbar";

export const AppShell = memo(function AppShell(
  props: AppShellProps,
): ReactElement {
  const { children } = props;
  const { variant, navItems } = useNavigationConfig();
  const user = useAuthUser();

  // CreditBalanceProvider must wrap every variant so routes like /account
  // (topnav) and any future auth-less routes can still display the live
  // balance. Consumers null-check `balance` when the user is signed out.
  const withCreditBalance = (content: ReactElement): ReactElement => (
    <CreditBalanceProvider userId={user?.uid ?? null}>
      {content}
    </CreditBalanceProvider>
  );

  if (variant === "none") {
    return withCreditBalance(<>{children}</>);
  }

  if (variant === "topnav") {
    return withCreditBalance(
      <div className="bg-app flex min-h-full flex-col">
        <TopNavbar navItems={navItems.topNav} user={user} />
        <div className="min-h-0 flex-1 pt-[var(--global-top-nav-height)]">
          {children}
        </div>
      </div>,
    );
  }

  // The workspace tool rail was removed (ADR-0010 site-scope D7); the sidebar
  // variant now renders only the workspace content. The account affordance and
  // Library link live in the page's WorkspaceTopBar.
  return withCreditBalance(
    <div className="bg-app flex h-full min-h-0 overflow-hidden">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-black">
        {children}
      </div>
    </div>,
  );
});

AppShell.displayName = "AppShell";
