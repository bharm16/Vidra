import type { ReactElement } from "react";
import { Link } from "react-router-dom";
import { SiteLink } from "../SiteShell";
import { PUBLIC_DESK, PUBLIC_RUNNER } from "../stills";
import { MobileContentsSheet } from "../MobileContentsSheet";
import { findArticle, type DocArticle } from "./articles";
import { findNavigationArticle } from "./navigation";

export interface DocsBodyProps { slug: string; query: string }
const GUIDE_CARDS = [["images", "picture"], ["video", "video"], ["editor", "scissors"], ["history", "history"], ["imports", "folder"], ["recovery", "refresh"]] as const;
const MOBILE_HOME_GUIDES = ["start", "images", "video", "editor", "history", "recovery"] as const;
const HOME_CARD_DESCRIPTIONS: Record<string, string> = { images: "Choose exact inputs and keep versions.", video: "Describe a shot or animate an image.", editor: "Arrange media, timing, captions and audio.", history: "Keep history and several edits in progress.", imports: "Add files, inspect them and choose their use.", recovery: "Resolve offline work and uncertain results." };

function GuideIllustration({ slug }: { slug: string }): ReactElement {
  const desk = slug === "images" || slug === "history" || slug === "sketch" || slug === "imports";
  const mobileDesk = desk || slug === "regions";
  return <div className="vf-docs-illustration"><picture><source media="(max-width: 767px)" srcSet={mobileDesk ? PUBLIC_DESK : PUBLIC_RUNNER} /><img src={desk ? PUBLIC_DESK : PUBLIC_RUNNER} alt="Example project media" /></picture>{slug === "editor" ? <p className="vf-docs-example-caption">Make room for evening.</p> : slug === "history" ? <div className="vf-docs-example-versions"><div><p>Version 1</p><span>Original</span></div><div><p>Version 2</p><span>Warmer light</span></div></div> : null}</div>;
}

function ResponsiveCopy({ text, mobile }: { text: string; mobile: string | undefined }): ReactElement {
  return mobile ? <><span className="vf-site-desktop-copy">{text}</span><span className="vf-site-mobile-copy">{mobile}</span></> : <>{text}</>;
}

function Contents({ article }: { article: DocArticle }): ReactElement {
  return <nav aria-label="On this page" className="vf-docs-contents"><p>On this page</p>{article.sections.map(section => <a key={section.id} href={`#${section.id}`} onClick={() => {
    const heading = document.getElementById(section.id);
    heading?.focus({ preventScroll: true });
    heading?.scrollIntoView?.({ block: "start" });
  }}>{section.title}</a>)}</nav>;
}

/** The independently loaded reading surface uses the same bundled, local article content. */
export function DocsBody({ slug, query }: DocsBodyProps): ReactElement {
  const article = findArticle(slug);
  const suffix = query ? `?q=${encodeURIComponent(query)}` : "";
  if (article) return <>
    <main className="vf-docs-main vf-docs-article" data-docs-article={article.slug}>
      <p className="vf-docs-breadcrumb"><Link to={`/docs${suffix}`}>Documentation</Link> / {article.label}</p>
      <header><h1>{article.title}</h1>{article.description ? <p><ResponsiveCopy text={article.description} mobile={article.mobileDescription} /></p> : null}</header>
      <MobileContentsSheet className="vf-docs-mobile-contents" items={article.sections.map(section => ({ id: section.id, label: section.mobileTitle ?? section.title }))} />
      <GuideIllustration slug={article.slug} />
      {article.sections.map(section => <section key={section.id}><h2 id={section.id} tabIndex={-1}><ResponsiveCopy text={section.title} mobile={section.mobileTitle} /></h2><p><ResponsiveCopy text={section.body} mobile={section.mobileBody} /></p></section>)}
      <div className="vf-docs-next"><Link to={`/docs/start${suffix}`}>Get started<img src="/design-assets/docs-arrow-right.svg" alt="" /></Link><Link to="/contact">Contact support<img src="/design-assets/docs-arrow-right.svg" alt="" /></Link></div>
    </main><aside className="vf-docs-desktop-contents"><Contents article={article} /></aside>
  </>;
  return <main className="vf-docs-main vf-docs-home">
    <header><h1>Make the most of Vidra.</h1><p><span className="vf-site-desktop-copy">Guides for making images, clips and finished videos, and for keeping your work organized.</span><span className="vf-site-mobile-copy">Guides for creating and keeping your work.</span></p></header>
    <section className="vf-docs-start"><img src={PUBLIC_RUNNER} alt="" /><div><h2>Start with your idea.</h2><p>Choose an action, review your inputs, and make a first result.</p><SiteLink to={`/docs/start${suffix}`} tone="primary">Get started</SiteLink></div></section>
    <div className="vf-docs-cards">{GUIDE_CARDS.map(([key, icon]) => {
      const guide = findNavigationArticle(key);
      return guide ? <Link to={`/docs/${key}${suffix}`} key={key}><img src={`/design-assets/docs-${icon}.svg`} alt="" /><h2>{guide.title}</h2><p>{HOME_CARD_DESCRIPTIONS[key]}</p></Link> : null;
    })}</div>
    <img className="vf-docs-mobile-home-image" src={PUBLIC_RUNNER} alt="A runner on a floodlit track" />
    <div className="vf-docs-mobile-home-guides">{MOBILE_HOME_GUIDES.map(key => { const guide = findNavigationArticle(key); return guide ? <Link to={`/docs/${key}${suffix}`} key={key}><h2>{guide.title}</h2><p>{guide.description}</p></Link> : null; })}</div>
  </main>;
}
