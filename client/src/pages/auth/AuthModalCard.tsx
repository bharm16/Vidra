import type { ReactElement, ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTransitionCommit, useTransitionLink } from "@/components/motion/viewTransition";
import { SiteHeader } from "@/features/public-site/SiteShell";
import "@/components/fresh/fresh.css";
import "./fresh-auth.css";

interface AuthModalCardProps {
  heading?: string;
  subhead?: ReactNode;
  headingIcon?: ReactNode;
  children: ReactNode;
  dismissTo?: string;
  footer?: boolean;
  backTo?: string;
  placement?: "center" | "verification";
}

export function AuthBrand(): ReactElement { return <span>Vidra</span>; }

/** Auth forms and messages share the approved Conversation-panel surface. */
export function AuthModalCard({ heading, subhead, headingIcon, children, dismissTo = "/", footer = false, backTo, placement = "center" }: AuthModalCardProps): ReactElement {
  const transitionLink = useTransitionLink();
  useTransitionCommit();
  return <div className="vf vf-auth-stage" data-placement={footer ? "entry" : placement}>
    <div className="vf-auth-ambient" aria-hidden="true"><img src="/design-assets/auth-ambient-stadium.png" alt="" /></div>
    <header className="vf-auth-header"><Link to={dismissTo} aria-label="Vidra home"><AuthBrand /></Link><Link to="/contact">Help</Link></header>
    <div className="vf-auth-mobile-header"><SiteHeader /></div>
    <main className="vf-auth-main"><section className="vf-auth-card" aria-label={heading ?? "Your Vidra account"}><div className="vf-auth-body">
      <div className={`vf-auth-content${headingIcon ? " vf-auth-message" : ""}`}>
        {headingIcon ? <div className="vf-auth-message-icon">{headingIcon}</div> : null}
        {heading ? <div className="vf-auth-message-text"><div className="vf-auth-title-row">{backTo ? <Link to={backTo} onClick={transitionLink("reshape", backTo)} aria-label="Back to sign in"><img src="/design-assets/auth-back.svg" alt="" /></Link> : null}<h1>{heading}</h1></div>{subhead ? <div className="vf-auth-subhead">{subhead}</div> : null}</div> : subhead ? <div className="vf-auth-subhead">{subhead}</div> : null}
        {children}
      </div>
      {footer ? <footer className="vf-auth-consent">By continuing, you agree to the <Link to="/terms-of-service">Terms of service</Link> and <Link to="/privacy-policy">Privacy policy</Link>.</footer> : null}
    </div></section></main>
  </div>;
}
