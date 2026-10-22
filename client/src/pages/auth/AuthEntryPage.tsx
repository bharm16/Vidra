import { useEffect, useId, useRef, useState, type ReactElement, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";
import { getAuthRepository } from "@repositories/index";
import { useAuthUser } from "@hooks/useAuthUser";
import { useToast } from "@components/Toast";
import { FreshButton } from "@/components/fresh/FreshButton";
import { AuthModalCard } from "./AuthModalCard";
import { AuthEmailAlternative, AuthFieldError, AuthNotice, AuthPasswordField } from "./AuthFormControls";
import { GoogleGlyph } from "./GoogleGlyph";
import { Spinner } from "./Spinner";
import { safeRedirect } from "./authParams";
import { authErrorCopy } from "./authErrorCopy";
import { useTransitionLink } from "@/components/motion/viewTransition";

/** The switch pill stretches to the other half and contracts behind it (frame 2715), so it needs this switch's geometry. */
function pillGeometry(nav: HTMLElement | null): Record<string, string> {
  const [first, second] = Array.from(nav?.querySelectorAll("a") ?? []).map(link => link.getBoundingClientRect());
  return first && second ? { "--vf-auth-pill-width": `${first.width}px`, "--vf-auth-pill-shift": `${second.left - first.left}px`, "--vf-auth-pill-span": `${second.right - first.left}px` } : {};
}

export function AuthEntryPage({ mode }: { mode: "signin" | "signup" }): ReactElement {
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const user = useAuthUser();
  const redirect = safeRedirect(location.search) ?? "/app";
  const isSignUp = mode === "signup";
  const operation = useRef(0);
  const suppressAutoRedirect = useRef(false);
  const [email, setEmail] = useState(() => z.object({ email: z.string() }).safeParse(location.state).data?.email ?? "");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState<"email" | "google">();
  const [error, setError] = useState<string>();
  const [emailError, setEmailError] = useState<string>();
  const [passwordError, setPasswordError] = useState<string>();
  const emailId = useId();
  const passwordId = useId();
  const switcher = useRef<HTMLElement>(null);
  const query = `?redirect=${encodeURIComponent(redirect)}`;
  const modeLink = (path: string): string => location.search ? `${path}${location.search}` : path;
  const transitionLink = useTransitionLink();
  const switchTo = (direction: "switch-right" | "switch-left", path: string) => transitionLink(direction, modeLink(path), { state: { email } }, () => pillGeometry(switcher.current));
  const forgotLink = `/forgot-password${query}${email.trim() ? `&email=${encodeURIComponent(email.trim())}` : ""}`;

  useEffect(() => () => { operation.current += 1; }, []);
  useEffect(() => { if (user && !suppressAutoRedirect.current) navigate(redirect, { replace: true }); }, [user, navigate, redirect]);

  const submit = async (provider: "email" | "google"): Promise<void> => {
    if (busy) return;
    setError(undefined); setEmailError(undefined); setPasswordError(undefined);
    const normalizedEmail = email.trim();
    if (provider === "email") {
      const validEmail = z.string().email().safeParse(normalizedEmail).success;
      const validPassword = isSignUp ? password.length >= 6 : password.length > 0;
      if (!validEmail) setEmailError("Enter a valid email address.");
      if (!validPassword) setPasswordError(isSignUp ? "Use at least 6 characters." : "Enter your password.");
      if (!validEmail || !validPassword) return;
    }
    suppressAutoRedirect.current = true;
    const attempt = ++operation.current;
    setBusy(provider);
    try {
      const repo = getAuthRepository();
      const signedIn = provider === "google" ? await repo.signInWithGoogle() : isSignUp ? await repo.signUpWithEmail(normalizedEmail, password) : await repo.signInWithEmail(normalizedEmail, password);
      if (attempt !== operation.current) return;
      if (isSignUp && provider === "email") {
        let delivery: "sent" | "failed" = "sent";
        try { await repo.sendVerificationEmail(redirect, signedIn.uid); } catch { delivery = "failed"; }
        if (attempt !== operation.current) return;
        const params = new URLSearchParams();
        if (location.search) params.set("redirect", redirect);
        params.set("email", normalizedEmail);
        const name = typeof signedIn?.displayName === "string" ? signedIn.displayName : "there";
        toast.success(`Account created. Welcome, ${name}!`);
        navigate(`/email-verification?${params.toString()}`, { replace: true, state: { delivery } });
      } else navigate(redirect, { replace: true });
    } catch (err) {
      if (attempt !== operation.current) return;
      const message = authErrorCopy(err, isSignUp ? "signUp" : "signIn", provider);
      setError(message === "Incorrect email or password." ? message + " Try again or reset your password." : message);
      suppressAutoRedirect.current = false;
    } finally { if (attempt === operation.current) setBusy(undefined); }
  };
  const handleSubmit = (event: FormEvent): void => { event.preventDefault(); void submit("email"); };

  return <AuthModalCard footer>
    <nav ref={switcher} className="vf-auth-switch" aria-label="Sign in or create account"><Link to={modeLink("/signin")} state={{ email }} onClick={isSignUp ? switchTo("switch-left", "/signin") : undefined} aria-current={!isSignUp ? "page" : undefined}>{!isSignUp ? <span className="vf-auth-pill" aria-hidden="true" /> : null}Sign in</Link><Link to={modeLink("/signup")} state={{ email }} onClick={isSignUp ? undefined : switchTo("switch-right", "/signup")} aria-current={isSignUp ? "page" : undefined}>{isSignUp ? <span className="vf-auth-pill" aria-hidden="true" /> : null}Create account</Link></nav>
    {error ? <AuthNotice>{error}</AuthNotice> : null}
    <div className="vf-auth-fields"><FreshButton className="vf-auth-provider" large disabled={Boolean(busy)} onClick={() => { void submit("google"); }}>{busy === "google" ? <Spinner /> : <GoogleGlyph />}Continue with Google</FreshButton><AuthEmailAlternative /></div>
    <form className="vf-auth-form" noValidate onSubmit={handleSubmit} aria-label={isSignUp ? "Create account" : "Sign in"}>
      <div className="vf-auth-fields"><div className="vf-auth-field vf-auth-email"><label className="vf-auth-label" htmlFor={emailId}>Email</label><input id={emailId} className="vf-field" type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={event => setEmail(event.target.value)} disabled={Boolean(busy)} aria-invalid={Boolean(emailError)} aria-describedby={emailError ? `${emailId}-error` : undefined} />{emailError ? <AuthFieldError id={`${emailId}-error`}>{emailError}</AuthFieldError> : null}</div>
      <AuthPasswordField id={passwordId} label="Password" value={password} onChange={setPassword} visible={visible} onToggle={() => setVisible(value => !value)} autoComplete={isSignUp ? "new-password" : "current-password"} placeholder="" disabled={Boolean(busy)} error={passwordError} labelAside={isSignUp ? <small>At least 6 characters</small> : <Link to={forgotLink} onClick={transitionLink("reshape", forgotLink)}>Forgot password?</Link>} /></div>
      <FreshButton type="submit" tone="primary" large disabled={Boolean(busy)} data-loading={busy === "email" || undefined}>{busy === "email" ? <Spinner /> : null}{busy === "email" ? isSignUp ? "Creating account…" : "Signing in…" : isSignUp ? "Create account" : "Sign in"}</FreshButton>
    </form>
  </AuthModalCard>;
}
