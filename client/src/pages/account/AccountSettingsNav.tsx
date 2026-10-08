import React from "react";
import { Button } from "@promptstudio/system/components/ui/button";
import profileIcon from "@/assets/design-system/account-profile.svg";
import signoutIcon from "@/assets/design-system/account-signout.svg";

export interface AccountSettingsNavProps {
  onSignOut: () => void;
  isSigningOut: boolean;
}

export function AccountSettingsNav({
  onSignOut,
  isSigningOut,
}: AccountSettingsNavProps): React.ReactElement {
  return (
    <nav
      aria-label="Account settings"
      className="flex flex-none items-center gap-4 bg-chrome p-2 md:w-[184px] md:flex-col md:items-stretch md:pb-6 md:pt-10"
    >
      <h2 className="hidden text-body-lg font-normal leading-7 md:block">
        Settings
      </h2>
      <Button
        asChild
        variant="secondary"
        size="sm"
        className="bg-active px-6 md:w-[176px]"
      >
        <span aria-current="page">
          <img src={profileIcon} alt="" draggable={false} />
          Personal profile
        </span>
      </Button>
      <div className="flex-1" />
      <Button
        type="button"
        variant="secondary"
        onClick={onSignOut}
        loading={isSigningOut}
        className="shrink-0 md:w-full"
      >
        <img src={signoutIcon} alt="" draggable={false} />
        Sign out
      </Button>
    </nav>
  );
}
