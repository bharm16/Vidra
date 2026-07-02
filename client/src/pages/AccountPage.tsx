import React from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  CreditCard,
  FileText,
  LogOut,
  Mail,
  SlidersHorizontal,
  Sparkles,
  User as UserIcon,
} from "@promptstudio/system/components/ui";
import { getAuthRepository } from "@repositories/index";
import { useToast } from "@components/Toast";
import { Badge } from "@promptstudio/system/components/ui";
import { Button } from "@promptstudio/system/components/ui/button";
import { useAuthUser } from "@hooks/useAuthUser";
import { useCreditBalance } from "@/contexts/CreditBalanceContext";
import type { User } from "@features/prompt-optimizer";
import { AuthShell } from "./auth/AuthShell";
import {
  AUTH_COLORS,
  AUTH_CTA_CLASS,
  AUTH_CTA_STYLE,
  AUTH_SECONDARY_BTN_CLASS,
  AUTH_SECONDARY_BTN_STYLE,
  AUTH_CARD_STYLE,
} from "./auth/auth-styles";

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
  const { balance: creditBalance, isLoading: isLoadingBalance } =
    useCreditBalance();

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
        user ? (
          <>
            Want to switch accounts?{" "}
            <Button
              type="button"
              onClick={handleSignOut}
              variant="link"
              className="h-auto p-0 align-baseline text-white hover:underline"
              disabled={isBusy}
            >
              Sign out.
            </Button>
          </>
        ) : (
          <>
            Need an account?{" "}
            <Link to="/signup" className="text-white hover:underline">
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
            <span
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
              style={{
                background: AUTH_COLORS.inputBg,
                border: `1px solid ${AUTH_COLORS.inputBorder}`,
              }}
            >
              <UserIcon
                className="h-5 w-5"
                style={{ color: AUTH_COLORS.textDim }}
                aria-hidden="true"
              />
            </span>
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold tracking-tight text-white">
                {label?.title}
              </h2>
              <p
                className="mt-0.5 text-[13px]"
                style={{ color: AUTH_COLORS.textSecondary }}
              >
                {label?.subtitle}
              </p>
            </div>
          </div>

          <div className="px-3.5 py-3" style={AUTH_CARD_STYLE}>
            <div className="flex items-center gap-2.5">
              <CreditCard
                className="h-4 w-4 shrink-0"
                style={{ color: AUTH_COLORS.textDim }}
                aria-hidden="true"
              />
              <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                <p className="text-[13px] font-semibold text-white">
                  Credit balance
                </p>
                <p
                  className="text-[13px] font-semibold tabular-nums"
                  style={{ color: AUTH_COLORS.textSecondary }}
                  data-testid="account-credit-balance"
                >
                  {isLoadingBalance
                    ? "…"
                    : typeof creditBalance === "number"
                      ? `${creditBalance} credits`
                      : "—"}
                </p>
              </div>
            </div>
          </div>

          <div className="px-3.5 py-3" style={AUTH_CARD_STYLE}>
            <div className="flex items-start gap-2.5">
              <Sparkles
                className="mt-0.5 h-4 w-4 shrink-0"
                style={{ color: AUTH_COLORS.textDim }}
                aria-hidden="true"
              />
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-white">
                  Sync is on
                </p>
                <p
                  className="mt-1 text-[13px] leading-snug"
                  style={{ color: AUTH_COLORS.textSecondary }}
                >
                  Prompt history is saved to the cloud when you're signed in.
                </p>
              </div>
            </div>
          </div>

          <div className="px-3.5 py-3" style={AUTH_CARD_STYLE}>
            <div className="flex items-start gap-2.5">
              <Mail
                className="mt-0.5 h-4 w-4 shrink-0"
                style={{ color: AUTH_COLORS.textDim }}
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-white">Email</p>
                <p
                  className="mt-1 text-[13px] leading-snug"
                  style={{ color: AUTH_COLORS.textSecondary }}
                >
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
                      variant="ghost"
                      className="h-7 rounded-full px-3 text-[12px] font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60"
                      style={{
                        background: AUTH_COLORS.card,
                        border: `1px solid ${AUTH_COLORS.cardBorder}`,
                      }}
                    >
                      Resend verification
                    </Button>
                  ) : null}

                  {!isVerified ? (
                    <Link
                      to="/email-verification?redirect=%2Faccount"
                      className="text-[12px] font-semibold hover:text-white hover:underline"
                      style={{ color: AUTH_COLORS.textDim }}
                    >
                      Open verification page
                    </Link>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2">
            <Button
              asChild
              variant="ghost"
              className="h-9 w-full rounded-lg text-[13px] font-semibold text-white transition"
              style={{
                background: AUTH_COLORS.card,
                border: `1px solid ${AUTH_COLORS.cardBorder}`,
              }}
            >
              <Link to="/history">Open history</Link>
            </Button>

            <Button
              asChild
              variant="ghost"
              className="h-9 w-full rounded-lg text-[13px] font-semibold transition"
              style={{
                background: AUTH_COLORS.inputBg,
                border: `1px solid ${AUTH_COLORS.inputBorder}`,
                color: AUTH_COLORS.textSecondary,
              }}
            >
              <Link to={resetPasswordLink}>Reset password</Link>
            </Button>

            <Button
              asChild
              variant="ghost"
              className="h-9 w-full gap-2 rounded-lg text-[13px] font-semibold text-white transition"
              style={{
                background: AUTH_COLORS.card,
                border: `1px solid ${AUTH_COLORS.cardBorder}`,
              }}
            >
              <Link to="/settings/billing">
                <CreditCard className="h-3.5 w-3.5" aria-hidden="true" />
                Billing
              </Link>
            </Button>

            <Button
              asChild
              variant="ghost"
              className="h-9 w-full gap-2 rounded-lg text-[13px] font-semibold transition"
              style={{
                background: AUTH_COLORS.inputBg,
                border: `1px solid ${AUTH_COLORS.inputBorder}`,
                color: AUTH_COLORS.textSecondary,
              }}
            >
              <Link to="/settings/billing/invoices">
                <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                Invoices
              </Link>
            </Button>

            <Button
              asChild
              variant="ghost"
              className="h-9 w-full gap-2 rounded-lg text-[13px] font-semibold text-white transition sm:col-span-2"
              style={{
                background: AUTH_COLORS.card,
                border: `1px solid ${AUTH_COLORS.cardBorder}`,
              }}
            >
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
            variant="ghost"
            className="h-9 w-full gap-2 rounded-lg text-[13px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-60"
            style={{
              background: `${AUTH_COLORS.danger}15`,
              border: `1px solid ${AUTH_COLORS.danger}30`,
              color: AUTH_COLORS.danger,
            }}
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
            Sign out
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <h2 className="text-[15px] font-semibold tracking-tight text-white">
            You're not signed in
          </h2>
          <p
            className="text-[13px] leading-relaxed"
            style={{ color: AUTH_COLORS.textSecondary }}
          >
            Sign in to sync prompt history and use Firestore storage across
            devices.
          </p>
          <div className="flex flex-col gap-2.5">
            <Button
              asChild
              variant="ghost"
              className={AUTH_CTA_CLASS}
              style={AUTH_CTA_STYLE}
            >
              <Link to="/signin">Sign in</Link>
            </Button>
            <Button
              asChild
              variant="ghost"
              className={AUTH_SECONDARY_BTN_CLASS}
              style={AUTH_SECONDARY_BTN_STYLE}
            >
              <Link to="/signup">Create account</Link>
            </Button>
          </div>
        </div>
      )}
    </AuthShell>
  );
}
