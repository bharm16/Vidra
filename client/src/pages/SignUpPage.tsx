import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Chrome,
  Eye,
  EyeOff,
  Mail,
  User as UserIcon,
} from "@promptstudio/system/components/ui";
import { getAuthRepository } from "@repositories/index";
import { useToast } from "@components/Toast";
import { Button } from "@promptstudio/system/components/ui/button";
import { Input } from "@promptstudio/system/components/ui/input";
import { useAuthUser } from "@hooks/useAuthUser";
import { AuthShell } from "./auth/AuthShell";

function getSafeRedirect(search: string): string | null {
  const params = new URLSearchParams(search);
  const raw = params.get("redirect");
  if (!raw) return null;
  if (!raw.startsWith("/")) return null;
  if (raw.startsWith("//")) return null;
  return raw;
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

type AuthFlow = "google" | "email";

function mapAuthError(error: unknown, flow: AuthFlow): string {
  if (!error || typeof error !== "object")
    return "Something went wrong. Please try again.";
  const code =
    "code" in error && typeof error.code === "string" ? error.code : null;

  switch (code) {
    case "auth/email-already-in-use":
      return "That email is already in use. Try signing in instead.";
    case "auth/invalid-email":
      return "Enter a valid email address.";
    case "auth/weak-password":
      return "Password is too weak. Use at least 6 characters.";
    case "auth/operation-not-allowed":
      return flow === "google"
        ? "Google sign-in is disabled in Firebase Auth. Enable the Google provider in the Firebase console."
        : "Email/password sign-up is disabled in Firebase Auth.";
    case "auth/popup-blocked":
      return "Google popup was blocked. Allow popups for this tab and try again.";
    case "auth/popup-closed-by-user":
      return "Google popup was closed before sign-up completed.";
    case "auth/cancelled-popup-request":
      return "Google sign-up popup request was cancelled. Try again.";
    case "auth/unauthorized-domain":
      return "This localhost domain is not authorized in Firebase Auth settings.";
    case "auth/operation-not-supported-in-this-environment":
    case "auth/web-storage-unsupported":
      return "Google sign-in is not supported in this embedded browser. Use email sign-up here or open the app in a regular browser.";
    default:
      return "Failed to create account. Please try again.";
  }
}

function secureEquals(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const maxLength = Math.max(leftBytes.length, rightBytes.length);
  let diff = leftBytes.length ^ rightBytes.length;

  for (let i = 0; i < maxLength; i++) {
    diff |= (leftBytes[i] ?? 0) ^ (rightBytes[i] ?? 0);
  }

  return diff === 0;
}

export function SignUpPage(): React.ReactElement {
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const redirect = getSafeRedirect(location.search);
  const signInLink = redirect
    ? `/signin?redirect=${encodeURIComponent(redirect)}`
    : "/signin";
  const suppressAutoRedirect = React.useRef(false);

  const user = useAuthUser();
  const [displayName, setDisplayName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [isBusy, setIsBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const nameId = React.useId();
  const emailId = React.useId();
  const passwordId = React.useId();
  const confirmId = React.useId();

  React.useEffect(() => {
    if (!user) return;
    if (suppressAutoRedirect.current) return;
    if (redirect) {
      navigate(redirect, { replace: true });
      return;
    }
    navigate("/", { replace: true });
  }, [navigate, redirect, user]);

  const handleGoogleSignUp = async (): Promise<void> => {
    suppressAutoRedirect.current = true;
    setError(null);
    setIsBusy(true);
    try {
      const signedInUser = await getAuthRepository().signInWithGoogle();
      const name =
        typeof signedInUser.displayName === "string"
          ? signedInUser.displayName
          : "there";
      toast.success(`Welcome, ${name}!`);
      navigate(redirect ?? "/", { replace: true });
    } catch (err) {
      setError(mapAuthError(err, "google"));
      toast.error("Failed to create account. Please try again.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleEmailSignUp = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    suppressAutoRedirect.current = true;
    setError(null);
    setIsBusy(true);
    try {
      const normalizedEmail = email.trim();
      const normalizedName = displayName.trim();

      if (!normalizedEmail || !password) {
        setError("Enter your email and password.");
        return;
      }
      if (!secureEquals(password, confirmPassword)) {
        setError("Passwords do not match.");
        return;
      }

      const newUser = await getAuthRepository().signUpWithEmail(
        normalizedEmail,
        password,
        normalizedName,
      );
      const name =
        typeof newUser.displayName === "string" ? newUser.displayName : "there";
      toast.success(`Account created. Welcome, ${name}!`);
      let delivery: "sent" | "failed" = "sent";

      try {
        await getAuthRepository().sendVerificationEmail(redirect ?? undefined);
      } catch {
        delivery = "failed";
      }

      const params = new URLSearchParams();
      if (redirect) params.set("redirect", redirect);
      if (normalizedEmail) params.set("email", normalizedEmail);
      const query = params.toString();
      navigate(query ? `/email-verification?${query}` : "/email-verification", {
        replace: true,
        state: { delivery },
      });
    } catch (err) {
      setError(mapAuthError(err, "email"));
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <AuthShell
      title="Create account"
      footer={
        <>
          Already have an account?{" "}
          <Link to={signInLink} className="text-foreground hover:underline">
            Sign in
          </Link>
          .
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-muted text-[13px] leading-relaxed">
          Create an account to sync history, save versions, and pick up where
          you left off.
        </p>

        {error ? (
          <div
            role="alert"
            className="text-danger rounded-lg border border-[color:var(--ps-badge-danger-border)] bg-[color:var(--ps-badge-danger-bg)] px-3.5 py-2.5 text-[13px]"
          >
            {error}
          </div>
        ) : null}

        <Button
          type="button"
          onClick={handleGoogleSignUp}
          disabled={isBusy}
          variant="secondary"
          className="w-full"
        >
          {isBusy ? (
            <Spinner />
          ) : (
            <Chrome className="h-4 w-4" aria-hidden="true" />
          )}
          Continue with Google
        </Button>

        <div className="flex items-center gap-3">
          <div className="bg-border h-px flex-1" />
          <span className="text-faint text-[11px] font-medium">or</span>
          <div className="bg-border h-px flex-1" />
        </div>

        <form onSubmit={handleEmailSignUp} className="flex flex-col gap-3.5">
          <div>
            <label htmlFor={nameId} className="text-overline text-faint">
              Name <span className="text-ghost">(optional)</span>
            </label>
            <div className="relative mt-1">
              <UserIcon
                className="text-faint pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2"
                aria-hidden="true"
              />
              <Input
                id={nameId}
                className="pl-10"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                autoComplete="name"
                placeholder="Your name"
              />
            </div>
          </div>

          <div>
            <label htmlFor={emailId} className="text-overline text-faint">
              Email
            </label>
            <div className="relative mt-1">
              <Mail
                className="text-faint pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2"
                aria-hidden="true"
              />
              <Input
                id={emailId}
                className="pl-10"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                inputMode="email"
                placeholder="you@company.com"
              />
            </div>
          </div>

          <div>
            <label htmlFor={passwordId} className="text-overline text-faint">
              Password
            </label>
            <div className="relative mt-1">
              <Input
                id={passwordId}
                className="pr-10"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="At least 6 characters"
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
            <label htmlFor={confirmId} className="text-overline text-faint">
              Confirm password
            </label>
            <div className="mt-1">
              <Input
                id={confirmId}
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="Repeat your password"
              />
            </div>
          </div>

          <p className="text-ghost text-[12px] leading-relaxed">
            By creating an account, you agree to our{" "}
            <Link
              to="/terms-of-service"
              className="text-faint hover:text-foreground hover:underline"
            >
              terms
            </Link>{" "}
            and{" "}
            <Link
              to="/privacy-policy"
              className="text-faint hover:text-foreground hover:underline"
            >
              privacy policy
            </Link>
            .
          </p>

          <Button type="submit" disabled={isBusy} className="w-full">
            {isBusy ? <Spinner /> : null}
            Create account
          </Button>
        </form>
      </div>
    </AuthShell>
  );
}
