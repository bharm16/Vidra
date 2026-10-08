import React from "react";
import { Link, useNavigate } from "react-router-dom";

import { Avatar, Badge } from "@promptstudio/system/components/ui";
import { Button } from "@promptstudio/system/components/ui/button";
import { getAuthRepository } from "@repositories/index";
import { useToast } from "@components/Toast";
import { useAuthUser } from "@hooks/useAuthUser";
import type { User } from "@features/prompt-optimizer";

import { NavRail } from "@/components/navigation/NavRail";

import { AccountSettingsNav } from "./account/AccountSettingsNav";
/** Page 21 account profile: real identity and recovery only (#177). */

function formatUserLabel(user: User): { title: string; subtitle: string } {
  const displayName =
    typeof user.displayName === "string" ? user.displayName.trim() : "";
  const email = typeof user.email === "string" ? user.email.trim() : "";
  const emailPrefix = email.split("@")[0] ?? "";
  const title = displayName || emailPrefix || "Account";
  return {
    title,
    subtitle: email ? email : "Signed in",
  };
}

interface PersonalProfileSectionProps {
  title: string;
  emailLabel: string;
  avatarInitial: string;
  isVerified: boolean;
  resetPasswordLink: string;
  isBusy: boolean;
  onResend: () => void;
}

function PersonalProfileSection({
  title,
  emailLabel,
  avatarInitial,
  isVerified,
  resetPasswordLink,
  isBusy,
  onResend,
}: PersonalProfileSectionProps): React.ReactElement {
  return (
    <section className="flex max-w-[800px] flex-col gap-6">
      <h1 className="text-heading font-medium">Profile</h1>
      <div className="flex items-center gap-3">
        <Avatar
          size="xl"
          fallback={avatarInitial}
          className="h-12 w-12 rounded-md border border-border bg-fill text-body"
        />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-foreground text-body-lg font-normal">
              {title}
            </h2>
            <Badge
              variant="neutral"
              size="sm"
              className="border-0 bg-fill px-3 py-2 text-ui font-normal"
            >
              {isVerified ? "Verified" : "Not verified"}
            </Badge>
          </div>
          <div className="text-tool-text-muted mt-1 break-all text-body">
            {emailLabel}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {!isVerified ? (
              <Button
                type="button"
                variant="outline"
                onClick={onResend}
                disabled={isBusy}
                className="!h-auto rounded-full px-3.5 py-1.5 text-meta font-semibold"
              >
                Resend verification
              </Button>
            ) : null}
            <Link
              to={resetPasswordLink}
              className="ps-btn ps-btn--action ps-btn--soft"
            >
              Reset password
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

export function AccountPage(): React.ReactElement {
  const toast = useToast();
  const navigate = useNavigate();
  const [isBusy, setIsBusy] = React.useState(false);
  const user = useAuthUser();

  const handleSignOut = async (): Promise<void> => {
    setIsBusy(true);
    try {
      await getAuthRepository().signOut();
      toast.success("Signed out successfully");
      navigate("/signin", { replace: true });
    } catch {
      toast.error("Failed to sign out");
    } finally {
      setIsBusy(false);
    }
  };

  const handleResendVerification = async (): Promise<void> => {
    if (!user) return;
    setIsBusy(true);
    try {
      await getAuthRepository().sendVerificationEmail("/account");
      toast.success("Verification email sent.");
    } catch {
      toast.error("Failed to send verification email.");
    } finally {
      setIsBusy(false);
    }
  };

  if (!user) {
    return (
      <div className="text-foreground relative isolate flex min-h-[calc(100vh-var(--global-top-nav-height))] w-full items-center justify-center overflow-hidden font-sans [background:var(--background)]">
        <main className="relative mx-auto flex w-full max-w-sm flex-col gap-4 px-6">
          <h1 className="text-foreground text-subhead font-semibold tracking-[-0.015em]">
            You&apos;re not signed in
          </h1>
          <p className="text-tool-text-muted text-ui leading-relaxed">
            Sign in to sync your sessions and pick up where you left off across
            devices.
          </p>
          <div className="flex flex-col gap-2.5">
            <Button asChild className="w-full">
              <Link to="/signin">Sign in</Link>
            </Button>
            <Button asChild variant="secondary" className="w-full">
              <Link to="/signup">Create account</Link>
            </Button>
          </div>
        </main>
      </div>
    );
  }

  const label = formatUserLabel(user);
  const avatarInitial = label.title.charAt(0).toUpperCase();
  const email = typeof user.email === "string" ? user.email : "";
  const isVerified =
    typeof user.emailVerified === "boolean" ? user.emailVerified : false;
  const resetPasswordLink = email
    ? `/forgot-password?email=${encodeURIComponent(email)}&redirect=${encodeURIComponent("/account")}`
    : `/forgot-password?redirect=${encodeURIComponent("/account")}`;

  return (
    <div className="flex h-screen overflow-hidden">
      <NavRail active="account" />
      <div className="text-foreground flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-canvas font-sans md:flex-row">
        <AccountSettingsNav onSignOut={handleSignOut} isSigningOut={isBusy} />

        <main className="min-w-0 flex-1 overflow-y-auto p-6 md:p-10">
          <PersonalProfileSection
            title={label.title}
            emailLabel={label.subtitle}
            avatarInitial={avatarInitial}
            isVerified={isVerified}
            resetPasswordLink={resetPasswordLink}
            isBusy={isBusy}
            onResend={handleResendVerification}
          />
        </main>
      </div>
    </div>
  );
}
