import { useEffect, useId, useRef, useState, type FormEvent, type ReactElement } from "react";
import { Link, useLocation } from "react-router-dom";
import { z } from "zod";
import { getAuthRepository } from "@repositories/index";
import { FreshButton } from "@/components/fresh/FreshButton";
import { AuthModalCard } from "./auth/AuthModalCard";
import { AuthFieldError, AuthNotice } from "./auth/AuthFormControls";
import { safeRedirect } from "./auth/authParams";
import { authErrorCopy } from "./auth/authErrorCopy";
import { transition, useTransitionLink } from "@/components/motion/viewTransition";

export function ForgotPasswordPage(): ReactElement {
  const location = useLocation();
  const redirect = safeRedirect(location.search);
  const emailId = useId();
  const [email, setEmail] = useState(() => new URLSearchParams(location.search).get("email")?.trim() ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [fieldError, setFieldError] = useState<string>();
  const [sentTo, setSentTo] = useState<string>();
  const token = useRef(0);
  useEffect(() => { token.current += 1; setBusy(false); setSentTo(undefined); setError(undefined); return () => { token.current += 1; }; }, [location.search]);
  const signInLink = `/signin${redirect ? `?redirect=${encodeURIComponent(redirect)}` : ""}`;
  const transitionLink = useTransitionLink();
  const handleSend = async (event: FormEvent): Promise<void> => {
    event.preventDefault(); if (busy) return;
    setError(undefined); setFieldError(undefined);
    const normalized = email.trim();
    if (!z.string().email().safeParse(normalized).success) { setFieldError("Enter a valid email address."); return; }
    const current = ++token.current;
    setBusy(true);
    // The same card reshapes for "Check your inbox", whose words arrive 20ms later than other steps (frame 2715).
    try { await getAuthRepository().sendPasswordReset(normalized, redirect ?? undefined); if (current === token.current) transition("reshape", () => setSentTo(normalized), { "--vf-auth-arrive-delay": "140ms" }); }
    catch (err) { if (current === token.current) setError(authErrorCopy(err, "forgotPassword")); }
    finally { if (current === token.current) setBusy(false); }
  };
  if (sentTo) return <AuthModalCard heading="Check your inbox" headingIcon={<img src="/design-assets/fidelity-auth-mail.svg" alt="" />} subhead={<>If an account uses {sentTo}, a reset link will arrive shortly. Check your spam folder too.</>}><div className="vf-auth-actions"><FreshButton asChild tone="primary" large><Link to={signInLink} onClick={transitionLink("reshape", signInLink)}>Back to sign in</Link></FreshButton><FreshButton tone="quiet" onClick={() => transition("reshape", () => setSentTo(undefined))} large>Use a different email</FreshButton></div></AuthModalCard>;
  return <AuthModalCard heading="Reset your password" backTo={signInLink}>{error ? <AuthNotice>{error}</AuthNotice> : null}<form className="vf-auth-form" noValidate onSubmit={event => { void handleSend(event); }}><div className="vf-auth-field vf-auth-email"><label htmlFor={emailId} className="vf-auth-label">Email</label><input className="vf-field" id={emailId} type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={event => setEmail(event.target.value)} disabled={busy} aria-invalid={Boolean(fieldError)} aria-describedby={fieldError ? `${emailId}-error` : undefined} />{fieldError ? <AuthFieldError id={`${emailId}-error`}>{fieldError}</AuthFieldError> : null}</div><FreshButton type="submit" tone="primary" large disabled={busy}>{busy ? "Sending…" : "Send reset link"}</FreshButton></form></AuthModalCard>;
}
