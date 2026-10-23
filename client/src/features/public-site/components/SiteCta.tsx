import { type ButtonHTMLAttributes, type ReactElement, type ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";

type CtaTone = "accent" | "ghost";
type CtaSize = "large" | "medium";

/** Marketing call to action: Accent is the one yellow action on a screen, Ghost the quiet ones. */
export function SiteCta({ to, tone = "accent", size = "large", className = "", children }: { to: string; tone?: CtaTone; size?: CtaSize; className?: string; children: ReactNode }): ReactElement {
  return <Link to={to} className={`vf-site-cta ${className}`.trim()} data-tone={tone} data-size={size}>{children}</Link>;
}

export function SiteCtaButton({ tone = "ghost", size = "medium", className = "", children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: CtaTone; size?: CtaSize }): ReactElement {
  return <button type="button" {...props} className={`vf-site-cta ${className}`.trim()} data-tone={tone} data-size={size}>{children}</button>;
}

/** Header link; the router marks the page you are on with aria-current. */
export function SiteNavLink({ to, children }: { to: string; children: ReactNode }): ReactElement {
  return <NavLink to={to} className="vf-site-nav-link">{children}</NavLink>;
}
