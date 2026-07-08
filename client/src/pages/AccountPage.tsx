import React from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Avatar,
  Badge,
  CreditCard,
  FileText,
  LogOut,
  Mail,
  SlidersHorizontal,
  Sparkles,
} from "@promptstudio/system/components/ui";
import { getAuthRepository } from "@repositories/index";
import { useToast } from "@components/Toast";
import { Button } from "@promptstudio/system/components/ui/button";
import { useAuthUser } from "@hooks/useAuthUser";
import type { User } from "@features/prompt-optimizer";
import { AuthShell } from "./auth/AuthShell";

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

  const label = user ? formatUserLabel(user) : null;
  const avatarInitial = (label?.title ?? "Account").charAt(0).toUpperCase();
  const email = user && typeof user.email === "string" ? user.email : "";
  const isVerified =
    user && typeof user.emailVerified === "boolean"
      ? user.emailVerified
      : false;
  const resetPasswordLink = email
    ? `/forgot-password?email=${encodeURIComponent(email)}&redirect=${encodeURIComponent("/account")}`
    : `/forgot-password?redirect=${encodeURIComponent("/account")}`;

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

  return (
    <AuthShell
      variant="page"
      title="Account"
      footer={
        user ? undefined : (
          <>
            Need an account?{" "}
            <Link to="/signup" className="text-foreground hover:underline">
              Create one
            </Link>
            {"."}
          </>
        )
      }
    >
      {user ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <Avatar fallback={avatarInitial} />
            <div className="min-w-0">
              <h2 className="text-foreground text-[15px] font-semibold tracking-tight">
                {label?.title}
              </h2>
              <p className="text-muted mt-0.5 text-[13px]">{label?.subtitle}</p>
            </div>
          </div>

          <div className="border-border bg-surface-1 rounded-lg border px-3.5 py-3">
            <div className="flex items-start gap-2.5">
              <Sparkles
                className="text-faint mt-0.5 h-4 w-4 shrink-0"
                aria-hidden="true"
              />
              <div className="min-w-0">
                <p className="text-foreground text-[13px] font-semibold">
                  Sync is on
                </p>
                <p className="text-muted mt-1 text-[13px] leading-snug">
                  Prompt history is saved to the cloud when you're signed in.
                </p>
              </div>
            </div>
          </div>

          <div className="border-border bg-surface-1 rounded-lg border px-3.5 py-3">
            <div className="flex items-start gap-2.5">
              <Mail
                className="text-faint mt-0.5 h-4 w-4 shrink-0"
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <p className="text-foreground text-[13px] font-semibold">
                  Email
                </p>
                <p className="text-muted mt-1 text-[13px] leading-snug">
                  {email || "—"}
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Badge variant={isVerified ? "success" : "warning"} size="sm">
                    {isVerified ? "Verified" : "Not verified"}
                  </Badge>

                  {!isVerified ? (
                    <Button
                      type="button"
                      onClick={handleResendVerification}
                      disabled={isBusy}
                      variant="outline"
                      className="h-7 rounded-full px-3 text-[12px] font-semibold"
                    >
                      Resend verification
                    </Button>
                  ) : null}

                  {!isVerified ? (
                    <Link
                      to="/email-verification?redirect=%2Faccount"
                      className="text-faint hover:text-foreground text-[12px] font-semibold hover:underline"
                    >
                      Open verification page
                    </Link>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2">
            <Button asChild variant="secondary" className="w-full">
              <Link to="/history">Open history</Link>
            </Button>

            <Button asChild variant="outline" className="w-full">
              <Link to={resetPasswordLink}>Reset password</Link>
            </Button>

            <Button asChild variant="ghost" className="w-full">
              <Link to="/settings/billing">
                <CreditCard className="h-3.5 w-3.5" aria-hidden="true" />
                Billing
              </Link>
            </Button>

            <Button asChild variant="ghost" className="w-full">
              <Link to="/settings/billing/invoices">
                <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                Invoices
              </Link>
            </Button>

            <Button asChild variant="outline" className="w-full sm:col-span-2">
              <Link to="/?settings=1">
                <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
                Preferences
              </Link>
            </Button>
          </div>

          <Button
            type="button"
            onClick={handleSignOut}
            disabled={isBusy}
            variant="outline"
            className="text-danger hover:text-danger w-full hover:border-[color:var(--ps-badge-danger-border)] hover:bg-[color:var(--ps-badge-danger-bg)]"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
            Sign out
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <h2 className="text-foreground text-[15px] font-semibold tracking-tight">
            You're not signed in
          </h2>
          <p className="text-muted text-[13px] leading-relaxed">
            Sign in to sync prompt history and use Firestore storage across
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
        </div>
      )}
    </AuthShell>
  );
}
