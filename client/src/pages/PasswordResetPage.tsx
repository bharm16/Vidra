import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  ShieldAlert,
} from "@promptstudio/system/components/ui";
import { getAuthRepository } from "@repositories/index";
import { useToast } from "@components/Toast";
import { Button } from "@promptstudio/system/components/ui/button";
import { Input } from "@promptstudio/system/components/ui/input";
import { AuthShell } from "./auth/AuthShell";

function getSafeRedirect(search: string): string | null {
  const params = new URLSearchParams(search);
  const raw = params.get("redirect");
  if (!raw) return null;
  if (!raw.startsWith("/")) return null;
  if (raw.startsWith("//")) return null;
  return raw;
}

function getOobCode(search: string): string | null {
  const params = new URLSearchParams(search);
  const code = params.get("oobCode");
  return code ? code.trim() : null;
}

function getMode(search: string): string | null {
  const params = new URLSearchParams(search);
  const mode = params.get("mode");
  return mode ? mode.trim() : null;
}

function Spinner(): React.ReactElement {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

function mapResetError(error: unknown): string {
  if (!error || typeof error !== "object")
    return "Something went wrong. Please try again.";
  const code =
    "code" in error && typeof error.code === "string" ? error.code : null;

  switch (code) {
    case "auth/invalid-action-code":
      return "That reset link is invalid or already used.";
    case "auth/expired-action-code":
      return "That reset link has expired. Request a new one.";
    case "auth/weak-password":
      return "Password is too weak. Use at least 6 characters.";
    case "auth/user-disabled":
      return "This account is disabled.";
    case "auth/too-many-requests":
      return "Too many attempts. Try again in a bit.";
    default:
      return "Failed to reset password. Please try again.";
  }
}

type ResetState = "idle" | "checking" | "ready" | "success" | "error";

export function PasswordResetPage(): React.ReactElement {
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const redirect = getSafeRedirect(location.search);
  const oobCode = getOobCode(location.search);
  const mode = getMode(location.search);

  const [resetState, setResetState] = React.useState<ResetState>(
    oobCode ? "checking" : "idle",
  );
  const [email, setEmail] = React.useState<string | null>(null);
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [isBusy, setIsBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setError(null);
    setEmail(null);
    setPassword("");
    setConfirmPassword("");

    if (!oobCode) {
      setResetState("idle");
      return;
    }

    if (mode && mode !== "resetPassword") {
      setResetState("error");
      setError("This link is not a password reset link.");
      return;
    }

    let cancelled = false;
    setResetState("checking");

    (async () => {
      try {
        const linkedEmail =
          await getAuthRepository().validatePasswordResetCode(oobCode);
        if (cancelled) return;
        setEmail(linkedEmail);
        setResetState("ready");
      } catch (err) {
        if (cancelled) return;
        setResetState("error");
        setError(mapResetError(err));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mode, oobCode]);

  const continuePath = redirect ?? "/";
  const signInLink = `/signin?redirect=${encodeURIComponent(continuePath)}`;
  const forgotPasswordLink = `/forgot-password${redirect ? `?redirect=${encodeURIComponent(redirect)}` : ""}`;

  const handleSubmit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (!oobCode) return;

    setError(null);

    const normalizedPassword = password;
    if (!normalizedPassword) {
      setError("Enter a new password.");
      return;
    }
    if (normalizedPassword.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (normalizedPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsBusy(true);
    try {
      await getAuthRepository().confirmPasswordResetWithCode(
        oobCode,
        normalizedPassword,
      );
      setResetState("success");
      toast.success("Password updated.");
    } catch (err) {
      setError(mapResetError(err));
      toast.error("Password reset failed.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleContinue = (): void => {
    navigate(signInLink, { replace: true });
  };

  return (
    <AuthShell
      title="Set a new password"
      footer={
        <>
          Remembered it?{" "}
          <Link to={signInLink} className="text-foreground hover:underline">
            Back to sign in
          </Link>
          .
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-muted text-[13px] leading-relaxed">
          Choose a strong password you'll remember.
        </p>

        {error ? (
          <div
            role="alert"
            className="rounded-lg border border-[color:var(--ps-badge-danger-border)] bg-[color:var(--ps-badge-danger-bg)] px-3.5 py-2.5"
          >
            <div className="flex items-start gap-2.5">
              <ShieldAlert
                className="text-danger mt-0.5 h-4 w-4 shrink-0"
                aria-hidden="true"
              />
              <div className="min-w-0">
                <p className="text-danger text-[13px] font-semibold">
                  Action required
                </p>
                <p className="text-danger mt-0.5 text-[13px] leading-snug opacity-80">
                  {error}
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {resetState === "idle" ? (
          <div className="border-border bg-surface-2 rounded-lg border px-3.5 py-3">
            <div className="flex items-start gap-2.5">
              <span className="border-border bg-surface-3 mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border">
                <KeyRound className="text-faint h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-foreground text-[13px] font-semibold">
                  Open your reset link
                </p>
                <p className="text-muted mt-1 text-[13px] leading-snug">
                  This page needs a secure code from your email. Use the link we
                  sent you.
                </p>
                <div className="mt-3">
                  <Button asChild className="w-full">
                    <Link to={forgotPasswordLink}>
                      Request a new reset email
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {resetState === "checking" ? (
          <div className="border-border bg-surface-2 rounded-lg border px-3.5 py-3">
            <div className="flex items-start gap-2.5">
              <span className="border-border bg-surface-3 mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border">
                <Spinner />
              </span>
              <div className="min-w-0">
                <p className="text-foreground text-[13px] font-semibold">
                  Validating link…
                </p>
                <p className="text-muted mt-1 text-[13px] leading-snug">
                  Checking that your reset link is still active.
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {resetState === "error" ? (
          <div className="border-border bg-surface-2 rounded-lg border px-3.5 py-3">
            <div className="flex items-start gap-2.5">
              <span className="border-border bg-surface-3 mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border">
                <KeyRound className="text-faint h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-foreground text-[13px] font-semibold">
                  Get a fresh link
                </p>
                <p className="text-muted mt-1 text-[13px] leading-snug">
                  If this link expired or was already used, request a new reset
                  email.
                </p>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Button asChild className="w-full">
                    <Link to={forgotPasswordLink}>Request new email</Link>
                  </Button>
                  <Button asChild variant="secondary" className="w-full">
                    <Link to={signInLink}>Back to sign in</Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {resetState === "success" ? (
          <div className="rounded-lg border border-[color:var(--ps-badge-success-border)] bg-[color:var(--ps-badge-success-bg)] px-3.5 py-2.5">
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[color:var(--ps-badge-success-border)] bg-[color:var(--ps-badge-success-bg)]">
                <CheckCircle2
                  className="animate-scale-in h-4 w-4 text-[color:var(--ps-badge-success-text)]"
                  aria-hidden="true"
                />
              </span>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-[color:var(--ps-badge-success-text)]">
                  Password updated
                </p>
                <p className="mt-0.5 text-[13px] leading-snug text-[color:var(--ps-badge-success-text)] opacity-70">
                  You're good. Sign in with your new password.
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {resetState === "ready" ? (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
            <div className="border-border bg-surface-2 rounded-lg border px-3.5 py-2.5">
              <p className="text-overline text-faint">Resetting for</p>
              <p className="text-foreground mt-1 text-[13px] font-medium">
                {email}
              </p>
            </div>

            <div>
              <label className="text-overline text-faint">New password</label>
              <div className="relative mt-1">
                <Input
                  className="pr-10"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder="At least 6 characters"
                  disabled={isBusy}
                />
                <Button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  variant="ghost"
                  size="icon"
                  className="absolute right-1.5 top-1/2 h-6 w-6 -translate-y-1/2 rounded-md p-0"
                  disabled={isBusy}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                </Button>
              </div>
            </div>

            <div>
              <label className="text-overline text-faint">
                Confirm password
              </label>
              <div className="mt-1">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder="Repeat your password"
                  disabled={isBusy}
                />
              </div>
            </div>

            <Button type="submit" disabled={isBusy} className="w-full">
              {isBusy ? <Spinner /> : null}
              Update password
            </Button>

            <div className="flex items-center justify-between gap-3">
              <Link
                to={signInLink}
                className="text-faint hover:text-foreground text-[12px] font-medium transition"
              >
                Back to sign in
              </Link>
              <Link
                to={forgotPasswordLink}
                className="text-ghost hover:text-foreground text-[12px] font-medium transition"
              >
                New link
              </Link>
            </div>
          </form>
        ) : null}

        {resetState === "success" ? (
          <Button
            type="button"
            onClick={handleContinue}
            variant="secondary"
            className="w-full"
          >
            Continue to sign in
          </Button>
        ) : null}
      </div>
    </AuthShell>
  );
}
