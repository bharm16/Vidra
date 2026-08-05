import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Mail } from "@promptstudio/system/components/ui";
import { getAuthRepository } from "@repositories/index";
import { useToast } from "@components/Toast";
import { Button } from "@promptstudio/system/components/ui/button";
import { Input } from "@promptstudio/system/components/ui/input";
import { AuthShell } from "./auth/AuthShell";
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
    <AuthShell
      title="Reset your password"
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
        <p className="text-muted text-ui leading-relaxed">
          Enter the email for your account. If it exists, we'll send a reset
          link.
        </p>

        {error ? (
          <div
            role="alert"
            className="text-danger rounded-lg border border-[color:var(--badge-danger-border)] bg-[color:var(--badge-danger-bg)] px-3.5 py-2.5 text-ui"
          >
            {error}
          </div>
        ) : null}

        {sentTo ? (
          <div className="border-border bg-surface-2 rounded-lg border px-3.5 py-3">
            <p className="text-foreground text-ui font-semibold">
              Check your inbox
            </p>
            <p className="text-muted mt-1 text-ui leading-snug">
              We sent a reset link to{" "}
              <span className="text-foreground font-medium">{sentTo}</span>. If
              you don't see it, check spam.
            </p>
          </div>
        ) : null}

        <form onSubmit={handleSend} className="flex flex-col gap-3.5">
          <div>
            <label className="text-overline text-faint">Email</label>
            <div className="relative mt-1">
              <Mail
                className="text-faint pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2"
                aria-hidden="true"
              />
              <Input
                className="pl-10"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                inputMode="email"
                placeholder="you@company.com"
                disabled={isBusy}
              />
            </div>
          </div>

          <Button type="submit" disabled={isBusy} className="w-full">
            {isBusy ? <Spinner /> : null}
            Send reset email
          </Button>

          <div className="flex items-center justify-between gap-3">
            <Link
              to={signInLink}
              className="text-faint hover:text-foreground text-meta font-medium transition"
            >
              Back to sign in
            </Link>
            <Link
              to="/privacy-policy"
              className="text-ghost hover:text-foreground text-meta font-medium transition"
            >
              Privacy
            </Link>
          </div>
        </form>
      </div>
    </AuthShell>
  );
}
