import React from "react";
import { Chrome, Eye, EyeOff, Mail } from "@promptstudio/system/components/ui";
import { Button } from "@promptstudio/system/components/ui/button";
import { Input } from "@promptstudio/system/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@promptstudio/system/components/ui/dialog";
import { getAuthRepository } from "@repositories/index";
import { useAuthUser } from "@hooks/useAuthUser";
import { cn } from "@/utils/cn";
import {
  authGateController,
  type AuthGateReason,
  type AuthGateRequest,
} from "./authGateController";

/**
 * AuthGateDialog — the single sign-in dialog for M4's two auth features.
 *
 * Mounted once at the app root. It listens to {@link authGateController}; when
 * either the global 401 handler or the pre-Go gate opens a request, this
 * renders a modal over the current page (the typed draft stays mounted
 * behind it) offering Google + email sign-in via the existing Firebase flows.
 *
 * On a successful auth-state change it tells the controller, which resolves
 * the pending `resume` so the original action continues. Dismissing the dialog
 * cancels the pending request.
 */

type AuthFlow = "google" | "email";

function mapAuthError(error: unknown, flow: AuthFlow): string {
  if (!error || typeof error !== "object")
    return "Something went wrong. Please try again.";
  const code =
    "code" in error && typeof error.code === "string" ? error.code : null;

  switch (code) {
    case "auth/invalid-email":
      return "Enter a valid email address.";
    case "auth/user-disabled":
      return "This account is disabled.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
    case "auth/invalid-login-credentials":
      return "Incorrect email or password.";
    case "auth/too-many-requests":
      return "Too many attempts. Try again in a bit.";
    case "auth/operation-not-allowed":
      return flow === "google"
        ? "Google sign-in is disabled in Firebase Auth."
        : "Email/password sign-in is disabled in Firebase Auth.";
    case "auth/popup-blocked":
      return "Google popup was blocked. Allow popups for this tab and try again.";
    case "auth/popup-closed-by-user":
      return "Google popup was closed before sign-in completed.";
    case "auth/cancelled-popup-request":
      return "Google sign-in popup request was cancelled. Try again.";
    case "auth/unauthorized-domain":
      return "This domain is not authorized in Firebase Auth settings.";
    default:
      return "Failed to sign in. Please try again.";
  }
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

const REASON_COPY: Record<AuthGateReason, { title: string; body: string }> = {
  "http-401": {
    title: "Sign in to continue",
    body: "Your session expired. Sign in to pick up right where you left off — your work is saved.",
  },
  "pre-go": {
    title: "Sign in to make it",
    body: "Sign in to generate. Your prompt stays exactly as you left it.",
  },
};

export function AuthGateDialog(): React.ReactElement {
  const [request, setRequest] = React.useState<AuthGateRequest | null>(null);
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [isBusy, setIsBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const emailId = React.useId();
  const passwordId = React.useId();

  // Track auth state so an out-of-band sign-in (e.g. the Google popup) also
  // resolves the pending request. We only care about the transition into a
  // signed-in state while a request is open.
  const requestOpen = request !== null;
  useAuthUser({
    onChange: (user) => {
      if (user && authGateController.isPending()) {
        authGateController.resolveAuthenticated();
      }
    },
  });

  React.useEffect(() => {
    return authGateController.subscribe((next) => {
      setRequest(next);
      if (next) {
        setError(null);
        setIsBusy(false);
      }
    });
  }, []);

  // Reset the form whenever the dialog closes so a later open starts clean.
  React.useEffect(() => {
    if (!requestOpen) {
      setEmail("");
      setPassword("");
      setShowPassword(false);
    }
  }, [requestOpen]);

  const handleGoogleSignIn = async (): Promise<void> => {
    setError(null);
    setIsBusy(true);
    try {
      await getAuthRepository().signInWithGoogle();
      // The useAuthUser onChange handler resolves the pending request.
    } catch (err) {
      setError(mapAuthError(err, "google"));
      setIsBusy(false);
    }
  };

  const handleEmailSignIn = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setError(null);
    const normalizedEmail = email.trim();
    if (!normalizedEmail || !password) {
      setError("Enter your email and password.");
      return;
    }
    setIsBusy(true);
    try {
      await getAuthRepository().signInWithEmail(normalizedEmail, password);
      // The useAuthUser onChange handler resolves the pending request.
    } catch (err) {
      setError(mapAuthError(err, "email"));
      setIsBusy(false);
    }
  };

  const copy = request ? REASON_COPY[request.reason] : REASON_COPY["pre-go"];

  return (
    <Dialog
      open={requestOpen}
      onOpenChange={(open) => {
        if (!open) {
          authGateController.cancelPending();
        }
      }}
    >
      <DialogContent
        className={cn(
          "border-tool-rail-border bg-tool-panel-inner w-full max-w-md border p-0 text-white",
        )}
      >
        <div className="border-tool-rail-border border-b px-5 py-4">
          <DialogTitle className="text-[15px] font-semibold text-white">
            {copy.title}
          </DialogTitle>
          <DialogDescription className="text-body-sm text-ghost mt-1">
            {copy.body}
          </DialogDescription>
        </div>

        <div className="flex flex-col gap-4 px-5 py-4">
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
            onClick={() => void handleGoogleSignIn()}
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

          <form onSubmit={handleEmailSignIn} className="flex flex-col gap-3.5">
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
                  autoComplete="current-password"
                  placeholder="••••••••"
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

            <Button type="submit" disabled={isBusy} className="w-full">
              {isBusy ? <Spinner /> : null}
              Sign in
            </Button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
