import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@promptstudio/system/components/ui/button";
import { Input } from "@promptstudio/system/components/ui/input";
import { Textarea } from "@promptstudio/system/components/ui/textarea";
import "./contact-support.css";

const DEFAULT_SUPPORT_EMAIL = "support@vidra.app";

function buildMailto(params: {
  to: string;
  subject: string;
  body: string;
}): string {
  const query = new URLSearchParams();
  query.set("subject", params.subject);
  query.set("body", params.body);
  return `mailto:${params.to}?${query.toString()}`;
}

const TOPIC_OPTIONS = [
  { value: "support", label: "Support request" },
  { value: "feedback", label: "Product feedback" },
  { value: "security", label: "Security report" },
] as const;

type SupportTopic = (typeof TOPIC_OPTIONS)[number]["value"];

export function ContactSupportPage(): React.ReactElement {
  const configuredEmail: unknown = import.meta.env.VITE_SUPPORT_EMAIL;
  const supportEmail =
    (typeof configuredEmail === "string" ? configuredEmail.trim() : "") ||
    DEFAULT_SUPPORT_EMAIL;

  const [topic, setTopic] = React.useState<SupportTopic>("support");
  const [fromEmail, setFromEmail] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [copied, setCopied] = React.useState(false);
  const emailId = React.useId();
  const messageId = React.useId();

  React.useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 1400);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(supportEmail);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const mailto = buildMailto({
    to: supportEmail,
    subject:
      topic === "security"
        ? "Security report"
        : topic === "feedback"
          ? "Product feedback"
          : "Support request",
    body: [
      `From: ${fromEmail.trim() || "[your email]"}`,
      `Topic: ${topic}`,
      "",
      message || "[describe what you need help with]",
      "",
      "—",
      "If relevant, include:",
      "- What you expected",
      "- What happened",
      "- Steps to reproduce",
      "- Screenshots/screen recording",
    ].join("\n"),
  });

  return (
    <div className="ps-support-page flex min-h-[calc(100dvh-var(--global-top-nav-height))] flex-col overflow-y-auto bg-chrome px-6 text-foreground">
      <main className="mx-auto flex w-full max-w-[960px] flex-1 flex-col pb-20 pt-[calc(var(--vidra-space-40)+var(--vidra-space-32))]">
        <header className="mb-10 flex flex-col gap-3">
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-0">
            <h1 className="min-w-0 flex-1 text-display-lg font-medium">
              Contact support
            </h1>
            <Link
              to="/"
              className="shrink-0 text-ui font-normal text-foreground hover:text-foreground sm:w-[200px] sm:text-right"
            >
              Back to app
            </Link>
          </div>
          <p className="text-body text-foreground">
            Tell us what you need help with.
          </p>
        </header>
        <div className="grid gap-12 lg:min-h-[520px] lg:grid-cols-[600px_280px] lg:items-start lg:gap-20">
          <form
            aria-label="Contact support form"
            action={mailto}
            onSubmit={(event) => {
              event.preventDefault();
              window.location.href = mailto;
            }}
            className="flex min-w-0 flex-col gap-6"
          >
            <fieldset className="min-w-0">
              <legend className="mb-3 text-ui font-normal">Topic</legend>
              <div className="grid grid-cols-3 gap-2">
                {TOPIC_OPTIONS.map((option) => (
                  <Button
                    key={option.value}
                    type="button"
                    variant="ghost"
                    size="lg"
                    onClick={() => setTopic(option.value)}
                    aria-pressed={topic === option.value}
                    className={
                      "ps-support-topic w-full whitespace-normal rounded-md border-[0.5px] px-3 text-ui font-normal " +
                      (topic === option.value
                        ? "border-border-strong bg-input"
                        : "border-border bg-chrome hover:bg-hover")
                    }
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </fieldset>
            <div>
              <label
                htmlFor={emailId}
                className="mb-2 block text-ui font-normal"
              >
                Your email (optional)
              </label>
              <Input
                id={emailId}
                className="ps-support-email h-12 rounded-md border-border bg-fill px-3 text-ui font-normal"
                value={fromEmail}
                onChange={(event) => setFromEmail(event.target.value)}
                placeholder="you@company.com"
                inputMode="email"
                type="email"
                autoComplete="email"
              />
            </div>
            <div>
              <label
                htmlFor={messageId}
                className="mb-2 block text-ui font-normal"
              >
                Message
              </label>
              <Textarea
                id={messageId}
                className="ps-support-message h-[200px] min-h-[200px] resize-y rounded-card border-[0.5px] border-border bg-fill p-4 text-body font-normal placeholder:text-body placeholder:font-normal placeholder:text-foreground"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="What can we help with?"
              />
            </div>
            <div className="flex min-h-12 flex-col items-start gap-4 sm:flex-row sm:items-center">
              <p className="flex-1 text-ui font-normal text-foreground">
                Opens your email app.
              </p>
              <Button
                type="submit"
                size="lg"
                className="ps-support-compose w-52 shrink-0 font-normal"
              >
                Compose email
              </Button>
            </div>
          </form>
          <aside
            aria-label="Support information"
            className="flex min-w-0 flex-col gap-8"
          >
            <section className="flex flex-col gap-3">
              <h2 className="text-ui font-normal">Email</h2>
              <p className="break-words text-body">{supportEmail}</p>
              <Button
                type="button"
                variant="secondary"
                className="w-28"
                onClick={() => void handleCopy()}
              >
                {copied ? "Copied" : "Copy email"}
              </Button>
            </section>
            <section className="flex flex-col gap-3 text-ui font-normal">
              <h2>What to include</h2>
              <div className="text-foreground">
                <p>Your goal and expected result</p>
                <p>What happened instead</p>
                <p>Steps to reproduce</p>
                <p>Screenshots or a recording</p>
                <p>Your browser and OS</p>
              </div>
            </section>
            <section className="flex flex-col gap-2 text-ui font-normal">
              <h2>Response time</h2>
              <p className="text-foreground">
                We aim to respond within 24 hours on business days.
              </p>
            </section>
            <Link to="/docs" className="text-body hover:underline">
              Browse the docs
            </Link>
          </aside>
        </div>
        <footer className="ps-support-footer mt-10 flex min-h-12 shrink-0 flex-wrap items-start gap-6 border-t border-border pt-6 text-ui font-normal text-foreground lg:mt-auto">
          <Link to="/privacy-policy" className="hover:text-foreground">
            Privacy policy
          </Link>
          <Link to="/terms-of-service" className="hover:text-foreground">
            Terms of service
          </Link>
        </footer>
      </main>
    </div>
  );
}
