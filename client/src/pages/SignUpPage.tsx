import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Eye,
  EyeOff,
  Lock,
  Mail,
  User as UserIcon,
} from "@promptstudio/system/components/ui";
import { getAuthRepository } from "@repositories/index";
import { useToast } from "@components/Toast";
import { Button } from "@promptstudio/system/components/ui/button";
import { Input } from "@promptstudio/system/components/ui/input";
import { useAuthUser } from "@hooks/useAuthUser";
import { AuthModalCard } from "./auth/AuthModalCard";

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

/* The four-color Google mark from the handoff — rendered directly on the white
   provider button. */
function GoogleGlyph(): React.ReactElement {
  return (
    <svg viewBox="0 0 48 48" className="h-[18px] w-[18px]" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
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
    <AuthModalCard
      heading="Create your account"
      subhead={
        <>
          Already have one?{" "}
          <Link to={signInLink} className="ps-auth-accent-link">
            Sign in
          </Link>
        </>
      }
    >
      <div className="flex flex-col">
        {error ? (
          <div
            role="alert"
            className="text-danger mb-4 rounded-[10px] border border-[color:var(--ps-badge-danger-border)] bg-[color:var(--ps-badge-danger-bg)] px-3.5 py-2.5 text-[13px]"
          >
            {error}
          </div>
        ) : null}

        <Button
          type="button"
          onClick={handleGoogleSignUp}
          disabled={isBusy}
          variant="ghost"
          className="relative !h-auto w-full gap-[11px] rounded-[12px] bg-white py-[13px] text-[14px] font-semibold text-[color:var(--ps-bg)] shadow-sm hover:bg-white/90 hover:text-[color:var(--ps-bg)]"
        >
          {isBusy ? <Spinner /> : <GoogleGlyph />}
          Sign up with Google
        </Button>

        <div className="text-tool-text-muted my-[26px] flex items-center gap-3 font-mono text-[11px]">
          <span className="h-px flex-1 bg-white/[0.09]" />
          OR
          <span className="h-px flex-1 bg-white/[0.09]" />
        </div>

        <form onSubmit={handleEmailSignUp} className="flex flex-col gap-[11px]">
          <div className="relative">
            <UserIcon
              className="text-tool-text-muted pointer-events-none absolute left-4 top-1/2 z-10 h-[17px] w-[17px] -translate-y-1/2"
              aria-hidden="true"
            />
            <Input
              id={nameId}
              className="h-[46px] rounded-[12px] border-white/[0.10] bg-white/[0.03] pl-11 text-[14px] shadow-none focus-visible:border-[color:var(--accent)]"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              autoComplete="name"
              aria-label="Full name"
              placeholder="Your name (optional)"
            />
          </div>

          <div className="relative">
            <Mail
              className="text-tool-text-muted pointer-events-none absolute left-4 top-1/2 z-10 h-[17px] w-[17px] -translate-y-1/2"
              aria-hidden="true"
            />
            <Input
              id={emailId}
              className="h-[46px] rounded-[12px] border-white/[0.10] bg-white/[0.03] pl-11 text-[14px] shadow-none focus-visible:border-[color:var(--accent)]"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              inputMode="email"
              aria-label="Email"
              placeholder="Enter your email"
            />
          </div>

          <div className="relative">
            <Lock
              className="text-tool-text-muted pointer-events-none absolute left-4 top-1/2 z-10 h-[17px] w-[17px] -translate-y-1/2"
              aria-hidden="true"
            />
            <Input
              id={passwordId}
              className="h-[46px] rounded-[12px] border-white/[0.10] bg-white/[0.03] pl-11 pr-11 text-[14px] shadow-none focus-visible:border-[color:var(--accent)]"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              aria-label="Password"
              placeholder="Password (at least 6 characters)"
            />
            <Button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              variant="ghost"
              size="icon"
              className="absolute right-2 top-1/2 h-8 w-8 -translate-y-1/2 rounded-md p-0"
              disabled={isBusy}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Eye className="h-4 w-4" aria-hidden="true" />
              )}
            </Button>
          </div>

          <div className="relative">
            <Lock
              className="text-tool-text-muted pointer-events-none absolute left-4 top-1/2 z-10 h-[17px] w-[17px] -translate-y-1/2"
              aria-hidden="true"
            />
            <Input
              id={confirmId}
              className="h-[46px] rounded-[12px] border-white/[0.10] bg-white/[0.03] pl-11 text-[14px] shadow-none focus-visible:border-[color:var(--accent)]"
              type={showPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              aria-label="Confirm password"
              placeholder="Confirm password"
            />
          </div>

          <Button
            type="submit"
            disabled={isBusy}
            variant="ghost"
            className="ps-auth-primary mt-[3px] !h-auto w-full gap-2 rounded-[12px] py-[13px] text-[14px] font-semibold"
          >
            {isBusy ? <Spinner /> : null}
            Create account &amp; continue
          </Button>
        </form>

        <p className="text-tool-text-muted mt-[18px] text-center text-[11px] leading-[1.5]">
          By continuing you agree to our{" "}
          <Link
            to="/terms-of-service"
            className="text-tool-text-dim hover:text-foreground underline underline-offset-2"
          >
            Terms
          </Link>{" "}
          &amp;{" "}
          <Link
            to="/privacy-policy"
            className="text-tool-text-dim hover:text-foreground underline underline-offset-2"
          >
            Privacy Policy
          </Link>
        </p>
      </div>
    </AuthModalCard>
  );
}
