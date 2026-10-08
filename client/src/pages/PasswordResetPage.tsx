import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { getAuthRepository } from "@repositories/index";
import { useToast } from "@components/Toast";
import { Button } from "@promptstudio/system/components/ui/button";
import { Input } from "@promptstudio/system/components/ui/input";
import { AuthModalCard } from "./auth/AuthModalCard";
import { AUTH_INPUT_CLASS, AuthPasswordField } from "./auth/AuthFormControls";
import authKey from "@/assets/design-system/auth-key.svg";
import { Spinner } from "./auth/Spinner";
import { readActionMode, readOobCode, safeRedirect } from "./auth/authParams";
import { authErrorCopy } from "./auth/authErrorCopy";

type ResetState = "idle" | "checking" | "ready" | "success" | "error";

export function PasswordResetPage(): React.ReactElement {
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const redirect = safeRedirect(location.search);
  const oobCode = readOobCode(location.search);
  const mode = readActionMode(location.search);

  const passwordId = React.useId();
  const confirmId = React.useId();
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
        setError(authErrorCopy(err, "passwordReset"));
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
      setError(authErrorCopy(err, "passwordReset"));
      toast.error("Password reset failed.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleContinue = (): void => {
    navigate(signInLink, { replace: true });
  };

  const heading =
    resetState === "idle"
      ? "Open your reset\nlink"
      : resetState === "success"
        ? "Password updated"
        : "Set a new\npassword";
  const subhead =
    resetState === "idle"
      ? "Use the secure link in your email to set\na new password."
      : resetState === "ready"
        ? `For ${email ?? "your account"}`
        : resetState === "checking"
          ? "Checking that your reset link is still active."
          : resetState === "success"
            ? "Sign in with your new password."
            : "If this link expired or was already used, request a new reset email.";

  return (
    <AuthModalCard
      heading={heading}
      headingIcon={
        resetState === "idle" ? <img src={authKey} alt="" /> : undefined
      }
      subhead={<span className="text-muted">{subhead}</span>}
    >
      <div className="flex flex-col gap-6">
        {error ? (
          <div
            role="alert"
            className="rounded-md border border-[color:var(--badge-danger-border)] bg-[color:var(--badge-danger-bg)] px-3.5 py-2.5 text-ui text-danger"
          >
            {error}
          </div>
        ) : null}
        {resetState === "checking" ? (
          <div role="status" className="flex items-center gap-3 text-body">
            <Spinner />
            Validating link…
          </div>
        ) : null}
        {resetState === "idle" || resetState === "error" ? (
          <>
            <Button
              asChild
              size="lg"
              className="ps-auth-primary-action w-full font-normal"
            >
              <Link to={forgotPasswordLink}>
                {resetState === "idle"
                  ? "Request a new reset email"
                  : "Request new email"}
              </Link>
            </Button>
            <Link
              to={signInLink}
              className="w-32 shrink-0 text-body hover:underline"
            >
              Back to sign in
            </Link>
          </>
        ) : null}
        {resetState === "ready" ? (
          <>
            <form onSubmit={handleSubmit} className="flex flex-col gap-6">
              <div className="flex flex-col gap-5">
                <AuthPasswordField
                  id={passwordId}
                  label="New password"
                  value={password}
                  onChange={setPassword}
                  visible={showPassword}
                  onToggle={() => setShowPassword((value) => !value)}
                  disabled={isBusy}
                  autoComplete="new-password"
                  placeholder="At least 6 characters"
                />
                <div>
                  <label
                    htmlFor={confirmId}
                    className="mb-2 block text-ui font-normal"
                  >
                    Confirm password
                  </label>
                  <Input
                    id={confirmId}
                    className={AUTH_INPUT_CLASS}
                    type={showPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    autoComplete="new-password"
                    placeholder="Repeat your password"
                    disabled={isBusy}
                  />
                </div>
              </div>
              <Button
                type="submit"
                disabled={isBusy}
                size="lg"
                className="ps-auth-primary-action w-full font-normal"
              >
                {isBusy ? <Spinner /> : null}Update password
              </Button>
            </form>
            <div className="flex items-center gap-6 text-body">
              <Link to={signInLink} className="w-32 shrink-0 hover:underline">
                Back to sign in
              </Link>
              <Link
                to={forgotPasswordLink}
                className="w-[72px] shrink-0 hover:underline"
              >
                New link
              </Link>
            </div>
          </>
        ) : null}
        {resetState === "success" ? (
          <Button
            type="button"
            onClick={handleContinue}
            size="lg"
            className="ps-auth-primary-action w-full font-normal"
          >
            Continue to sign in
          </Button>
        ) : null}
      </div>
    </AuthModalCard>
  );
}
