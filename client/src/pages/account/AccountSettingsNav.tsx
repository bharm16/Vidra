import { useState, type ReactElement } from "react";
import { Link } from "react-router-dom";
import { FreshButton } from "@/components/fresh/FreshButton";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@promptstudio/system/dialog";
import { SiteHeader } from "@/features/public-site/SiteShell";

export type AccountSection = "profile" | "security" | "usage" | "privacy";
const SECTIONS: Array<{ id: AccountSection; label: string }> = [{ id: "profile", label: "Profile" }, { id: "security", label: "Security" }, { id: "usage", label: "Usage" }, { id: "privacy", label: "Data and privacy" }];
const sectionPath = (section: AccountSection): string => section === "profile" ? "/account" : `/account?section=${section}`;
export function AccountMobileHeader(): ReactElement {
  return <div className="vf-account-mobile-header"><SiteHeader /></div>;
}
export function AccountSettingsNav({ section, onNavigate }: { section: AccountSection; onNavigate: () => void }): ReactElement {
  const [open, setOpen] = useState(false);
  return <><nav className="vf-account-navigation" aria-label="Account settings"><span>Your account</span>{SECTIONS.map(item => <Link key={item.id} to={sectionPath(item.id)} aria-current={section === item.id ? "page" : undefined} onClick={onNavigate}>{item.label}</Link>)}<Link className="vf-account-back" to="/app" onClick={onNavigate}>Back to workspace</Link></nav>
  <div className="vf-account-mobile-menu"><Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><FreshButton tone="quiet">Account menu</FreshButton></DialogTrigger><DialogContent hideClose overlayClassName="vf-account-menu-overlay" className="vf vf-account-menu-sheet"><DialogTitle>Your account</DialogTitle><DialogDescription className="sr-only">Choose your account settings section.</DialogDescription>{SECTIONS.map(item => <FreshButton asChild tone="quiet" key={item.id}><Link to={sectionPath(item.id)} onClick={() => { setOpen(false); onNavigate(); }} aria-current={section === item.id ? "page" : undefined}>{item.label}</Link></FreshButton>)}<DialogClose><img src="/design-assets/fidelity-public-close.svg" alt="" /><span className="sr-only">Close</span></DialogClose></DialogContent></Dialog></div></>;
}
