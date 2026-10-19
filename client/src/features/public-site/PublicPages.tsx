import { useState, type ReactElement } from "react";
import { Link, useLocation } from "react-router-dom";
import { FreshButton } from "@/components/fresh/FreshButton";
import { useAuthUser } from "@/hooks/useAuthUser";
import { MarketingPreview, PUBLIC_DESK, PUBLIC_RUNNER } from "./MarketingPreview";
import { SiteLink } from "./SiteShell";

export function LandingPage(): ReactElement {
  const user = useAuthUser();
  return <main className="vf-site-page vf-site-landing">
    <section className="vf-site-hero"><h1>Images, clips,<br />and finished videos.</h1><p>Start with words, a sketch, or your own media.<span className="vf-site-desktop-copy"> Create something you can keep working on.</span></p><div className="vf-site-actions"><SiteLink to="/app" tone="primary">{user ? "Open workspace" : "Start creating"}</SiteLink><SiteLink className="vf-site-desktop-copy" to="/docs/start" tone="secondary">See how it works</SiteLink></div></section>
    <MarketingPreview assembly mobileShots />
    <section className="vf-site-introduction"><h2><span className="vf-site-desktop-copy">Start where your idea starts.</span><span className="vf-site-mobile-copy">Choose what to make.</span></h2><p className="vf-site-desktop-copy">Make a single image, generate a clip, or bring existing footage together. Choose the tool that fits the work.</p></section>
    <div className="vf-site-ways">{[
      { title: "Images", image: PUBLIC_DESK, path: "/product/images", words: "Create from words. Edit a specific image. Keep each version.", mobileWords: "Create from words or edit a specific image." },
      { title: "Video clips", image: PUBLIC_RUNNER, path: "/product/video", words: "Generate a shot directly, or animate an image you choose.", mobileWords: "Describe a shot or animate an image." },
      { title: "Finished videos", image: PUBLIC_RUNNER, path: "/product/editor", words: "Arrange your media, shape the timing, and export a saved cut.", mobileWords: "Arrange media, captions and audio." },
    ].map(card => <Link key={card.path} to={card.path}><img src={card.image} alt="" /><h3>{card.title}</h3><p><span className="vf-site-desktop-copy">{card.words}</span><span className="vf-site-mobile-copy">{card.mobileWords}</span></p></Link>)}</div>
    <section className="vf-site-keep"><img src={PUBLIC_DESK} alt="" /><div><h2>Every edit has a place.</h2><p>Return to earlier versions, keep several drafts, and continue while another request is running.</p><SiteLink to="/docs/history">Explore the workflow</SiteLink></div></section>
  </main>;
}

const PRODUCT_DETAILS = {
  images: { title: "Create the image you have in mind.", description: "Describe a new image, or choose one exact version to edit. Keep the original and explore another direction.", image: PUBLIC_DESK, words: "Warm the light near the window.", intent: "make-image", icon: "image", cards: [["Start with words", "Describe the subject, setting and details that matter."], ["Choose an exact input", "Use your own image or a version from your project."], ["Keep useful variations", "Compare results and return to the source whenever you need it."]] },
  video: { title: "Make the shot you need.", description: "Generate a video from words or animate an image you choose. Review the model, duration and sound before you run.", image: PUBLIC_RUNNER, words: "Follow the runner at track level.", intent: "make-video", icon: "video", cards: [["Describe the shot", "Write the action and camera movement you want."], ["Choose your settings", "Use an available model and supported duration."], ["Take the result further", "Download the clip or add it to a video edit."]] },
  editor: { title: "Turn your footage into a finished video.", description: "Arrange clips and images, adjust timing, add text and audio, and export one saved cut.", image: PUBLIC_RUNNER, words: "", intent: "video-edit", icon: "scissors", cards: [["Bring your media together", "Import footage or choose exact versions already in your project."], ["Shape the edit", "Trim, reorder, frame and add captions or background audio."], ["Export a saved cut", "Keep editing while your saved version exports."]] },
  sketch: { title: "See a drawing take shape.", description: "Draw and describe your idea. Start the live preview when you are ready, and keep the exact image you choose.", image: PUBLIC_DESK, words: "A quiet desk in evening light.", intent: "sketch", icon: "paintbrush", cards: [["Draw your starting point", "Use the canvas to explore placement and form."], ["Start the preview", "Control when live generation begins and pauses."], ["Keep the image you see", "Accept the displayed preview, then decide how to use it."]] },
} as const;

const MOBILE_PRODUCT_DETAILS = {
  images: { description: "Make an image from words or edit an exact version.", cards: [["Start with words", "Describe a new image or choose one to edit."], ["Choose your settings", "Review the model, shape and exact inputs."], ["Keep useful versions", "Compare results and return to the source."]] },
  video: { description: "Start from words or animate an image you choose.", cards: [["Describe the shot", "Write the action and camera movement."], ["Choose your settings", "Review the supported model, duration and audio."], ["Use the result", "Download the clip or add it to a video edit."]] },
  editor: { description: "Arrange clips, images, captions and audio.", cards: [["Bring your media together", "Import footage or choose saved versions."], ["Shape the edit", "Trim, arrange, frame and add text or audio."], ["Export a saved cut", "Capture one saved revision while you keep editing."]] },
  sketch: { description: "Draw, start the preview, and keep the exact image you choose.", cards: [["Draw your starting point", "Use the canvas to explore form and placement."], ["Start the preview", "Control when live work begins and pauses."], ["Accept what you see", "Save the displayed image, then choose its use."]] },
} as const;

