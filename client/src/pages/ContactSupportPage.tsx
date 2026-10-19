import { useEffect, useId, useState, type ReactElement } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { FreshButton } from "@/components/fresh/FreshButton";
import { Input } from "@promptstudio/system/components/ui/input";
import { Textarea } from "@promptstudio/system/components/ui/textarea";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@promptstudio/system/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@promptstudio/system/components/ui/dropdown-menu";
import { SiteLink, SiteShell } from "@/features/public-site/SiteShell";
import { SUPPORT_TOPICS, openSupportDraft, supportAddress, supportDraft, supportDraftSchema, supportTopic, type SupportTopic } from "@/features/public-site/support";
import "./contact-support.css";

type Handoff = "idle" | "prepared" | "unavailable" | "copied" | "manual";
const DATA_MESSAGES = {
  data: "I would like to request a copy of my account data. Please contact me about the next steps.",
  deletion: "I would like to request deletion of my account. Please explain the verification and next steps before any deletion takes place.",
};
function initialMessage(topic: SupportTopic): string { return topic === "data" || topic === "deletion" ? DATA_MESSAGES[topic] : ""; }

export function ContactSupportPage(): ReactElement {
  const [params] = useSearchParams();
  const requestedTopic = params.get("topic");
  const [topic, setTopic] = useState(() => supportTopic(requestedTopic));
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState(() => initialMessage(supportTopic(requestedTopic)));
  const [messageEdited, setMessageEdited] = useState(false);
  const [errors, setErrors] = useState<{ email?: string | undefined; message?: string | undefined }>({});
  const [handoff, setHandoff] = useState<Handoff>("idle");
  const [copy, setCopy] = useState<"idle" | "address" | "failed">("idle");
  const [topicOpen, setTopicOpen] = useState(false);
  const [desktopTopicsOpen, setDesktopTopicsOpen] = useState(false);
  const [mobileLayout, setMobileLayout] = useState(() => window.matchMedia("(max-width: 767px)").matches);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const update = (): void => setMobileLayout(query.matches);
    update(); query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => { const next = supportTopic(requestedTopic); setTopic(next); setMessage(initialMessage(next)); setMessageEdited(false); setHandoff("idle"); setErrors({}); }, [requestedTopic]);
  const id = useId();
  const draft = supportDraft(topic, email, message);
  const address = supportAddress();
  const ready = Boolean(message.trim()) && topic !== "data" && topic !== "deletion";
  const title = topic === "security" ? "Report a security issue" : topic === "feedback" ? "Product feedback" : topic === "data" ? "Request help with your account data" : topic === "deletion" ? "Account deletion request" : "How can we help?";
  const mobileTitle = topic === "feedback" ? "Share feedback" : topic === "data" ? "Request your account data" : topic === "deletion" ? "Request account deletion" : ready && topic === "support" ? "Contact support" : title;
  const chooseTopic = (value: SupportTopic): void => { setTopic(value); setMessageEdited(true); setTopicOpen(false); setDesktopTopicsOpen(false); setHandoff("idle"); setErrors({}); };
  const changeEmail = (value: string): void => {
    setEmail(value); setErrors(current => {
      if (!current.email) return current;
      const parsed = supportDraftSchema.shape.email.safeParse(value);
      return { ...current, email: parsed.success ? undefined : parsed.error.issues[0]?.message };
    });
  };
  const changeMessage = (value: string): void => {
    setMessage(value); setMessageEdited(true); setErrors(current => {
      if (!current.message) return current;
      const parsed = supportDraftSchema.shape.message.safeParse(value);
      return { ...current, message: parsed.success ? undefined : parsed.error.issues[0]?.message };
    });
  };
  const copyAddress = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(address);
      setCopy("address");
      if (handoff !== "idle") setHandoff("copied");
    } catch {
      setCopy("failed");
      if (handoff !== "idle") setHandoff("manual");
    }
  };
  const topicLabel = SUPPORT_TOPICS.find(option => option.value === topic)?.accessible ?? "Support request";
  return <SiteShell footer={false}><main className="vf-support" data-ready={ready || undefined} data-topic={topic} data-topics-open={desktopTopicsOpen || undefined}>
    <h1><span className="vf-support-desktop">{title}</span><span className="vf-support-mobile">{mobileTitle}</span></h1>
    <div className="vf-support-columns"><form aria-label="Contact support form" action={draft.url} noValidate onSubmit={event => {
      event.preventDefault();
      const result = supportDraftSchema.safeParse({ email, message });
      if (!result.success) {
        const fields = result.error.flatten().fieldErrors;
        setErrors({ email: fields.email?.[0], message: fields.message?.[0] });
        document.getElementById(fields.email?.length ? id + "-email" : id + "-message")?.focus();
        return;
      }
      setErrors({}); setCopy("idle"); setHandoff("prepared");
      try { openSupportDraft(draft.url); } catch { setHandoff("unavailable"); }
    }}>
      <fieldset className="vf-support-desktop-topics"><legend>Topic</legend><div className="vf-support-topics"><DropdownMenu open={desktopTopicsOpen} onOpenChange={setDesktopTopicsOpen}><DropdownMenuTrigger asChild><FreshButton type="button" aria-label="Support request" aria-pressed={topic === "support" || topic === "data" || topic === "deletion"} tone={topic === "support" || topic === "data" || topic === "deletion" ? "secondary" : "quiet"}>Support</FreshButton></DropdownMenuTrigger><DropdownMenuContent className="vf vf-support-topic-menu" align="start" sideOffset={42}>{SUPPORT_TOPICS.slice(0, 3).map(option => <DropdownMenuItem key={option.value} onSelect={() => chooseTopic(option.value)}><span>{option.accessible}</span></DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>{SUPPORT_TOPICS.slice(1, 3).map(option => <FreshButton type="button" key={option.value} aria-label={option.accessible} aria-pressed={topic === option.value} tone={topic === option.value ? "secondary" : "quiet"} onClick={() => chooseTopic(option.value)}>{option.label}</FreshButton>)}</div></fieldset>
      <FreshButton className="vf-support-mobile-topic" type="button" onClick={() => setTopicOpen(true)} aria-haspopup="dialog">{topic === "data" || topic === "deletion" ? "Support request" : topicLabel}</FreshButton>
      <div className="vf-support-email-region"><div className="vf-support-email-group"><label htmlFor={id + "-email"}>Your email (optional)</label><Input id={id + "-email"} className="vf-support-email" type="email" inputMode="email" autoComplete="email" placeholder="Your email (optional)" maxLength={254} value={email} onChange={event => changeEmail(event.target.value)} aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? id + "-email-error" : undefined} /></div>{errors.email ? <p className="vf-support-error vf-support-email-error" role="alert" id={id + "-email-error"}><span className="vf-support-desktop"><img src="/design-assets/auth-field-alert.svg" alt="" />{errors.email}</span><span className="vf-support-mobile">{errors.email === "Enter a valid email address, or leave it blank." ? "Enter a valid email address or leave this blank." : errors.email}</span></p> : null}</div>
      <label className="vf-support-message-label" htmlFor={id + "-message"}>Message</label><Textarea id={id + "-message"} className="vf-support-message" data-untouched-template={(topic === "data" || topic === "deletion") && !messageEdited || undefined} value={message} maxLength={8000} onChange={event => changeMessage(event.target.value)} placeholder="What happened, and what were you trying to do?" aria-invalid={Boolean(errors.message)} aria-describedby={errors.message ? id + "-message-error" : undefined} />
      {errors.message ? <p className="vf-support-error" role="alert" id={id + "-message-error"}>{errors.message}</p> : null}
      <FreshButton className="vf-support-submit" tone="primary" type="submit" disabled={mobileLayout && Boolean(errors.email || errors.message)}>Continue in email</FreshButton>
      <div className="vf-support-mobile-address"><p>{address}</p><FreshButton type="button" tone="quiet" onClick={() => void copyAddress()}>{copy === "address" ? "Copied" : "Copy email address"}</FreshButton>{copy === "failed" ? <p className="vf-support-error" role="alert">Could not copy. Select the address and copy it manually.</p> : null}</div>
    </form><aside aria-label="Support information"><h2>Find an answer</h2><SiteLink to="/docs/start">Get started</SiteLink><SiteLink to="/docs/recovery">Recover interrupted work</SiteLink><SiteLink to="/docs/sharing">Share and download your work</SiteLink><p className="vf-support-label">Email</p><p className="vf-support-address">{address}</p><FreshButton onClick={() => void copyAddress()}>{copy === "address" ? "Copied" : "Copy email address"}</FreshButton><div aria-live="polite">{copy === "failed" ? <p className="vf-support-error" role="alert">Could not copy. Select the address and copy it manually.</p> : null}</div></aside></div>
    <footer className="vf-support-legal"><Link to="/privacy-policy">Privacy policy</Link><Link to="/terms-of-service">Terms of service</Link></footer>
    <Dialog open={topicOpen} onOpenChange={setTopicOpen}><DialogContent hideClose overlayClassName="vf-support-topic-overlay" className="vf vf-support-topic-sheet"><DialogTitle>Support topic</DialogTitle><DialogDescription className="sr-only">Choose what you need help with.</DialogDescription>{SUPPORT_TOPICS.slice(0, 3).map(option => <FreshButton key={option.value} type="button" tone="quiet" onClick={() => chooseTopic(option.value)}>{option.accessible}</FreshButton>)}<DialogClose><img src="/design-assets/fidelity-public-close.svg" alt="" /><span className="sr-only">Close</span></DialogClose></DialogContent></Dialog>
    <Dialog open={handoff !== "idle"} onOpenChange={open => { if (!open) setHandoff("idle"); }}><DialogContent hideClose overlayClassName={"vf-support-overlay" + (handoff === "prepared" ? " is-prepared" : handoff === "manual" ? " is-manual" : "")} className="vf vf-support-handoff" data-state-kind={handoff}>
      <DialogTitle><span className="vf-support-desktop">{handoff === "prepared" ? "Continue in your email app" : handoff === "manual" ? "Copy the address manually" : "Email app did not open?"}</span><span className="vf-support-mobile">{handoff === "prepared" ? "Continue in email" : handoff === "copied" ? "Email address copied" : handoff === "manual" ? "Copy the address manually" : "No email app opened"}</span></DialogTitle>
      <DialogDescription>{handoff === "prepared" ? <><span className="vf-support-desktop">Review the draft in your email app and send it from there. Vidra has not sent a support message.</span><span className="vf-support-mobile">Review and send the draft in your email app. Vidra has not sent a support message.</span></> : handoff === "manual" ? "Clipboard access was blocked. Select the address below and copy it." : handoff === "copied" ? <><span className="vf-support-desktop">Copy the address and your message, then paste them into an email app or webmail.</span><span className="vf-support-mobile">Paste {address} into your email app.</span></> : <><span className="vf-support-desktop">Copy the address and your message, then paste them into an email app or webmail.</span><span className="vf-support-mobile">Copy {address} into an email app and paste your message.</span></>}</DialogDescription>
      {handoff === "prepared" ? <p className="vf-support-handoff-address">{address}</p> : handoff === "copied" ? <p className="vf-support-handoff-address vf-support-desktop">{address}</p> : <Input readOnly className="vf-support-handoff-address" aria-label="Support email address" value={address} onFocus={event => event.target.select()} />}
      {handoff === "prepared" || handoff === "manual" ? <FreshButton tone="primary" onClick={() => setHandoff("idle")}>Back to support</FreshButton> : handoff === "copied" ? <><FreshButton className="vf-support-desktop" tone="primary" onClick={() => void copyAddress()}>Copied</FreshButton><FreshButton className="vf-support-mobile" tone="primary" onClick={() => setHandoff("idle")}>Back to support</FreshButton></> : <FreshButton tone="primary" onClick={() => void copyAddress()}>Copy email address</FreshButton>}
      {handoff === "prepared" ? <FreshButton tone="quiet" onClick={() => setHandoff("unavailable")}>My email app did not open</FreshButton> : handoff !== "manual" ? <FreshButton className={handoff === "copied" ? "vf-support-desktop" : ""} tone="quiet" onClick={() => setHandoff("idle")}>Back to support</FreshButton> : null}
      <DialogClose><img src="/design-assets/fidelity-public-close.svg" alt="" /><span className="sr-only">Close</span></DialogClose>
    </DialogContent></Dialog>
  </main></SiteShell>;
}
