/**
 * Unified auth dropdown for both shell variants.
 * Merges SignedInControl (TopNavbar) and AuthMenu (HistorySidebar).
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from "react";
import { Link, useLocation } from "react-router-dom";
import {
  CreditCard,
  LogIn,
  LogOut,
  User as UserIcon,
} from "@promptstudio/system/components/ui";
import { Button } from "@promptstudio/system/components/ui/button";
import { getAuthRepository } from "@repositories/index";
import { useToast } from "@components/Toast";
import { cn } from "@utils/cn";
import type { UserMenuProps } from "../types";

/**
 * Extract display info from user object with fallbacks.
 */
function getUserDisplayInfo(user: NonNullable<UserMenuProps["user"]>): {
  photoURL: string | null;
  displayName: string;
  email: string;
  firstName: string;
  initial: string;
} {
  const photoURL = typeof user.photoURL === "string" ? user.photoURL : null;
  const displayName =
    typeof user.displayName === "string" ? user.displayName.trim() : "";
  const email = typeof user.email === "string" ? user.email.trim() : "";
  const rawFirstName = displayName
    ? (displayName.split(/\s+/)[0] ?? "")
    : email
      ? (email.split("@")[0] ?? "")
      : "";
  const firstName = rawFirstName || "User";
  const initial = firstName.slice(0, 1).toUpperCase();

  return { photoURL, displayName, email, firstName, initial };
}

export function UserMenu({
  user,
  variant,
  className,
}: UserMenuProps): ReactElement {
  const toast = useToast();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const returnTo = encodeURIComponent(`${location.pathname}${location.search}`);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (event: MouseEvent): void => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const handleSignIn = useCallback(async (): Promise<void> => {
    try {
      await getAuthRepository().signInWithGoogle();
    } catch {
      toast.error("Failed to sign in");
    }
  }, [toast]);

  const handleSignOut = useCallback(async (): Promise<void> => {
    try {
      await getAuthRepository().signOut();
      toast.success("Signed out successfully");
    } catch {
      toast.error("Failed to sign out");
    } finally {
      setOpen(false);
    }
  }, [toast]);

  if (!user) {
    if (variant === "sidebar") {
      return (
        <Button
          onClick={handleSignIn}
          size="sm"
          variant="default"
          className={cn("w-full", className)}
          aria-label="Sign in with Google"
        >
          <LogIn className="h-3.5 w-3.5" />
          Sign in
        </Button>
      );
    }

    return (
      <div className={cn("flex items-center", className)}>
        <Button asChild className="rounded-full">
          <Link to={`/signin?redirect=${returnTo}`}>Sign in</Link>
        </Button>
      </div>
    );
  }

  const { photoURL, displayName, email, firstName, initial } =
    getUserDisplayInfo(user);

  if (variant === "sidebar") {
    return (
      <div className={cn("relative", className)} ref={containerRef}>
        <Button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          variant="ghost"
          className="w-full items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-[rgba(255,255,255,0.05)]"
          aria-expanded={open}
          aria-label="User menu"
        >
          {photoURL ? (
            <img
              src={photoURL}
              alt=""
              className="h-9 w-9 flex-shrink-0 rounded-full"
            />
          ) : (
            <div className="bg-surface-3 text-foreground flex h-9 w-9 items-center justify-center rounded-full text-[13px] font-semibold">
              {initial}
            </div>
          )}
          <div className="min-w-0 flex-1 text-left">
            <p className="text-foreground truncate text-[13px] font-semibold">
              {displayName || firstName}
            </p>
            <p className="text-muted truncate text-[12px] font-normal">
              {email}
            </p>
          </div>
        </Button>

        {open && (
          <div className="border-border bg-app absolute bottom-full left-0 mb-2 w-full rounded-lg border py-1 shadow-md">
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="w-full justify-start"
            >
              <Link to="/account" onClick={() => setOpen(false)}>
                <UserIcon className="h-3.5 w-3.5" /> Account
              </Link>
            </Button>
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="w-full justify-start"
            >
              <Link to="/settings/billing" onClick={() => setOpen(false)}>
                <CreditCard className="h-3.5 w-3.5" /> Billing
              </Link>
            </Button>
            <div className="bg-border my-1 h-px" />
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-red-600"
              onClick={handleSignOut}
            >
              <LogOut className="h-3.5 w-3.5" /> Sign out
            </Button>
          </div>
        )}
      </div>
    );
  }

  // Marketing nav (gallery landing): signed-in users get the single
  // "Open workspace" action — account management lives in the workspace
  // (ADR-0008, design-overhaul decision 6).
  return (
    <div className={cn("flex items-center", className)}>
      <Button asChild className="rounded-full">
        <Link to="/">Open workspace</Link>
      </Button>
    </div>
  );
}
