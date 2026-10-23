import { useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuthUser } from "@/hooks/useAuthUser";
import { FreshButton } from "@/components/fresh/FreshButton";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@promptstudio/system/components/ui/dialog";
import { SiteCta, SiteNavLink } from "./components/SiteCta";
import "./site.css";

const NAVIGATION = [{ to: "/product", label: "Product" }, { to: "/pricing", label: "Pricing" }, { to: "/docs", label: "Docs" }] as const;
const MOBILE_NAVIGATION = [{ to: "/product", label: "Product" }, { to: "/docs", label: "Documentation" }, { to: "/pricing", label: "Pricing" }, { to: "/contact", label: "Support" }] as const;
const FOOTER_LINKS = [{ to: "/product", label: "Product" }, { to: "/pricing", label: "Pricing" }, { to: "/docs", label: "Docs" }, { to: "/contact", label: "Contact" }, { to: "/privacy-policy", label: "Privacy policy" }, { to: "/terms-of-service", label: "Terms of service" }] as const;

export function SiteLink({ to, children, tone = "quiet", className = "" }: { to: string; children: ReactNode; tone?: "primary" | "secondary" | "quiet"; className?: string }): ReactElement {
  return <FreshButton asChild tone={tone} large className={className}><Link to={to}><span>{children}</span></Link></FreshButton>;
}
export function SiteHeader(): ReactElement {
  const [resolved, setResolved] = useState(false);
  const user = useAuthUser({ onChange: () => setResolved(true) });
  const [mobile, setMobile] = useState(false);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const location = useLocation();
  useEffect(() => { setMobile(false); }, [location.pathname]);
  return <header className="vf-site-header"><div className="vf-site-header-start"><Link to="/" className="vf-site-brand">Vidra</Link><nav className="vf-site-navigation" id="public-navigation" aria-label="Main navigation">{NAVIGATION.map(link => <SiteNavLink key={link.to} to={link.to}>{link.label}</SiteNavLink>)}</nav></div>
    <div className="vf-site-account">{!resolved ? <span className="sr-only" role="status">Checking account…</span> : user ? <><SiteNavLink to="/account">Account</SiteNavLink><SiteCta to="/app" size="medium">Open workspace</SiteCta></> : <><SiteNavLink to="/signin">Sign in</SiteNavLink><SiteCta to="/app" size="medium">Start creating</SiteCta></>}</div><FreshButton ref={menuTrigger} className="vf-site-menu-toggle" tone="quiet" aria-label="Menu" aria-haspopup="dialog" aria-expanded={mobile} onClick={() => setMobile(true)}><span className="vf-site-menu-glyph" aria-hidden="true" /></FreshButton>
    <Dialog open={mobile} onOpenChange={setMobile}><DialogContent className="vf vf-site-mobile-navigation" overlayClassName="vf vf-site-overlay" aria-describedby={undefined} hideClose onCloseAutoFocus={event => { event.preventDefault(); menuTrigger.current?.focus(); }}><div className="vf-site-mobile-navigation-heading"><DialogTitle>Explore Vidra</DialogTitle><DialogClose asChild><FreshButton tone="quiet" aria-label="Close navigation"><img src="/design-assets/fidelity-public-close.svg" alt="" width={18} height={18} /></FreshButton></DialogClose></div><nav aria-label="Mobile public navigation" onClick={event => { if (event.target instanceof Element && event.target.closest("a")) setMobile(false); }}>{MOBILE_NAVIGATION.map(link => <SiteLink key={link.to} to={link.to}>{link.label}</SiteLink>)}{resolved && user ? <><SiteLink to="/account">Account</SiteLink><SiteLink to="/app" tone="primary">Open workspace</SiteLink></> : <><SiteLink to="/signin">Sign in</SiteLink><SiteLink to="/app" tone="primary">Start creating</SiteLink></>}</nav></DialogContent></Dialog>
  </header>;
}
/** Copyright, one row of links, and the wordmark filled with a still from a film. */
export function SiteFooter(): ReactElement {
  return <footer className="vf-site-footer"><div className="vf-site-footer-top"><p className="vf-site-copyright">© 2026 Vidra</p><nav aria-label="Footer">{FOOTER_LINKS.map(link => <Link key={link.to} to={link.to}>{link.label}</Link>)}</nav></div><p className="vf-site-wordmark" aria-hidden="true">Vidra</p></footer>;
}
export function SiteShell({ children, footer = true }: { children: ReactNode; footer?: boolean }): ReactElement { return <div className="vf vf-site"><SiteHeader />{children}{footer ? <SiteFooter /> : null}</div>; }
