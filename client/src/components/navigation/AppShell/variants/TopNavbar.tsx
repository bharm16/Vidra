/**
 * Horizontal navigation for marketing pages.
 */

import type { ReactElement } from "react";
import { BrandLogo } from "../shared/BrandLogo";
import { NavLinks } from "../shared/NavLinks";
import { UserMenu } from "../shared/UserMenu";
import type { TopNavbarProps } from "../types";

export function TopNavbar({ navItems, user }: TopNavbarProps): ReactElement {
  return (
    <header
      className="z-fixed border-border bg-app fixed inset-x-0 top-0 box-border w-full border-b py-4"
      style={{ height: "var(--global-top-nav-height)" }}
      role="banner"
    >
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-5">
        <div className="flex items-center gap-6">
          <BrandLogo variant="topnav" />
          <NavLinks
            items={navItems}
            variant="horizontal"
            className="hidden sm:flex"
          />
        </div>
        <UserMenu user={user} variant="topnav" />
      </div>
    </header>
  );
}
