/**
 * Type definitions for AppShell navigation system.
 *
 * @see ARCHITECTURE_STANDARD.md Section 1 - Frontend Component Structure
 */

import type { ReactNode } from "react";
import type { User } from "@features/prompt-optimizer";

/** Available shell variants based on route */
export type ShellVariant = "topnav" | "sidebar" | "none";
// -----------------------------------------------------------------------------
// Component Props
// -----------------------------------------------------------------------------

/** Props for BrandLogo component */
export interface BrandLogoProps {
  readonly variant: "topnav" | "sidebar" | "sidebar-collapsed";
  readonly className?: string;
}

/** Props for UserMenu component */
export interface UserMenuProps {
  readonly user: User | null;
  readonly variant: "topnav" | "sidebar";
  readonly className?: string;
}

/** Props for TopNavbar variant */
export interface TopNavbarProps {
  readonly user: User | null;
}

/** Props for main AppShell component */
export interface AppShellProps {
  readonly children: ReactNode;
}

// -----------------------------------------------------------------------------
// Hook Return Types
// -----------------------------------------------------------------------------

/** Return type for useNavigationConfig hook */
export interface NavigationConfig {
  readonly variant: ShellVariant;
  readonly currentPath: string;
}
