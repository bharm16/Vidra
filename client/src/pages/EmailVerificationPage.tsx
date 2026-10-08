import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { getAuthRepository } from "@repositories/index";
import { useToast } from "@components/Toast";
import { Button } from "@promptstudio/system/components/ui/button";
import { useAuthUser } from "@hooks/useAuthUser";
import { AuthModalCard } from "./auth/AuthModalCard";
import authMail from "@/assets/design-system/auth-mail.svg";
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
  const inlineErrorTitle =
    verifyState === "error"
      ? "Verification failed"
      : "Could not send verification email";

  const heading = showVerifiedPanel ? "Email verified" : "Verify your email";
  const subhead = showVerifiedPanel
    ? "You’re confirmed. Jump back into the app."
    : showVerifyInProgress
      ? "Applying your confirmation code. This should take a moment."
      : showDeliveryFailurePanel
        ? `Your account${displayEmail ? ` for ${displayEmail}` : ""} was created, but we couldn’t send the verification email yet. Try resending it from this page.`
        : displayEmail
          ? `We sent a verification link to ${displayEmail}. Click it to confirm.`
          : "Open the verification email and click\nthe link to confirm.";

  return (
    <AuthModalCard
      heading={heading}
      headingIcon={<img src={authMail} alt="" />}
      subhead={<span className="text-muted">{subhead}</span>}
    >
      <div className="flex flex-col gap-6">
        {showInlineError ? (
          <div
            role="alert"
            className="rounded-md border border-[color:var(--badge-danger-border)] bg-[color:var(--badge-danger-bg)] px-3.5 py-2.5 text-ui text-danger"
          >
            <p>{inlineErrorTitle}</p>
            <p className="mt-1">{error}</p>
          </div>
        ) : null}
        {showVerifyInProgress ? (
          <div role="status" className="flex items-center gap-3 text-body">
            <Spinner />
            Verifying…
          </div>
        ) : null}
        <Button
          type="button"
          onClick={handleContinue}
          size="lg"
          className="ps-auth-primary-action w-full font-normal"
        >
          {user ? "Continue" : "Sign in to continue"}
        </Button>
        {!showVerifiedPanel ? (
          <div className="flex items-center gap-4">
            <Button
              type="button"
              onClick={handleResend}
              disabled={!user || isResending || resendCooldown > 0}
              variant="secondary"
              size="lg"
              className="w-[176px] shrink-0 font-normal"
            >
              {isResending ? <Spinner /> : null}
              {resendCooldown > 0
                ? `Resend in ${resendCooldown}s`
                : "Resend email"}
            </Button>
            {!user ? (
              <p className="text-ui text-muted">
                Sign in to resend
                <br />a verification email.
              </p>
            ) : null}
          </div>
        ) : null}
        <Link
          to={`/forgot-password${redirect ? `?redirect=${encodeURIComponent(redirect)}` : ""}`}
          className="w-28 text-body hover:underline"
        >
          Password help
        </Link>
      </div>
    </AuthModalCard>
  );
}
