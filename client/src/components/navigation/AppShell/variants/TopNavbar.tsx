/**
 * Horizontal navigation for marketing pages.
 */

import type { ReactElement } from "react";
import { BrandLogo } from "../shared/BrandLogo";
import { UserMenu } from "../shared/UserMenu";
import type { TopNavbarProps } from "../types";

export function TopNavbar({ user }: TopNavbarProps): ReactElement {
  return (
    <header
      className="z-sticky fixed inset-x-0 top-0 box-border h-16 w-full border-b-[0.5px] border-white bg-[var(--vidra-public-surface)]"
      role="banner"
    >
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-5">
        <div className="flex items-center gap-6">
          <BrandLogo variant="topnav" />
        </div>
        <UserMenu user={user} variant="topnav" />
      </div>
    </header>
  );
}
