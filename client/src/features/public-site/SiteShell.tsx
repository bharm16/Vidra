import { useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuthUser } from "@/hooks/useAuthUser";
import { FreshButton } from "@/components/fresh/FreshButton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@promptstudio/system/components/ui/dropdown-menu";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@promptstudio/system/components/ui/dialog";
import "./site.css";

export const PRODUCTS = [{ path: "/product/images", label: "Images", description: "Create or edit an image", icon: "image" }, { path: "/product/video", label: "Video", description: "Generate a standalone clip", icon: "video" }, { path: "/product/editor", label: "Video editor", description: "Trim, arrange and export", icon: "scissors" }, { path: "/product/sketch", label: "Sketch", description: "Explore a live drawing", icon: "paintbrush" }] as const;
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
  return <header className="vf-site-header"><Link to="/" className="vf-site-brand">Vidra</Link><nav className="vf-site-navigation" id="public-navigation" aria-label="Main navigation">
    <DropdownMenu><DropdownMenuTrigger asChild><FreshButton tone="quiet" large>Product</FreshButton></DropdownMenuTrigger><DropdownMenuContent align="start" alignOffset={-20} sideOffset={14} className="vf vf-site-product-menu">{PRODUCTS.map(product => <DropdownMenuItem key={product.path} asChild><Link to={product.path}><span className="vf-site-product-glyph"><img src={`/design-assets/fidelity-public-${product.icon}.svg`} alt="" width={24} height={24} /></span><span><strong>{product.label}</strong><small>{product.description}</small></span></Link></DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>
    <SiteLink to="/docs">Docs</SiteLink><SiteLink to="/contact">Support</SiteLink>
  </nav><div className="vf-site-account">{!resolved ? <span className="sr-only" role="status">Checking account…</span> : user ? <><SiteLink to="/account">Account</SiteLink><SiteLink to="/app" tone="primary">Open workspace</SiteLink></> : <><SiteLink to="/signin">Sign in</SiteLink><SiteLink to="/signup?redirect=%2Fapp" tone="primary">Start creating</SiteLink></>}</div><FreshButton ref={menuTrigger} className="vf-site-menu-toggle" tone="quiet" aria-label="Menu" aria-haspopup="dialog" aria-expanded={mobile} onClick={() => setMobile(true)}><span className="vf-site-menu-glyph" aria-hidden="true" /></FreshButton>
    <Dialog open={mobile} onOpenChange={setMobile}><DialogContent className="vf vf-site-mobile-navigation" overlayClassName="vf vf-site-overlay" aria-describedby={undefined} hideClose onCloseAutoFocus={event => { event.preventDefault(); menuTrigger.current?.focus(); }}><div className="vf-site-mobile-navigation-heading"><DialogTitle>Explore Vidra</DialogTitle><DialogClose asChild><FreshButton tone="quiet" aria-label="Close navigation"><img src="/design-assets/fidelity-public-close.svg" alt="" width={18} height={18} /></FreshButton></DialogClose></div><nav aria-label="Mobile public navigation" onClick={event => { if (event.target instanceof Element && event.target.closest("a")) setMobile(false); }}>{PRODUCTS.map(product => <SiteLink key={product.path} to={product.path}>{product.label}</SiteLink>)}<SiteLink to="/docs">Documentation</SiteLink><SiteLink to="/contact">Support</SiteLink>{resolved && user ? <><SiteLink to="/account">Account</SiteLink><SiteLink to="/app" tone="primary">Open workspace</SiteLink></> : <><SiteLink to="/signin">Sign in</SiteLink><SiteLink to="/signup?redirect=%2Fapp" tone="primary">Start creating</SiteLink></>}</nav></DialogContent></Dialog>
  </header>;
}
export function SiteFooter(): ReactElement {
  const groups = [{ title: "Create", links: PRODUCTS }, { title: "Learn", links: [{ path: "/docs", label: "Documentation" }, { path: "/docs/start", label: "Get started" }, { path: "/docs/history", label: "History and versions" }, { path: "/docs/recovery", label: "Recover your work" }] }, { title: "Company", links: [{ path: "/contact", label: "Contact support" }, { path: "/privacy-policy", label: "Privacy policy" }, { path: "/terms-of-service", label: "Terms of service" }] }];
  return <footer className="vf-site-footer"><div><Link className="vf-site-brand" to="/">Vidra</Link><p className="vf-secondary">Images, clips and finished videos.</p></div>{groups.map(group => <nav key={group.title} aria-label={group.title}><p>{group.title}</p>{group.title === "Company" ? <Link className="vf-site-mobile-docs" to="/docs">Documentation</Link> : null}{group.links.map(link => <Link key={link.path} to={link.path}>{link.label}</Link>)}</nav>)}</footer>;
}
export function SiteShell({ children, footer = true }: { children: ReactNode; footer?: boolean }): ReactElement { return <div className="vf vf-site"><SiteHeader />{children}{footer ? <SiteFooter /> : null}</div>; }
