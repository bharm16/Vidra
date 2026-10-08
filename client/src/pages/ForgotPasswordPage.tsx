import React from "react";
import { Link, useLocation } from "react-router-dom";
import { getAuthRepository } from "@repositories/index";
import { useToast } from "@components/Toast";
import { Button } from "@promptstudio/system/components/ui/button";
import { Input } from "@promptstudio/system/components/ui/input";
import { AuthModalCard } from "./auth/AuthModalCard";
import { AUTH_INPUT_CLASS } from "./auth/AuthFormControls";
import { Spinner } from "./auth/Spinner";
import { safeRedirect } from "./auth/authParams";
import { authErrorCopy } from "./auth/authErrorCopy";

function getInitialEmail(search: string): string {
  const params = new URLSearchParams(search);
  const raw = params.get("email");
  if (!raw) return "";
  return raw.trim();
}

export function ForgotPasswordPage(): React.ReactElement {
  const toast = useToast();
  const location = useLocation();
  const redirect = safeRedirect(location.search);

  const emailId = React.useId();
  const [email, setEmail] = React.useState(() =>
    getInitialEmail(location.search),
  );
  const [isBusy, setIsBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [sentTo, setSentTo] = React.useState<string | null>(null);

  React.useEffect(() => {
    setEmail(getInitialEmail(location.search));
    setSentTo(null);
    setError(null);
  }, [location.search]);

  const handleSend = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    const normalizedEmail = email.trim();

    setError(null);
    setSentTo(null);

    if (!normalizedEmail) {
      setError("Enter your email address.");
      return;
    }

    setIsBusy(true);
    try {
      await getAuthRepository().sendPasswordReset(
        normalizedEmail,
        redirect ?? undefined,
      );
      setSentTo(normalizedEmail);
      toast.success("Password reset email sent.");
    } catch (err) {
      setError(authErrorCopy(err, "forgotPassword"));
      toast.error("Failed to send reset email.");
    } finally {
      setIsBusy(false);
    }
  };

  const signInLink = redirect
    ? `/signin?redirect=${encodeURIComponent(redirect)}`
    : "/signin";

  return (
    <AuthModalCard
      heading="Reset your password"
      subhead={
        <span className="text-muted">
          {
            "Enter your account email. If an account exists,\nwe’ll send a reset link."
          }
        </span>
      }
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
        {sentTo ? (
          <div role="status" className="flex flex-col gap-2 text-body">
            <p>Check your inbox</p>
            <p className="text-muted">
              We sent a reset link to{" "}
              <span className="text-foreground">{sentTo}</span>. If you don’t
              see it, check spam.
            </p>
          </div>
        ) : null}
        <form onSubmit={handleSend} className="flex flex-col gap-6">
          <div>
            <label htmlFor={emailId} className="mb-2 block text-ui font-normal">
              Email
            </label>
            <Input
              id={emailId}
              className={AUTH_INPUT_CLASS}
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              inputMode="email"
              placeholder="you@company.com"
              disabled={isBusy}
            />
          </div>
          <Button
            type="submit"
            disabled={isBusy}
            size="lg"
            className="ps-auth-primary-action w-full font-normal"
          >
            {isBusy ? <Spinner /> : null}Send reset email
          </Button>
        </form>
        <div className="flex items-center gap-6 text-body">
          <Link to={signInLink} className="w-32 shrink-0 hover:underline">
            Back to sign in
          </Link>
          <Link
            to="/privacy-policy"
            className="w-[60px] shrink-0 hover:underline"
          >
            Privacy
          </Link>
        </div>
      </div>
    </AuthModalCard>
  );
}
