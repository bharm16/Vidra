import { useEffect, useRef, useState, type ReactElement } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";
import { getAuthRepository } from "@repositories/index";
import { useAuthUser } from "@hooks/useAuthUser";
import { FreshButton } from "@/components/fresh/FreshButton";
import { AuthModalCard } from "./auth/AuthModalCard";
import { AuthNotice } from "./auth/AuthFormControls";
import { readActionMode, readOobCode, safeRedirect } from "./auth/authParams";
import { authErrorCopy } from "./auth/authErrorCopy";

type VerifyState = "idle" | "verifying" | "verified" | "error";
export function EmailVerificationPage(): ReactElement {
  const location = useLocation();
  const navigate = useNavigate();
  const user = useAuthUser();
  const currentOwner = useRef(user?.uid);
  currentOwner.current = user?.uid;
  const redirect = safeRedirect(location.search) ?? "/app";
  const code = readOobCode(location.search);
  const mode = readActionMode(location.search);
  const [state, setState] = useState<VerifyState>("idle");
  const [error, setError] = useState<string>();
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [resent, setResent] = useState(false);
  const operation = useRef(0);
  const resendOperation = useRef(0);
  useEffect(() => () => { operation.current += 1; resendOperation.current += 1; }, []);
  useEffect(() => { resendOperation.current += 1; setResending(false); setCooldown(0); setResent(false); }, [user?.uid]);
  const failedDelivery = z.object({ delivery: z.enum(["sent", "failed"]) }).safeParse(location.state).data?.delivery === "failed";
  const email = typeof user?.email === "string" ? user.email : new URLSearchParams(location.search).get("email")?.trim() ?? "";
  useEffect(() => {
    const token = ++operation.current;
    setError(undefined);
    if (!code) { setState("idle"); return; }
    if (mode && mode !== "verifyEmail") { setState("error"); setError("This link is not an email verification link."); return; }
    setState("verifying");
    void (async (): Promise<void> => {
      try {
        await getAuthRepository().verifyEmailWithCode(code);
        try { await getAuthRepository().refreshCurrentUser(); } catch { /* Applying the code succeeded independently of the session refresh. */ }
        if (token === operation.current) setState("verified");
      } catch (err) { if (token === operation.current) { setState("error"); setError(authErrorCopy(err, "verifyEmail")); } }
    })();
    return () => { operation.current += 1; };
  }, [code, mode]);
  useEffect(() => { if (cooldown <= 0) return; const id = window.setTimeout(() => setCooldown(value => Math.max(0, value - 1)), 1000); return () => window.clearTimeout(id); }, [cooldown]);
  const resend = async (): Promise<void> => {
    if (!user || resending || cooldown || state === "verifying") return;
    const owner = user.uid;
    const token = ++resendOperation.current;
    setResending(true); setError(undefined);
    try { await getAuthRepository().sendVerificationEmail(redirect, owner); if (token === resendOperation.current && owner === currentOwner.current) { setState("idle"); setResent(true); setCooldown(60); } }
    catch (err) { if (token === resendOperation.current && owner === currentOwner.current) setError(authErrorCopy(err, "resendVerification")); }
    finally { if (token === resendOperation.current && owner === currentOwner.current) setResending(false); }
  };
  const verified = state === "verified" || user?.emailVerified === true;
  const continueTo = user ? redirect : `/signin?redirect=${encodeURIComponent(redirect)}`;
  const expired = state === "error" && Boolean(error && /verification link (is invalid|has expired)/.test(error));
  const heading = verified ? "Email verified" : state === "verifying" ? "Checking your link…" : expired ? "This link has expired" : state === "error" ? "This verification link is unavailable" : "Check your email";
  const subhead = verified || state === "verifying" ? undefined : state === "error" ? "Request a new verification email for your account." : failedDelivery && !resent ? `Your account${email ? ` for ${email}` : ""} was created, but we couldn’t send the verification email yet. Try resending it from this page.` : resent ? `We sent a new link${email ? ` to ${email}` : ""}. Check your spam folder too.` : email ? `We sent a verification link to ${email}.` : "Open the verification email and follow the link to confirm.";
  const icon = verified ? "check" : state === "verifying" ? "loader" : state === "error" ? "expired" : "mail";
  return <AuthModalCard heading={heading} headingIcon={<img src={`/design-assets/fidelity-auth-${icon}.svg`} alt="" />} subhead={subhead} placement={!verified && state !== "error" && state !== "verifying" ? "verification" : "center"}>
    {!verified && error && !(state === "error" && /verification link (is invalid|has expired)/.test(error)) ? <AuthNotice>{error}</AuthNotice> : null}
    {state === "verifying" ? <span className="sr-only" role="status">Verifying…</span> : <div className="vf-auth-actions">{state === "error" && !verified ? <><FreshButton tone="primary" large disabled={!user || resending || cooldown > 0} onClick={() => { void resend(); }}>{resending ? "Sending…" : cooldown ? `Resend in ${cooldown}s` : "Send a new link"}</FreshButton><FreshButton asChild tone="quiet" large><Link to={`/signin?redirect=${encodeURIComponent(redirect)}`}>Back to sign in</Link></FreshButton></> : <><FreshButton tone="primary" large onClick={() => navigate(continueTo, { replace: true })}>{verified ? "Continue to Vidra" : user ? "Continue to workspace" : "Sign in to continue"}</FreshButton>
    {!verified ? <><FreshButton tone="quiet" large disabled={!user || resending || cooldown > 0} onClick={() => { void resend(); }}>{resending ? "Sending…" : cooldown ? `Resend in ${cooldown}s` : "Resend verification"}</FreshButton>{!user ? <p className="vf-secondary">Sign in to resend a verification email.</p> : null}</> : null}</>}</div>}
  </AuthModalCard>;
}
