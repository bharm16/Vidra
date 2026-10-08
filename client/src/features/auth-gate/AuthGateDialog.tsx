import React from "react";
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
import { GoogleGlyph } from "@/pages/auth/GoogleGlyph";
import { AuthBrand } from "@/pages/auth/AuthModalCard";
import {
  AUTH_INPUT_CLASS,
  AuthPasswordField,
  AuthEmailAlternative,
} from "@/pages/auth/AuthFormControls";
import authClose from "@/assets/design-system/auth-close.svg";
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
    title: "Sign in to\ncontinue",
    body: "Your session expired. Sign in to continue;\nyour work is saved.",
  },
  "pre-go": {
    title: "Sign in to make it",
    body: "Sign in to generate. Your prompt stays\nexactly as you left it.",
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
        if (!open) authGateController.cancelPending();
      }}
    >
      <DialogContent
        hideClose
        className="inset-0 flex h-dvh w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-y-auto rounded-none border-0 bg-canvas p-0 text-foreground shadow-none"
      >
        <div className="absolute left-8 top-7">
          <AuthBrand />
        </div>
        <div className="flex min-h-full flex-col px-4 pb-10 pt-[88px]">
          <div className="flex flex-1 items-center justify-center">
            <div className="flex w-full max-w-[440px] flex-col gap-6">
              <div className="flex flex-col gap-3">
                <DialogTitle className="whitespace-pre-line text-display-lg font-medium leading-none">
                  {copy.title}
                </DialogTitle>
                <DialogDescription className="whitespace-pre-line text-body text-foreground">
                  {copy.body}
                </DialogDescription>
              </div>
              {error ? (
                <div
                  role="alert"
                  className="rounded-md border border-[color:var(--badge-danger-border)] bg-[color:var(--badge-danger-bg)] px-3.5 py-2.5 text-ui text-danger"
                >
                  {error}
                </div>
              ) : null}
              <Button
                type="button"
                onClick={() => void handleGoogleSignIn()}
                disabled={isBusy}
                variant="secondary"
                size="lg"
                className="relative w-full font-normal"
              >
                <span className="absolute left-4 top-3">
                  {isBusy ? <Spinner /> : <GoogleGlyph />}
                </span>
                Continue with Google
              </Button>
              <AuthEmailAlternative />
              <form
                onSubmit={handleEmailSignIn}
                className="flex flex-col gap-6"
              >
                <div className="flex flex-col gap-5">
                  <div>
                    <label
                      htmlFor={emailId}
                      className="mb-2 block text-ui font-normal"
                    >
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
                  <AuthPasswordField
                    id={passwordId}
                    label="Password"
                    value={password}
                    onChange={setPassword}
                    visible={showPassword}
                    onToggle={() => setShowPassword((value) => !value)}
                    disabled={isBusy}
                    autoComplete="current-password"
                    placeholder="Password"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={isBusy}
                  size="lg"
                  className="ps-auth-primary-action w-full font-normal"
                >
                  {isBusy ? <Spinner /> : null}Sign in
                </Button>
              </form>
            </div>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          className="absolute right-6 top-5 rounded-md"
          aria-label="Close sign-in"
          onClick={() => authGateController.cancelPending()}
        >
          <img src={authClose} alt="" />
        </Button>
      </DialogContent>
    </Dialog>
  );
}
