import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { getAuthRepository } from "@repositories/index";
import { useToast } from "@components/Toast";
import { Button } from "@promptstudio/system/components/ui/button";
import { Input } from "@promptstudio/system/components/ui/input";
import { useAuthUser } from "@hooks/useAuthUser";
import { AuthModalCard } from "./auth/AuthModalCard";
import { Spinner } from "./auth/Spinner";
import { safeRedirect } from "./auth/authParams";
import { authErrorCopy } from "./auth/authErrorCopy";
import { GoogleGlyph } from "./auth/GoogleGlyph";
import {
  AUTH_INPUT_CLASS,
  AuthPasswordField,
  AuthEmailAlternative,
  AuthLegalLinks,
} from "./auth/AuthFormControls";

export function SignInPage(): React.ReactElement {
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const redirect = safeRedirect(location.search);
  const signUpLink = redirect
    ? `/signup?redirect=${encodeURIComponent(redirect)}`
    : "/signup";

  const user = useAuthUser();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [isBusy, setIsBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const emailId = React.useId();
  const passwordId = React.useId();

  React.useEffect(() => {
    if (!user) return;
    if (redirect) {
      navigate(redirect, { replace: true });
      return;
    }
    navigate("/", { replace: true });
  }, [navigate, redirect, user]);

  const handleGoogleSignIn = async (): Promise<void> => {
    setError(null);
    setIsBusy(true);
    try {
      const signedInUser = await getAuthRepository().signInWithGoogle();
      const displayName =
        typeof signedInUser.displayName === "string"
          ? signedInUser.displayName
          : "User";
      toast.success(`Welcome, ${displayName}!`);
      navigate(redirect ?? "/", { replace: true });
    } catch (err) {
      setError(authErrorCopy(err, "signIn", "google"));
      toast.error("Failed to sign in. Please try again.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleEmailSignIn = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setError(null);
    setIsBusy(true);
    try {
      const normalizedEmail = email.trim();
      if (!normalizedEmail || !password) {
        setError("Enter your email and password.");
        return;
      }

      const signedInUser = await getAuthRepository().signInWithEmail(
        normalizedEmail,
        password,
      );
      const displayName =
        typeof signedInUser.displayName === "string"
          ? signedInUser.displayName
          : "User";
      toast.success(`Welcome back, ${displayName}!`);
      navigate(redirect ?? "/", { replace: true });
    } catch (err) {
      setError(authErrorCopy(err, "signIn", "email"));
    } finally {
      setIsBusy(false);
    }
  };

  const forgotPasswordLink = React.useMemo(() => {
    const params = new URLSearchParams();
    if (redirect) params.set("redirect", redirect);
    const normalizedEmail = email.trim();
    if (normalizedEmail) params.set("email", normalizedEmail);
    const query = params.toString();
    return query ? `/forgot-password?${query}` : "/forgot-password";
  }, [email, redirect]);

  return (
    <AuthModalCard
      heading="Welcome back"
      subhead={
        <Link to={signUpLink} className="ps-auth-accent-link">
          Create an account
        </Link>
      }
    >
      <div className="flex flex-col gap-6">
        {error ? (
          <div
            role="alert"
            className="text-danger rounded-md border border-[color:var(--badge-danger-border)] bg-[color:var(--badge-danger-bg)] px-3.5 py-2.5 text-ui"
          >
            {error}
          </div>
        ) : null}
        <Button
          type="button"
          onClick={handleGoogleSignIn}
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
        <form onSubmit={handleEmailSignIn} className="flex flex-col gap-6">
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
                placeholder="Enter your email"
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
          <Link
            to={forgotPasswordLink}
            className="text-right text-body hover:underline"
          >
            Forgot password?
          </Link>
          <Button
            type="submit"
            disabled={isBusy}
            size="lg"
            className="ps-auth-primary-action w-full font-normal"
          >
            {isBusy ? <Spinner /> : null}
            Sign in &amp; continue
          </Button>
        </form>
        <AuthLegalLinks />
      </div>
    </AuthModalCard>
  );
}
