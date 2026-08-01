import React from "react";
import { Link } from "react-router-dom";
import {
  Copy,
  Mail,
  MessageSquare,
  ShieldAlert,
} from "@promptstudio/system/components/ui";
import { Button } from "@promptstudio/system/components/ui/button";
import { Input } from "@promptstudio/system/components/ui/input";
import { Textarea } from "@promptstudio/system/components/ui/textarea";
import { AUTH_COLORS } from "./auth/auth-styles";

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

/** Inline style for workspace cards */
const CARD: React.CSSProperties = {
  background: AUTH_COLORS.card,
  border: `1px solid ${AUTH_COLORS.cardBorder}`,
  borderRadius: "10px",
};

/** Inline style for inset panels */
const INSET: React.CSSProperties = {
  background: AUTH_COLORS.inputBg,
  border: `1px solid ${AUTH_COLORS.inputBorder}`,
  borderRadius: "8px",
};

export function ContactSupportPage(): React.ReactElement {
  const supportEmail =
    (
      import.meta as { env?: { VITE_SUPPORT_EMAIL?: string } }
    ).env?.VITE_SUPPORT_EMAIL?.trim() || DEFAULT_SUPPORT_EMAIL;

  const [topic, setTopic] = React.useState<"support" | "feedback" | "security">(
    "support",
  );
  const [fromEmail, setFromEmail] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [copied, setCopied] = React.useState(false);

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
      `From: ${fromEmail || "[your email]"}`,
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
    <div
      className="h-full overflow-y-auto"
      style={{ background: AUTH_COLORS.bg }}
    >
      <div className="mx-auto max-w-2xl px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 mb-6">
          <div>
            <p
              className="text-meta font-semibold tracking-[0.2em]"
              style={{ color: AUTH_COLORS.textLabel }}
            >
              SUPPORT
            </p>
            <h1 className="mt-1 text-body-lg font-semibold text-white tracking-tight">
              Get help
            </h1>
          </div>
          <Link
            to="/"
            className="text-meta font-medium hover:text-white transition-colors"
            style={{ color: AUTH_COLORS.textDim }}
          >
            Back to app
          </Link>
        </div>

        {/* Quick links row */}
        <div className="grid grid-cols-3 gap-2.5 mb-6">
          <div className="p-3.5" style={CARD}>
            <MessageSquare
              className="h-4 w-4 mb-2"
              style={{ color: AUTH_COLORS.textDim }}
              aria-hidden="true"
            />
            <p className="text-ui font-semibold text-white">Support</p>
            <p
              className="mt-1 text-meta leading-snug"
              style={{ color: AUTH_COLORS.textSecondary }}
            >
              Bugs, billing, account help.
            </p>
          </div>

          <div className="p-3.5" style={CARD}>
            <Mail
              className="h-4 w-4 mb-2"
              style={{ color: AUTH_COLORS.textDim }}
              aria-hidden="true"
            />
            <p className="text-ui font-semibold text-white">Email</p>
            <p
              className="mt-1 text-meta font-mono leading-snug"
              style={{ color: AUTH_COLORS.textSecondary }}
            >
              {supportEmail}
            </p>
            <Button
              type="button"
              onClick={handleCopy}
              variant="ghost"
              className="mt-2 h-7 gap-1.5 rounded-lg px-2.5 text-meta font-semibold text-white transition"
              style={{
                background: AUTH_COLORS.inputBg,
                border: `1px solid ${AUTH_COLORS.inputBorder}`,
              }}
            >
              <Copy
                className="h-3 w-3"
                style={{ color: AUTH_COLORS.textDim }}
                aria-hidden="true"
              />
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>

          <div className="p-3.5" style={CARD}>
            <ShieldAlert
              className="h-4 w-4 mb-2"
              style={{ color: AUTH_COLORS.textDim }}
              aria-hidden="true"
            />
            <p className="text-ui font-semibold text-white">Security</p>
            <p
              className="mt-1 text-meta leading-snug"
              style={{ color: AUTH_COLORS.textSecondary }}
            >
              Vulnerability? Choose "Security report".
            </p>
            <Link
              to="/privacy-policy"
              className="mt-2 inline-block text-meta font-semibold hover:text-white transition-colors"
              style={{ color: AUTH_COLORS.accent }}
            >
              Privacy policy
            </Link>
          </div>
        </div>

        {/* Form */}
        <div className="grid gap-4 lg:grid-cols-[1fr_240px]">
          <div className="p-4" style={CARD}>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                window.location.href = mailto;
              }}
            >
              <div className="flex items-center justify-between gap-3 mb-4">
                <h2 className="text-ui font-semibold text-white">
                  Send a message
                </h2>
                <span
                  className="text-meta font-semibold tracking-[0.2em]"
                  style={{ color: AUTH_COLORS.textLabel }}
                >
                  FAST ROUTING
                </span>
              </div>

              <div className="flex flex-col gap-3.5">
                <div>
                  <label
                    className="text-meta font-semibold tracking-[0.18em]"
                    style={{ color: AUTH_COLORS.textLabel }}
                  >
                    TOPIC
                  </label>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {(
                      [
                        { value: "support", label: "Support request" },
                        { value: "feedback", label: "Product feedback" },
                        { value: "security", label: "Security report" },
                      ] as const
                    ).map((option) => {
                      const isActive = option.value === topic;
                      return (
                        <Button
                          key={option.value}
                          type="button"
                          onClick={() => setTopic(option.value)}
                          variant="ghost"
                          className="h-8 rounded-lg px-3 text-meta font-medium transition"
                          style={
                            isActive
                              ? {
                                  background: AUTH_COLORS.accent,
                                  color: AUTH_COLORS.bg,
                                }
                              : {
                                  background: AUTH_COLORS.inputBg,
                                  border: `1px solid ${AUTH_COLORS.inputBorder}`,
                                  color: AUTH_COLORS.textSecondary,
                                }
                          }
                        >
                          {option.label}
                        </Button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label
                    className="text-meta font-semibold tracking-[0.18em]"
                    style={{ color: AUTH_COLORS.textLabel }}
                  >
                    YOUR EMAIL{" "}
                    <span style={{ color: AUTH_COLORS.textPlaceholder }}>
                      (OPTIONAL)
                    </span>
                  </label>
                  <Input
                    className="mt-1.5 w-full rounded-lg px-3.5 py-2 text-ui text-white outline-none transition"
                    style={{
                      background: AUTH_COLORS.inputBg,
                      border: `1px solid ${AUTH_COLORS.inputBorder}`,
                      color: AUTH_COLORS.text,
                    }}
                    value={fromEmail}
                    onChange={(e) => setFromEmail(e.target.value)}
                    placeholder="you@company.com"
                    inputMode="email"
                    type="email"
                  />
                </div>

                <div>
                  <label
                    className="text-meta font-semibold tracking-[0.18em]"
                    style={{ color: AUTH_COLORS.textLabel }}
                  >
                    MESSAGE
                  </label>
                  <Textarea
                    className="mt-1.5 w-full min-h-[120px] rounded-lg px-3.5 py-2.5 text-ui text-white outline-none transition resize-y"
                    style={{
                      background: AUTH_COLORS.inputBg,
                      border: `1px solid ${AUTH_COLORS.inputBorder}`,
                      color: AUTH_COLORS.text,
                    }}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="What can we help with?"
                  />
                </div>

                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p
                    className="text-meta"
                    style={{ color: AUTH_COLORS.textDim }}
                  >
                    Prefer self-serve? Start with{" "}
                    <Link
                      to="/docs"
                      className="font-medium hover:text-white"
                      style={{ color: AUTH_COLORS.accent }}
                    >
                      Docs
                    </Link>
                    .
                  </p>
                  <Button
                    type="submit"
                    variant="ghost"
                    className="h-9 rounded-lg px-4 text-ui font-semibold transition"
                    style={{
                      background: AUTH_COLORS.accent,
                      color: AUTH_COLORS.bg,
                    }}
                  >
                    Compose email
                  </Button>
                </div>
              </div>
            </form>
          </div>

          <div className="flex flex-col gap-3">
            <div className="p-3.5" style={CARD}>
              <p className="text-ui font-semibold text-white">
                What to include
              </p>
              <div
                className="mt-2 flex flex-col gap-1.5 text-meta"
                style={{ color: AUTH_COLORS.textSecondary }}
              >
                <p>Your goal and expected output</p>
                <p>What happened instead</p>
                <p>Steps to reproduce</p>
                <p>Screenshots / recording</p>
                <p>Your browser + OS</p>
              </div>
            </div>

            <div className="p-3.5" style={INSET}>
              <p
                className="text-meta font-semibold tracking-[0.18em]"
                style={{ color: AUTH_COLORS.textLabel }}
              >
                RESPONSE TIME
              </p>
              <p
                className="mt-1.5 text-meta leading-snug"
                style={{ color: AUTH_COLORS.textSecondary }}
              >
                We aim to respond within 24 hours on business days.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer
          className="mt-10 pt-6 text-meta"
          style={{
            borderTop: `1px solid ${AUTH_COLORS.cardBorder}`,
            color: AUTH_COLORS.textDim,
          }}
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Link to="/" className="font-medium text-white hover:underline">
              Go to app
            </Link>
            <nav className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <Link
                to="/pricing"
                className="hover:text-white"
                style={{ color: AUTH_COLORS.textDim }}
              >
                Pricing
              </Link>
              <Link
                to="/privacy-policy"
                className="hover:text-white"
                style={{ color: AUTH_COLORS.textDim }}
              >
                Privacy
              </Link>
              <Link
                to="/terms-of-service"
                className="hover:text-white"
                style={{ color: AUTH_COLORS.textDim }}
              >
                Terms
              </Link>
            </nav>
          </div>
        </footer>
      </div>
    </div>
  );
}
