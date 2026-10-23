import { type ReactElement, type ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { FreshButton } from "@/components/fresh/FreshButton";
import { SiteShell } from "./SiteShell";
import { MobileContentsSheet } from "./MobileContentsSheet";
import "./legal.css";

const LEGAL_PAGES = [{ to: "/privacy-policy", label: "Privacy policy" }, { to: "/terms-of-service", label: "Terms of service" }] as const;

/** A title band over the document rail: the legal pages, then this page's sections. */
export function LegalPageLayout({ title, toc, children, updated = "January 13, 2026" }: { title: string; toc: Array<{ id: string; label: string }>; children: ReactNode; updated?: string }): ReactElement {
  const navigate = useNavigate();
  return <SiteShell><main className="vf-legal">
    <FreshButton className="vf-legal-back" tone="quiet" onClick={() => { if (window.history.length > 1) void navigate(-1); else void navigate("/"); }}>Back</FreshButton>
    <header className="vf-legal-title"><h1 className="vf-site-title">{title}</h1><p className="vf-site-label">Updated {updated}</p></header>
    <div className="vf-legal-document"><aside className="vf-legal-rail"><nav aria-label="Legal"><p className="vf-site-label">Legal</p>{LEGAL_PAGES.map(page => <NavLink key={page.to} to={page.to}>{page.label}</NavLink>)}</nav><nav aria-label="On this page"><p className="vf-site-label">On this page</p>{toc.map(item => <a key={item.id} href={`#${item.id}`} onClick={() => document.getElementById(item.id)?.focus({ preventScroll: true })}>{item.label}</a>)}</nav></aside>
      <article><MobileContentsSheet className="vf-legal-mobile-contents" tone="secondary" items={toc} />{children}</article></div>
  </main></SiteShell>;
}
