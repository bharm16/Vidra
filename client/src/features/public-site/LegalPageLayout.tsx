import { type ReactElement, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { FreshButton } from "@/components/fresh/FreshButton";
import { SiteShell } from "./SiteShell";
import { MobileContentsSheet } from "./MobileContentsSheet";
import "./legal.css";

export function LegalPageLayout({ title, toc, children, updated = "January 13, 2026" }: { title: string; toc: Array<{ id: string; label: string }>; children: ReactNode; updated?: string }): ReactElement {
  const navigate = useNavigate();
  return <SiteShell><main className="vf-legal" data-policy={title === "Privacy policy" ? "privacy" : "terms"}><aside><FreshButton tone="quiet" onClick={() => { if (window.history.length > 1) void navigate(-1); else void navigate("/"); }}>Back</FreshButton><nav className="vf-legal-desktop-contents" aria-label="On this page"><p>On this page</p>{toc.map(item => <a key={item.id} href={`#${item.id}`} onClick={() => document.getElementById(item.id)?.focus({ preventScroll: true })}>{item.label}</a>)}</nav></aside><article><header><h1>{title}</h1><p>Updated {updated}</p></header><MobileContentsSheet className="vf-legal-mobile-contents" tone="secondary" items={toc} />{children}</article></main></SiteShell>;
}
