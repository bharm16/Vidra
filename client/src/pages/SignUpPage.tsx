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
  const redirect = safeRedirect(location.search);
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
      setError(authErrorCopy(err, "signUp", "google"));
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
      setError(authErrorCopy(err, "signUp", "email"));
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <AuthModalCard
      heading={"Create your\naccount"}
      subhead={
        <Link to={signInLink} className="ps-auth-accent-link">
          Sign in
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
          onClick={handleGoogleSignUp}
          disabled={isBusy}
          variant="secondary"
          size="lg"
          className="relative w-full font-normal"
        >
          <span className="absolute left-4 top-3">
            {isBusy ? <Spinner /> : <GoogleGlyph />}
          </span>
          Sign up with Google
        </Button>
        <AuthEmailAlternative />
        <form onSubmit={handleEmailSignUp} className="flex flex-col gap-6">
          <div className="flex flex-col gap-4">
            <div>
              <label
                htmlFor={nameId}
                className="mb-2 block text-ui font-normal"
              >
                Full name (optional)
              </label>
              <Input
                id={nameId}
                className={AUTH_INPUT_CLASS}
                type="text"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                autoComplete="name"
                placeholder="Your name"
                disabled={isBusy}
              />
            </div>
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
              autoComplete="new-password"
              placeholder="Password"
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
                placeholder="Confirm password"
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
            {isBusy ? <Spinner /> : null}
            Create account &amp; continue
          </Button>
        </form>
        <AuthLegalLinks />
      </div>
    </AuthModalCard>
  );
}
