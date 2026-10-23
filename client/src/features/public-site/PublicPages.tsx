import { useEffect, type ReactElement } from "react";
import { useLocation } from "react-router-dom";
import { useAuthUser } from "@/hooks/useAuthUser";
import { SiteCta } from "./components/SiteCta";
import { DriveInClosing, StillWall, ToolIndex } from "./components/Landing";
import { EditorChapter, ImagesChapter, SketchChapter, VideoChapter } from "./components/ProductChapters";
import { FaqList } from "./components/Faq";
import "./pages.css";

export function LandingPage(): ReactElement {
  const member = Boolean(useAuthUser());
  return <main className="vf-site-landing">
    <section className="vf-site-hero" aria-labelledby="vf-site-landing-title"><h1 id="vf-site-landing-title" className="vf-site-banner">Film anything.</h1><div className="vf-site-actions"><SiteCta to="/app">{member ? "Open workspace" : "Start creating"}</SiteCta></div><StillWall /></section>
    <ToolIndex />
    <DriveInClosing member={member} />
  </main>;
}

/** Images, Video, Editor and Sketch share one page; /product#video opens a chapter. */
export function ProductPage(): ReactElement {
  const { hash } = useLocation();
  useEffect(() => { if (hash) document.getElementById(hash.slice(1))?.scrollIntoView?.({ block: "start" }); }, [hash]);
  return <main className="vf-site-product"><h1 className="sr-only">Product</h1><ImagesChapter /><VideoChapter /><EditorChapter /><SketchChapter /></main>;
}

const PRICING_QUESTIONS = [
  { question: "How does the allowance work?", answer: "Each request uses part of your allowance. Your saved work stays open, editable and downloadable, even after it runs out." },
  { question: "Can I pay for more?", answer: "Not yet. Paid plans aren’t available while we test." },
] as const;

/** The retained free-testing deep link does not expose a paid offer. */
export function PricingPage(): ReactElement {
  return <main className="vf-site-pricing"><h1 className="vf-site-numeral">$0</h1><div className="vf-site-pricing-details"><p className="vf-site-pricing-note">Free while we test.</p><SiteCta to="/signup?redirect=%2Fapp">Create an account</SiteCta><FaqList rows={PRICING_QUESTIONS} initiallyOpen={0} /></div></main>;
}
