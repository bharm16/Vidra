import { type ReactElement } from "react";
import { useLocation } from "react-router-dom";
import { FreshButton } from "@/components/fresh/FreshButton";
import { SiteLink, SiteShell } from "./SiteShell";

export type SystemPageState = "loading" | "load-error" | "offline" | "not-found" | "unavailable" | "denied";
const MESSAGES: Record<SystemPageState, { title: string; body?: string; icon: string }> = {
  loading: { title: "Loading…", icon: "loading" },
  "load-error": { title: "This page could not load", body: "Try again. If it keeps happening, contact support.", icon: "alert" },
  offline: { title: "You are offline", body: "Reconnect and try again.", icon: "offline" },
  "not-found": { title: "We could not find that page", body: "The link may have changed. Find what you need from the home page.", icon: "alert" },
  unavailable: { title: "Vidra is temporarily unavailable", body: "Try again in a moment.", icon: "alert" },
  denied: { title: "You do not have access", body: "Sign in with the account that owns this project.", icon: "lock" },
};
export function SystemPage({ state, onRetry, onSwitchAccount }: { state: SystemPageState; onRetry?: () => void; onSwitchAccount?: () => void }): ReactElement {
  const location = useLocation();
  const message = MESSAGES[state];
  return <main className="vf-system-page" data-system-state={state}><section className="vf-system-message" role={state === "loading" ? "status" : undefined}>
    <img src={`/design-assets/public-${message.icon}.svg`} alt="" width={32} height={32} className={state === "loading" ? "vf-system-spinner" : undefined} />
    <h1>{state === "not-found" ? <><span className="vf-site-desktop-copy">{message.title}</span><span className="vf-site-mobile-copy">Page not found</span></> : state === "loading" ? <><span className="vf-site-desktop-copy">{message.title}</span><span className="vf-site-mobile-copy">Opening your page…</span></> : message.title}</h1>{message.body ? <p>{state === "not-found" || state === "load-error" || state === "denied" ? <><span className="vf-site-desktop-copy">{message.body}</span><span className="vf-site-mobile-copy">{state === "not-found" ? "The link may have changed. Start from the home page." : state === "load-error" ? "Try again in a moment." : "Sign in with the account that owns this work."}</span></> : message.body}</p> : state === "loading" ? <p className="vf-site-mobile-copy">Checking your account…</p> : null}
    {state === "not-found" ? <SiteLink to="/" tone="primary">Go home</SiteLink> : state === "denied" ? onSwitchAccount ? <FreshButton tone="primary" large onClick={onSwitchAccount}>Switch account</FreshButton> : <SiteLink to={`/signin?redirect=${encodeURIComponent(location.pathname + location.search)}`} tone="primary">Switch account</SiteLink> : state !== "loading" ? <FreshButton tone="primary" large onClick={onRetry ?? (() => window.location.reload())}>Try again</FreshButton> : null}
  </section>{state !== "loading" ? <SiteLink to="/contact">Contact support</SiteLink> : null}</main>;
}
export function SystemRoutePage(props: { state: SystemPageState; onRetry?: () => void; onSwitchAccount?: () => void }): ReactElement {
  return <SiteShell footer={false}><SystemPage {...props} /></SiteShell>;
}
