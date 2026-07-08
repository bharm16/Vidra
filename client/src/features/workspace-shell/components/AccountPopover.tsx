import { useState, type ReactElement } from "react";
import { Link } from "react-router-dom";
import {
  CheckCircle,
  LogOut,
  User as UserIcon,
} from "@promptstudio/system/components/ui";
import { Button } from "@promptstudio/system/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@promptstudio/system/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@promptstudio/system/components/ui/tooltip";
import { getAuthRepository } from "@repositories/index";
import { useToast } from "@components/Toast";
import type { User } from "@features/prompt-optimizer";

interface AccountPopoverProps {
  user: User;
}

/**
 * The workspace's single account affordance. Clicking the avatar opens a
 * popover in place — never a navigation — per the UX rule "Tools persist.
 * Navigation interrupts." Leaving the workspace (Manage account) is an
 * explicit, labeled action inside the popover.
 *
 * Self-contained: wraps its own TooltipProvider so it is portable across
 * hosts (it previously relied on the tool rail's ambient provider).
 */
export function AccountPopover({ user }: AccountPopoverProps): ReactElement {
  const toast = useToast();
  const [open, setOpen] = useState(false);

  const photoURL = typeof user.photoURL === "string" ? user.photoURL : null;
  const displayName =
    typeof user.displayName === "string" ? user.displayName.trim() : "";
  const email = typeof user.email === "string" ? user.email.trim() : "";
  const initial = (displayName || email || "U").slice(0, 1).toUpperCase();

  const handleSignOut = async (): Promise<void> => {
    try {
      await getAuthRepository().signOut();
      toast.success("Signed out");
    } catch {
      toast.error("Failed to sign out");
    } finally {
      setOpen(false);
    }
  };

  const avatarChip = photoURL ? (
    <img
      src={photoURL}
      alt=""
      className="h-8 w-8 rounded-lg object-cover"
      referrerPolicy="no-referrer"
    />
  ) : (
    <div className="bg-surface-2 flex h-8 w-8 items-center justify-center rounded-lg">
      <span className="text-body-sm font-bold text-white">{initial}</span>
    </div>
  );

  return (
    <TooltipProvider>
      <Popover open={open} onOpenChange={setOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="rounded-lg"
                aria-label="Account"
              >
                {avatarChip}
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="right">Account</TooltipContent>
        </Tooltip>
        <PopoverContent
          side="right"
          align="end"
          sideOffset={10}
          className="p-ps-2 w-64"
        >
          <div className="flex items-center gap-3 px-2 py-2">
            {avatarChip}
            <div className="min-w-0">
              {displayName ? (
                <p className="text-foreground truncate text-sm font-medium">
                  {displayName}
                </p>
              ) : null}
              <p className="text-muted truncate text-xs">{email}</p>
            </div>
          </div>
          <p className="text-muted flex items-center gap-1.5 px-2 pb-2 text-xs">
            <CheckCircle className="h-3.5 w-3.5" aria-hidden="true" />
            Synced to cloud
          </p>
          <div className="bg-border my-1 h-px" aria-hidden="true" />
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="w-full justify-start"
          >
            <Link to="/account" onClick={() => setOpen(false)}>
              <UserIcon className="h-3.5 w-3.5" aria-hidden="true" />
              Manage account
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            onClick={handleSignOut}
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
            Sign out
          </Button>
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  );
}
