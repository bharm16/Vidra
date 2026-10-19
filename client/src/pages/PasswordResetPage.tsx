import { useEffect, useId, useRef, useState, type FormEvent, type ReactElement } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { getAuthRepository } from "@repositories/index";
import { FreshButton } from "@/components/fresh/FreshButton";
import { AuthModalCard } from "./auth/AuthModalCard";
import { AuthNotice, AuthPasswordField } from "./auth/AuthFormControls";
import { readActionMode, readOobCode, safeRedirect } from "./auth/authParams";
import { authErrorCopy } from "./auth/authErrorCopy";

type ResetState = "checking" | "ready" | "success" | "error" | "missing";
export function PasswordResetPage(): ReactElement {
  const location = useLocation();
  const navigate = useNavigate();
  const redirect = safeRedirect(location.search) ?? "/app";
  const code = readOobCode(location.search);
  const mode = readActionMode(location.search);
  const [state, setState] = useState<ResetState>(code ? "checking" : "missing");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [fieldError, setFieldError] = useState<string>();
  const passwordId = useId();
  const token = useRef(0);
  useEffect(() => {
    const current = ++token.current;
    setError(undefined); setPassword(""); setBusy(false);
    if (!code) { setState("missing"); return; }
    if (mode && mode !== "resetPassword") { setState("error"); setError("This link is not a password reset link."); return; }
    setState("checking");
    void getAuthRepository().validatePasswordResetCode(code).then(() => { if (current === token.current) setState("ready"); }).catch((err: unknown) => { if (current === token.current) { setState("error"); setError(authErrorCopy(err, "passwordReset")); } });
    return () => { token.current += 1; };
  }, [code, mode]);
  const signInLink = `/signin?redirect=${encodeURIComponent(redirect)}`;
  const forgotLink = `/forgot-password${location.search ? `?redirect=${encodeURIComponent(redirect)}` : ""}`;
  const expired = state === "error" && Boolean(error && /reset link (is invalid|has expired)/.test(error));
  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault(); if (!code || busy || state !== "ready") return;
    setError(undefined); setFieldError(undefined);
    if (password.length < 6) { setFieldError("Password must be at least 6 characters."); return; }
    const current = ++token.current;
    setBusy(true);
    try { await getAuthRepository().confirmPasswordResetWithCode(code, password); if (current === token.current) { setState("success"); setPassword(""); } }
    catch (err) { if (current === token.current) setError(authErrorCopy(err, "passwordReset")); }
    finally { if (current === token.current) setBusy(false); }
  };
  if (state === "ready") return <AuthModalCard heading="Choose a new password" backTo={signInLink}>{error ? <AuthNotice>{error}</AuthNotice> : null}<form className="vf-auth-form" noValidate onSubmit={event => { void submit(event); }}><AuthPasswordField id={passwordId} label="New password" value={password} onChange={setPassword} visible={visible} onToggle={() => setVisible(value => !value)} disabled={busy} autoComplete="new-password" placeholder="" labelAside={<small>At least 6 characters</small>} error={fieldError} /><FreshButton type="submit" tone="primary" large disabled={busy}>{busy ? "Saving…" : "Save password"}</FreshButton></form></AuthModalCard>;
  return <AuthModalCard heading={state === "success" ? "Your password is changed" : state === "checking" ? "Checking your link…" : state === "missing" ? "Open your reset link" : expired ? "This reset link has expired" : "This reset link is unavailable"} headingIcon={<img src={`/design-assets/fidelity-auth-${state === "success" ? "check" : state === "checking" ? "loader" : "expired"}.svg`} alt="" />} subhead={state === "success" ? "Sign in with your new password to continue." : state === "missing" ? "Use the secure link in your email to set a new password." : expired ? "Request a new link and use the most recent email." : state === "error" ? "Request a new reset link if this one expired or was already used." : undefined}>
    {error && !(typeof error === "string" && /reset link (is invalid|has expired)/.test(error)) ? <AuthNotice>{error}</AuthNotice> : null}
    {state === "checking" ? <span className="sr-only" role="status">Validating link…</span> : state === "success" ? <FreshButton tone="primary" large onClick={() => navigate(signInLink, { replace: true })}>Back to sign in</FreshButton> : <div className="vf-auth-actions"><FreshButton asChild tone="primary" large><Link to={forgotLink}>{state === "error" ? "Request a new link" : "Request new email"}</Link></FreshButton>{state === "missing" ? <FreshButton asChild tone="quiet" large><Link to={signInLink}>Back to sign in</Link></FreshButton> : null}</div>}
  </AuthModalCard>;
}