export function ProductPage(): ReactElement {
  const path = useLocation().pathname.split("/").at(-1);
  const key = path === "images" || path === "video" || path === "editor" || path === "sketch" ? path : "images";
  const product = PRODUCT_DETAILS[key];
  const mobile = MOBILE_PRODUCT_DETAILS[key];
  return <main className="vf-site-page vf-site-product" data-product={key}>
    <section className="vf-site-introduction"><h1>{product.title}</h1><p><span className="vf-site-desktop-copy">{product.description}</span><span className="vf-site-mobile-copy">{mobile.description}</span></p></section>
    <SiteLink to={`/app?intent=${product.intent}`} tone="primary">Start creating</SiteLink>
    <MarketingPreview image={product.image} words={product.words} assembly={key === "editor"} action={key === "sketch" ? "Start preview" : "Make video"} />
    <div className="vf-site-feature-cards">{product.cards.map(([title, words]) => <article key={title}><img src={`/design-assets/fidelity-public-${product.icon}.svg`} alt="" width={24} height={24} /><h3>{title}</h3><p>{words}</p></article>)}</div>
    <div className="vf-site-mobile-features">{mobile.cards.map(([title, words]) => <section key={title}><h2>{title}</h2><p>{words}</p></section>)}</div>
    <Faq initiallyOpen rows={[{ question: key === "editor" ? "Can I use footage I already have?" : "Do I have to follow a fixed creation sequence?", answer: key === "editor" ? "Yes. Import your footage and choose the versions you want in your edit." : "Start with the input and action that fit your work. Creating an image, generating a clip, and editing a video are separate choices." }]} />
  </main>;
}

function Faq({ rows, initiallyOpen = false }: { rows: Array<{ question: string; answer: string; mobileAnswer?: string; desktopOnly?: boolean }>; initiallyOpen?: boolean }): ReactElement {
  const [open, setOpen] = useState(initiallyOpen);
  return <div className="vf-site-faq" data-open={open || undefined}>{rows.map((row, index) => <section key={row.question} className={row.desktopOnly ? "vf-site-desktop-faq" : undefined}><FreshButton tone="quiet" aria-expanded={open} aria-controls={`faq-${index}`} onClick={() => setOpen(current => !current)}><span>{row.question}</span><img src={`/design-assets/fidelity-public-${open ? "close" : "plus"}.svg`} alt="" width={18} height={18} /></FreshButton><p id={`faq-${index}`} hidden={!open}>{row.mobileAnswer ? <><span className="vf-site-desktop-copy">{row.answer}</span><span className="vf-site-mobile-copy">{row.mobileAnswer}</span></> : row.answer}</p><div className="vf-site-faq-divider" /></section>)}</div>;
}

/** The retained free-testing deep link does not expose a paid offer. */
export function PricingPage(): ReactElement {
  return <main className="vf-site-page vf-site-pricing"><section className="vf-site-introduction"><h1><span className="vf-site-desktop-copy">Start creating.<br /></span>Free during testing.</h1><p><span className="vf-site-desktop-copy">Try Vidra with a limited testing allowance.</span><span className="vf-site-mobile-copy">Try Vidra with a limited allowance.</span></p></section><section className="vf-site-offer"><div><p className="vf-site-price">$0</p><SiteLink to="/signup?redirect=%2Fapp" tone="primary">Create an account</SiteLink><p className="vf-site-offer-note vf-site-mobile-copy">Paid plans are not available during testing.</p></div><div>{["A bounded allowance for trying generation", "Images and clips from available models", "Saved projects, drafts and versions", "Import, edit and download saved work"].map(line => <p key={line}><img src="/design-assets/fidelity-public-check.svg" alt="" width={18} height={18} />{line}</p>)}<p className="vf-site-offer-note">Paid plans are not available during testing.</p></div></section><Faq rows={[{ question: "How does the allowance work?", answer: "Your available allowance and the action’s limits are checked before a request is accepted.", mobileAnswer: "Your account has a limited allowance. Vidra checks what is available before each request." }, { question: "What happens when I reach the limit?", answer: "Generation pauses. You can still open, edit and download saved media.", mobileAnswer: "New generation waits until allowance is available. Your saved media, editing and downloads remain available." }, { question: "Can I buy more right now?", answer: "Paid plans are not available during testing.", desktopOnly: true }, { question: "Where can I check my usage?", answer: "Open Account, then Usage.", mobileAnswer: "Open Account, then Usage to see your available allowance and recent requests." }]} /></main>;
}
