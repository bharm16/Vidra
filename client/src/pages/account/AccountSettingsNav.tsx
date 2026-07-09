import React from "react";

import {
  CreditCard,
  LogOut,
  TrendingUp,
  User,
} from "@promptstudio/system/components/ui";
import type { IconType } from "@promptstudio/system/components/ui";
import { Button } from "@promptstudio/system/components/ui/button";

import { cn } from "@/utils/cn";

import type { AccountSection } from "./constants";
import { Eyebrow } from "./primitives";

interface NavItem {
  id: AccountSection;
  label: string;
  Icon: IconType;
}

const NAV_ITEMS: readonly NavItem[] = [
  { id: "profile", label: "Personal profile", Icon: User },
  { id: "subscription", label: "Subscription", Icon: CreditCard },
  { id: "usage", label: "Usage", Icon: TrendingUp },
];

export interface AccountSettingsNavProps {
  active: AccountSection;
  onSelect: (section: AccountSection) => void;
  onSignOut: () => void;
  isSigningOut: boolean;
}

/**
 * The 236px settings sub-nav — section switcher plus a bottom-anchored sign-out.
 * The app-level nav rail (built separately) will sit to the left of this later.
 */
export function AccountSettingsNav({
  active,
  onSelect,
  onSignOut,
  isSigningOut,
}: AccountSettingsNavProps): React.ReactElement {
  return (
    <nav className="flex w-[236px] flex-none flex-col self-stretch border-r border-white/[0.06] px-4 py-[26px]">
      <Eyebrow className="text-tool-text-subdued px-[10px] pb-[15px] text-[11px] tracking-[0.12em]">
        Settings
      </Eyebrow>

      {NAV_ITEMS.map(({ id, label, Icon }) => {
        const isActive = id === active;
        return (
          <Button
            key={id}
            type="button"
            variant="ghost"
            onClick={() => onSelect(id)}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "mb-[3px] !h-auto w-full justify-start gap-[11px] rounded-[10px] px-[11px] py-[10px] text-[13px] font-medium",
              isActive
                ? "text-foreground bg-white/[0.07] font-semibold hover:bg-white/[0.07]"
                : "text-tool-text-muted hover:text-foreground hover:bg-white/[0.04]",
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Button>
        );
      })}

      <div className="flex-1" />

      <Button
        type="button"
        variant="ghost"
        onClick={onSignOut}
        loading={isSigningOut}
        className="text-danger hover:text-danger !h-auto w-full justify-start gap-[9px] rounded-[9px] px-[10px] py-2 text-[12.5px] font-medium hover:bg-[color:var(--ps-badge-danger-bg)]"
      >
        <LogOut className="h-[15px] w-[15px]" />
        Sign out
      </Button>
    </nav>
  );
}
