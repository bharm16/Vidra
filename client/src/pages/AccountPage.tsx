import { useEffect, useRef, useState, type ReactElement, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { getAuthRepository } from "@repositories/index";
import { useAuthUser } from "@hooks/useAuthUser";
import { FreshButton } from "@/components/fresh/FreshButton";
import { FreshRail } from "@/components/fresh/FreshRail";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@promptstudio/system/components/ui/dialog";
import { prepareWorkspaceSignOut, type WorkspaceDraftReturnTarget } from "@/repositories/workflow/WorkspaceRetention";
import { reopenWorkspaceState, workspaceEntryPath } from "@/features/project-workspace/state/workspaceEntry";
import { AuthFieldError, AuthNotice } from "./auth/AuthFormControls";
import { AccountMobileHeader, AccountSettingsNav, type AccountSection } from "./account/AccountSettingsNav";
import { AccountUsagePanel } from "./account/AccountUsagePanel";
import { useAccountProfile } from "./account/useAccountProfile";
import { DEVICE_WORK } from "./account/deviceWork";
import "@/components/fresh/fresh.css";
import "./auth/fresh-auth.css";
import "./account/account.css";

export function AccountPage(): ReactElement {
  const user = useAuthUser();
  const profile = useAccountProfile(user);
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const section = z.enum(["profile", "security", "usage", "privacy"]).catch("profile").parse(search.get("section")) satisfies AccountSection;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [fieldError, setFieldError] = useState<string>();
  const [signingOut, setSigningOut] = useState(false);
  const [signoutError, setSignoutError] = useState<string>();
  const [retentionReason, setRetentionReason] = useState<string>();
  const [retentionDeviceCopy, setRetentionDeviceCopy] = useState(false);
  const [retentionReturn, setRetentionReturn] = useState<{ target: WorkspaceDraftReturnTarget; state: ReturnType<typeof reopenWorkspaceState> }>();
  const signoutPending = useRef(false);
  const owner = useRef(user?.uid);
  owner.current = user?.uid;
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { setEditing(false); setName(""); setFieldError(undefined); setSignoutError(undefined); setSigningOut(false); setRetentionReason(undefined); setRetentionDeviceCopy(false); setRetentionReturn(undefined); }, [user?.uid, section]);
  const identity = profile.profile;
  const signout = async (confirmedDeviceCopy = false): Promise<void> => {
    if (!user || signingOut || signoutPending.current) return;
    const uid = user.uid;
    signoutPending.current = true;
    setSignoutError(undefined);
    try {
      const retention = await prepareWorkspaceSignOut(uid, DEVICE_WORK);
      if (!mounted.current || owner.current !== uid) return;
      if (!retention.safe && !(confirmedDeviceCopy && retention.canSignOutWithDeviceCopy)) {
        const target = retention.returnToDraft?.ownerId === uid ? retention.returnToDraft : undefined;
        setRetentionReason(retention.reason); setRetentionDeviceCopy(Boolean(retention.canSignOutWithDeviceCopy));
        setRetentionReturn(target ? { target, state: reopenWorkspaceState(target) } : undefined);
        return;
      }
      setSigningOut(true);
      await getAuthRepository().signOut(uid);
      if (mounted.current && !getAuthRepository().getCurrentUser()) navigate("/signin", { replace: true });
    } catch { if (mounted.current && owner.current === uid) { setSignoutError("You could not be signed out. Check your connection and try again."); setSigningOut(false); } }
    finally { signoutPending.current = false; }
  };
  const saveName = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    const parsed = z.string().trim().min(1).max(80).safeParse(name);
    if (!parsed.success) { setFieldError("Enter a name from 1 to 80 characters."); return; }
    setFieldError(undefined);
    if (parsed.data === identity?.displayName || await profile.saveName(parsed.data)) setEditing(false);
  };
  if (signingOut) return <main className="vf vf-account-lock" role="status">Signing out…</main>;
  if (!identity) return <main className="vf vf-account-lock"><h1>You’re not signed in</h1><p>Sign in to see your account and saved work.</p><FreshButton asChild tone="primary"><Link to="/signin?redirect=%2Faccount">Sign in</Link></FreshButton><FreshButton asChild><Link to="/signup?redirect=%2Faccount">Create account</Link></FreshButton></main>;
  const draftReturn = retentionReturn?.target.ownerId === user?.uid ? retentionReturn : undefined;
  const displayName = identity.displayName?.trim() || identity.email?.split("@")[0] || "Account";
  const methods = getAuthRepository().getSignInMethods(identity.uid);
  const canReset = methods.includes("password");
  const google = methods.includes("google.com");
  const cancelEdit = (): void => { setEditing(false); setFieldError(undefined); profile.clearNotice(); };
  const notice = profile.notice;
  return <div className="vf vf-account" data-section={section} data-profile-actions-hidden={section === "profile" && (editing || identity.emailVerified !== true) || undefined} data-reset-notice={notice?.kind === "reset" || Boolean(profile.busy === "reset") || google || undefined}><FreshRail active="account" onNavigate={destination => navigate(destination === "home" ? "/" : destination === "help" ? "/docs" : destination === "account" ? "/account" : destination === "sketch" ? "/live-editor" : destination === "media" ? "/app?view=media" : destination === "video" ? "/app?view=video" : destination === "projects" ? "/app/projects" : "/app")} /><AccountMobileHeader /><div className="vf-account-layout"><AccountSettingsNav section={section} onNavigate={cancelEdit} /><main className="vf-account-content">
    {section === "profile" ? <><h1>Profile</h1><section className={`vf-account-profile${editing ? " is-editing" : ""}`} aria-label="Profile summary"><div className="vf-account-avatar" aria-hidden="true">{displayName.charAt(0).toUpperCase()}</div>{editing ? <form className="vf-account-name-form" onSubmit={event => { void saveName(event); }} noValidate><div className="vf-account-name-identity"><label className="sr-only" htmlFor="account-name">Display name</label><input id="account-name" className="vf-field" autoComplete="nickname" value={name} maxLength={81} onChange={event => { setName(event.target.value); if (fieldError && event.target.value.trim().length > 0 && event.target.value.trim().length <= 80) setFieldError(undefined); }} aria-invalid={Boolean(fieldError)} aria-describedby={fieldError ? "account-name-error" : undefined} disabled={profile.busy === "name"} autoFocus />{fieldError ? <AuthFieldError id="account-name-error">{fieldError}</AuthFieldError> : <p>{identity.email || "Signed in"}</p>}</div><div className="vf-account-name-actions"><FreshButton type="button" tone="quiet" onClick={cancelEdit}>Cancel</FreshButton><FreshButton type="submit" tone="primary" disabled={Boolean(profile.busy) || Boolean(fieldError)}>{profile.busy === "name" ? "Saving…" : "Save changes"}</FreshButton></div></form> : <><div className="vf-account-identity"><h2>{displayName}</h2><p>{identity.email || "Signed in"}</p></div><FreshButton onClick={() => { setName(identity.displayName ?? ""); setEditing(true); profile.clearNotice(); }}>Edit name</FreshButton></>}</section>
    {notice?.kind === "name" ? <AuthNotice>{notice.message}</AuthNotice> : null}
    {identity.emailVerified !== true ? <><FreshButton className="vf-account-verification" tone="primary" disabled={Boolean(profile.busy) || profile.cooldown > 0} onClick={() => { void profile.sendVerification(); }}>{profile.busy === "verification" ? "Sending…" : profile.cooldown ? `Resend in ${profile.cooldown}s` : "Resend verification"}</FreshButton>{notice?.kind === "verification" ? <AuthNotice tone={notice.tone}>{notice.message}</AuthNotice> : null}</> : null}
    <FreshButton className="vf-account-signout" tone="quiet" disabled={Boolean(profile.busy)} onClick={() => { void signout(); }}>Sign out</FreshButton></> : null}
    {section === "security" ? <><h1>Security</h1><div className="vf-account-intro"><h2><span className="vf-account-desktop-copy">How you sign in</span><span className="vf-account-mobile-copy">{canReset ? "Email and password" : google ? "Google" : "Your sign-in provider"}</span></h2><p>Use the recovery method linked to your account.</p></div><dl className="vf-account-security"><div><dt>Email</dt><dd>{identity.email || "No email address"}</dd></div><div><dt>Sign-in method</dt><dd>{[canReset ? "Email and password" : undefined, google ? "Google" : undefined].filter(Boolean).join(" and ") || "Managed by your sign-in provider"}</dd></div></dl><p className="vf-secondary vf-account-recovery-copy">{canReset ? "Request a reset link to choose a new password." : google ? <><span className="vf-account-desktop-copy">Your Google password is managed in your Google account.</span><span className="vf-account-mobile-copy">Your password is managed in your Google account.</span></> : "Use your sign-in provider’s account settings to change your password."}</p>{canReset ? <FreshButton className="vf-account-reset" tone="primary" disabled={Boolean(profile.busy) || profile.resetCooldown > 0} data-loading={profile.busy === "reset" || undefined} title={profile.resetCooldown > 0 ? "Check your inbox for password reset instructions." : undefined} onClick={() => { void profile.sendReset(); }}>{profile.busy === "reset" ? <><img className="vf-account-loading-icon" src="/design-assets/fidelity-auth-button-loader.svg" alt="" />Sending…</> : "Send password reset email"}</FreshButton> : google ? <FreshButton asChild className="vf-account-reset"><a href="https://myaccount.google.com/security" target="_blank" rel="noreferrer" aria-label="Open Google account settings">Open Google account</a></FreshButton> : null}{notice?.kind === "reset" ? <div className="vf-account-reset-notice" data-tone={notice.tone}><AuthNotice tone={notice.tone}>{notice.message}</AuthNotice></div> : null}<small className="vf-secondary vf-account-security-safety">Never include a password or verification code in a support request.</small><FreshButton className="vf-account-security-support" asChild tone="quiet"><Link to="/contact">Contact support</Link></FreshButton></> : null}
    {section === "usage" ? <AccountUsagePanel ownerId={identity.uid} /> : null}
    {section === "privacy" ? <><h1>Data and privacy</h1><p className="vf-account-reading"><span className="vf-account-desktop-copy">Review how Vidra uses your information or prepare a request about your account data.</span><span className="vf-account-mobile-copy">Review the policy or prepare a request about your account data.</span></p><dl className="vf-account-privacy"><div><span><dt>Privacy policy</dt><dd>Read the current policy.</dd></span><FreshButton asChild><Link to="/privacy-policy"><span className="vf-account-desktop-copy">Read policy</span><span className="vf-account-mobile-copy">Read privacy policy</span></Link></FreshButton></div><div><span><dt>Account data</dt><dd>Request a copy of your account data.</dd></span><FreshButton asChild><Link to="/contact?topic=data"><span className="vf-account-desktop-copy">Request data</span><span className="vf-account-mobile-copy">Request account data</span></Link></FreshButton></div><div><span><dt>Account deletion</dt><dd>Ask support to review a deletion request.</dd></span><FreshButton asChild><Link to="/contact?topic=deletion"><span className="vf-account-desktop-copy">Request deletion</span><span className="vf-account-mobile-copy">Request account deletion</span></Link></FreshButton></div></dl></> : null}
    {signoutError ? <AuthNotice>{signoutError}</AuthNotice> : null}
  </main></div><Dialog open={Boolean(retentionReason)} onOpenChange={open => { if (!open) setRetentionReason(undefined); }}><DialogContent hideClose overlayClassName="vf-account-signout-overlay" className="vf vf-account-signout-dialog"><DialogTitle>Sign out?</DialogTitle><DialogDescription><span className="vf-account-desktop-copy">{retentionReason}</span><span className="vf-account-mobile-copy">{retentionDeviceCopy ? "A draft hasn’t finished saving. Return to it, or sign out and keep a copy on this device for this account." : retentionReason}</span></DialogDescription><div className="vf-account-signout-actions"><FreshButton asChild tone="primary"><Link to={draftReturn ? workspaceEntryPath(draftReturn.target) : "/app"} state={draftReturn?.state}>Return to draft</Link></FreshButton>{retentionDeviceCopy ? <FreshButton onClick={() => { void signout(true); }}>Sign out</FreshButton> : <FreshButton onClick={() => setRetentionReason(undefined)}>Stay signed in</FreshButton>}</div><DialogClose><img src="/design-assets/fidelity-public-close.svg" alt="" /><span className="sr-only">Close</span></DialogClose></DialogContent></Dialog></div>;
}
