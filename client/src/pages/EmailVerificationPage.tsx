import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  CheckCircle2,
  Mail,
  RefreshCw,
  ShieldAlert,
} from "@promptstudio/system/components/ui";
import { getAuthRepository } from "@repositories/index";
import { useToast } from "@components/Toast";
import { Button } from "@promptstudio/system/components/ui/button";
import { useAuthUser } from "@hooks/useAuthUser";
import { AuthShell } from "./auth/AuthShell";
import { Spinner } from "./auth/Spinner";
import { readActionMode, readOobCode, safeRedirect } from "./auth/authParams";
import { authErrorCopy } from "./auth/authErrorCopy";

function getInitialEmail(search: string): string {
  const params = new URLSearchParams(search);
  const raw = params.get("email");
  if (!raw) return "";
  return raw.trim();
}

type VerifyState = "idle" | "verifying" | "verified" | "error";
type DeliveryState = "sent" | "failed";
type EmailVerificationNavState = {
  delivery?: DeliveryState;
};

function getDeliveryState(state: unknown): DeliveryState | undefined {
  if (!state || typeof state !== "object" || !("delivery" in state))
    return undefined;
  const delivery = state.delivery;
  return delivery === "sent" || delivery === "failed" ? delivery : undefined;
}

export function EmailVerificationPage(): React.ReactElement {
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const redirect = safeRedirect(location.search);
  const oobCode = readOobCode(location.search);
  const mode = readActionMode(location.search);

  const user = useAuthUser();
  const [verifyState, setVerifyState] = React.useState<VerifyState>("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [isResending, setIsResending] = React.useState(false);
  const [resendCooldown, setResendCooldown] = React.useState(0);
  const [emailHint, setEmailHint] = React.useState(() =>
    getInitialEmail(location.search),
  );
  const [deliveryState, setDeliveryState] = React.useState<
    DeliveryState | undefined
  >(() =>
    getDeliveryState(location.state as EmailVerificationNavState | undefined),
  );

  React.useEffect(() => {
    const initial = getInitialEmail(location.search);
    setEmailHint(initial);
  }, [location.search]);

  React.useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = window.setInterval(() => {
      setResendCooldown((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [resendCooldown]);

  React.useEffect(() => {
    if (!oobCode) return;
    if (mode && mode !== "verifyEmail") {
      setVerifyState("error");
      setError("This link is not an email verification link.");
      return;
    }

    let cancelled = false;
    setVerifyState("verifying");
    setError(null);

    (async () => {
      try {
        await getAuthRepository().verifyEmailWithCode(oobCode);
        try {
          await getAuthRepository().refreshCurrentUser();
        } catch {
          // ignore refresh failures; verification already succeeded
        }
        if (cancelled) return;
        setVerifyState("verified");
        toast.success("Email verified.");
      } catch (err) {
        if (cancelled) return;
        setVerifyState("error");
        setError(authErrorCopy(err, "verifyEmail"));
        toast.error("Email verification failed.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mode, oobCode, toast]);

  const continuePath = redirect ?? "/";
  const continueLink = user
    ? continuePath
    : `/signin?redirect=${encodeURIComponent(continuePath)}`;

  const userEmail = user && typeof user.email === "string" ? user.email : "";
  const displayEmail = (userEmail || emailHint).trim();
  const isEmailVerified =
    user && typeof user.emailVerified === "boolean"
      ? user.emailVerified
      : false;

  const handleResend = async (): Promise<void> => {
    setError(null);
    setIsResending(true);
    try {
      await getAuthRepository().sendVerificationEmail(redirect ?? undefined);
      setDeliveryState("sent");
      setResendCooldown(30);
    } catch (err) {
      setError(authErrorCopy(err, "resendVerification"));
    } finally {
      setIsResending(false);
    }
  };

  const handleContinue = (): void => {
    if (user) {
      navigate(continuePath, { replace: true });
      return;
    }
    navigate(continueLink, { replace: true });
  };

  const showVerifiedPanel = verifyState === "verified" || isEmailVerified;
  const showVerifyInProgress = verifyState === "verifying";
  const showInlineError =
    Boolean(error) && !showVerifiedPanel && !showVerifyInProgress;
  const showDeliveryFailurePanel =
    deliveryState === "failed" && !showVerifiedPanel;
  const showInboxPanel = !showVerifiedPanel && !showDeliveryFailurePanel;
  const inlineErrorTitle =
    verifyState === "error"
      ? "Verification failed"
      : "Could not send verification email";

  return (
    <AuthShell
      title="Verify your email"
      footer={
        <>
          Need to sign in?{" "}
          <Link
            to={`/signin?redirect=${encodeURIComponent(continuePath)}`}
            className="text-foreground hover:underline"
          >
            Sign in
          </Link>
          .
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-muted text-ui leading-relaxed">
          We use verification to keep accounts secure and deliver resets
          reliably.
        </p>

        {showVerifyInProgress ? (
          <div className="border-border bg-surface-2 rounded-lg border px-3.5 py-3">
            <div className="flex items-start gap-2.5">
              <span className="border-border bg-raise mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border">
                <Spinner />
              </span>
              <div className="min-w-0">
                <p className="text-foreground text-ui font-semibold">
                  Verifying…
                </p>
                <p className="text-muted mt-1 text-ui leading-snug">
                  Applying your confirmation code. This should take a moment.
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {showVerifiedPanel ? (
          <div className="rounded-lg border border-[color:var(--badge-success-border)] bg-[color:var(--badge-success-bg)] px-3.5 py-2.5">
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[color:var(--badge-success-border)] bg-[color:var(--badge-success-bg)]">
                <CheckCircle2
                  className="animate-scale-in h-4 w-4 text-[color:var(--badge-success-text)]"
                  aria-hidden="true"
                />
              </span>
              <div className="min-w-0">
                <p className="text-ui font-semibold text-[color:var(--badge-success-text)]">
                  Email verified
                </p>
                <p className="mt-0.5 text-ui leading-snug text-[color:var(--badge-success-text)] opacity-70">
                  You're confirmed. Jump back into the app.
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {showInlineError ? (
          <div
            role="alert"
            className="rounded-lg border border-[color:var(--badge-danger-border)] bg-[color:var(--badge-danger-bg)] px-3.5 py-2.5"
          >
            <div className="flex items-start gap-2.5">
              <ShieldAlert
                className="text-danger mt-0.5 h-4 w-4 shrink-0"
                aria-hidden="true"
              />
              <div className="min-w-0">
                <p className="text-danger text-ui font-semibold">
                  {inlineErrorTitle}
                </p>
                <p className="text-danger mt-0.5 text-ui leading-snug opacity-80">
                  {error}
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {showDeliveryFailurePanel ? (
          <div className="border-border bg-surface-2 rounded-lg border px-3.5 py-3">
            <div className="flex items-start gap-2.5">
              <span className="border-border bg-raise mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border">
                <ShieldAlert
                  className="text-danger h-4 w-4"
                  aria-hidden="true"
                />
              </span>
              <div className="min-w-0">
                <p className="text-foreground text-ui font-semibold">
                  Verification email not sent
                </p>
                <p className="text-muted mt-1 text-ui leading-snug">
                  {displayEmail ? (
                    <>
                      Your account was created for{" "}
                      <span className="text-foreground font-medium">
                        {displayEmail}
                      </span>
                      , but we couldn&apos;t send the verification email yet.
                      Try resending it from this page.
                    </>
                  ) : (
                    <>
                      Your account was created, but we couldn&apos;t send the
                      verification email yet. Try resending it from this page.
                    </>
                  )}
                </p>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Button
                    type="button"
                    onClick={handleResend}
                    disabled={!user || isResending || resendCooldown > 0}
                    variant="secondary"
                    className="w-full"
                  >
                    {isResending ? (
                      <Spinner />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    {resendCooldown > 0
                      ? `Resend in ${resendCooldown}s`
                      : "Resend email"}
                  </Button>

                  <Button asChild variant="outline" className="w-full">
                    <Link
                      to={`/forgot-password${redirect ? `?redirect=${encodeURIComponent(redirect)}` : ""}`}
                    >
                      Password help
                    </Link>
                  </Button>
                </div>

                {!user ? (
                  <p className="text-faint mt-3 text-meta leading-relaxed">
                    Sign in first to resend a verification email. If you&apos;re
                    on a different device, just click the link in your inbox.
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {showInboxPanel ? (
          <div className="border-border bg-surface-2 rounded-lg border px-3.5 py-3">
            <div className="flex items-start gap-2.5">
              <span className="border-border bg-raise mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border">
                <Mail className="text-faint h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-foreground text-ui font-semibold">
                  Check your inbox
                </p>
                <p className="text-muted mt-1 text-ui leading-snug">
                  {displayEmail ? (
                    <>
                      We sent a verification link to{" "}
                      <span className="text-foreground font-medium">
                        {displayEmail}
                      </span>
                      . Click it to confirm.
                    </>
                  ) : (
                    <>
                      Open the verification email and click the link to confirm.
                    </>
                  )}
                </p>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Button
                    type="button"
                    onClick={handleResend}
                    disabled={!user || isResending || resendCooldown > 0}
                    variant="secondary"
                    className="w-full"
                  >
                    {isResending ? (
                      <Spinner />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    {resendCooldown > 0
                      ? `Resend in ${resendCooldown}s`
                      : "Resend email"}
                  </Button>

                  <Button asChild variant="outline" className="w-full">
                    <Link
                      to={`/forgot-password${redirect ? `?redirect=${encodeURIComponent(redirect)}` : ""}`}
                    >
                      Password help
                    </Link>
                  </Button>
                </div>

                {!user ? (
                  <p className="text-faint mt-3 text-meta leading-relaxed">
                    Sign in first to resend a verification email. If you're on a
                    different device, just click the link in your inbox.
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        <Button type="button" onClick={handleContinue} className="w-full">
          Continue
        </Button>
      </div>
    </AuthShell>
  );
}
