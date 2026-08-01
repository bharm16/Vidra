import React from "react";
import { Link } from "react-router-dom";
import { AUTH_COLORS } from "./auth/auth-styles";

const CARD: React.CSSProperties = {
  background: AUTH_COLORS.card,
  border: `1px solid ${AUTH_COLORS.cardBorder}`,
  borderRadius: "10px",
};

type TocItem = { id: string; label: string };

const TOC: TocItem[] = [
  { id: "overview", label: "Overview" },
  { id: "data", label: "Information we collect" },
  { id: "use", label: "How we use data" },
  { id: "sharing", label: "Sharing" },
  { id: "retention", label: "Retention" },
  { id: "choices", label: "Your choices & rights" },
  { id: "security", label: "Security" },
  { id: "transfers", label: "International transfers" },
  { id: "changes", label: "Changes" },
  { id: "contact", label: "Contact" },
];

function SectionHeading({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <h2 id={id} className="scroll-mt-16 mb-3 text-ui font-semibold text-white">
      {children}
    </h2>
  );
}

export function PrivacyPolicyPage(): React.ReactElement {
  const updatedAt = "January 13, 2026";
  const supportEmail =
    (
      import.meta as { env?: { VITE_SUPPORT_EMAIL?: string } }
    ).env?.VITE_SUPPORT_EMAIL?.trim() || "support@vidra.app";
  const companyName = "Vidra";
  const productName = "Vidra";

  return (
    <div
      className="h-full overflow-y-auto"
      style={{ background: AUTH_COLORS.bg }}
    >
      {/* Sticky header */}
      <div
        className="sticky top-0 z-10 px-4 py-3 sm:px-6"
        style={{
          background: AUTH_COLORS.bg,
          borderBottom: `1px solid ${AUTH_COLORS.divider}`,
        }}
      >
        <div className="mx-auto max-w-4xl flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p
              className="text-meta font-semibold tracking-[0.2em]"
              style={{ color: AUTH_COLORS.textLabel }}
            >
              LEGAL
            </p>
            <h1 className="text-ui font-semibold text-white tracking-tight">
              Privacy Policy
            </h1>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-meta" style={{ color: AUTH_COLORS.textDim }}>
              Updated {updatedAt}
            </span>
            <Link
              to="/"
              className="text-meta font-medium hover:text-white transition-colors"
              style={{ color: AUTH_COLORS.textDim }}
            >
              Back to app
            </Link>
          </div>
        </div>
      </div>

      {/* Content with sidebar TOC */}
      <div className="mx-auto max-w-4xl px-4 sm:px-6 pb-16">
        <div className="mt-5 grid gap-5 lg:grid-cols-[200px_1fr]">
          {/* TOC sidebar */}
          <aside className="lg:sticky lg:top-14 lg:self-start">
            <nav aria-label="On this page" className="text-meta">
              <p
                className="text-meta font-semibold tracking-[0.18em] mb-2"
                style={{ color: AUTH_COLORS.textLabel }}
              >
                ON THIS PAGE
              </p>
              <ul className="space-y-1.5">
                {TOC.map((item) => (
                  <li key={item.id}>
                    <a
                      className="hover:text-white transition-colors"
                      style={{ color: AUTH_COLORS.textDim }}
                      href={`#${item.id}`}
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>

          {/* Main content */}
          <div className="p-4" style={CARD}>
            <div
              className="space-y-8 text-meta leading-relaxed"
              style={{ color: AUTH_COLORS.textSecondary }}
            >
              <section>
                <SectionHeading id="overview">Overview</SectionHeading>
                <p>
                  This Privacy Policy explains how {companyName}{" "}
                  (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;)
                  collects, uses, and shares information when you use{" "}
                  {productName} (the &ldquo;Service&rdquo;).
                </p>
                <p className="mt-2">
                  Questions? Contact us at{" "}
                  <a
                    className="font-medium hover:underline"
                    style={{ color: AUTH_COLORS.accent }}
                    href={`mailto:${supportEmail}`}
                  >
                    {supportEmail}
                  </a>
                  .
                </p>
              </section>

              <section>
                <SectionHeading id="data">
                  Information we collect
                </SectionHeading>
                <ul className="list-disc pl-5 space-y-1.5">
                  <li>
                    <span className="font-semibold text-white">
                      Account information
                    </span>
                    : email, display name, auth identifiers.
                  </li>
                  <li>
                    <span className="font-semibold text-white">
                      Content you submit
                    </span>
                    : prompts, outputs, saved assets. Shared content may be
                    accessible via link.
                  </li>
                  <li>
                    <span className="font-semibold text-white">
                      Usage and device info
                    </span>
                    : interactions, pages viewed, diagnostic logs, performance
                    metrics.
                  </li>
                  <li>
                    <span className="font-semibold text-white">
                      Billing information
                    </span>
                    : processed by Stripe. We receive limited metadata; never
                    full card numbers.
                  </li>
                  <li>
                    <span className="font-semibold text-white">
                      Support communications
                    </span>
                    : email, message content, attachments.
                  </li>
                </ul>
                <p className="mt-3">
                  <span className="font-semibold text-white">
                    AI processing.
                  </span>{" "}
                  When you use AI features, we send inputs to the relevant AI
                  provider to process your request and return results.
                </p>
              </section>

              <section>
                <SectionHeading id="use">How we use data</SectionHeading>
                <ul className="list-disc pl-5 space-y-1.5">
                  <li>Provide, maintain, and improve the Service.</li>
                  <li>Authenticate you and secure accounts.</li>
                  <li>Process payments and prevent fraud.</li>
                  <li>Debug issues and measure performance.</li>
                  <li>Communicate about updates and support requests.</li>
                </ul>
              </section>

              <section>
                <SectionHeading id="sharing">Sharing</SectionHeading>
                <p>
                  We share information with service providers (hosting,
                  analytics, error monitoring, payment processing) and AI
                  providers you use through the Service. We may share to comply
                  with law, protect rights/safety, or in connection with a
                  business transfer. We do not sell personal information.
                </p>
              </section>

              <section>
                <SectionHeading id="retention">Retention</SectionHeading>
                <p>
                  We retain information as needed to provide the Service and for
                  legitimate business purposes. You can request deletion,
                  subject to legal and operational requirements.
                </p>
              </section>

              <section>
                <SectionHeading id="choices">
                  Your choices &amp; rights
                </SectionHeading>
                <ul className="list-disc pl-5 space-y-1.5">
                  <li>Access and update account information in the Service.</li>
                  <li>Request deletion of your account and saved content.</li>
                  <li>Opt out of non-essential communications.</li>
                  <li>
                    EEA/UK residents may have additional rights (access,
                    correction, portability, objection, restriction).
                  </li>
                </ul>
              </section>

              <section>
                <SectionHeading id="security">Security</SectionHeading>
                <p>
                  We use administrative, technical, and physical safeguards. No
                  method is 100% secure, so we cannot guarantee absolute
                  security.
                </p>
              </section>

              <section>
                <SectionHeading id="transfers">
                  International transfers
                </SectionHeading>
                <p>
                  We and our service providers may process information in other
                  countries. We take steps to protect it as required by
                  applicable law.
                </p>
              </section>

              <section>
                <SectionHeading id="changes">Changes</SectionHeading>
                <p>
                  We may update this policy. Material changes will be
                  communicated as required by law.
                </p>
              </section>

              <section>
                <SectionHeading id="contact">Contact</SectionHeading>
                <p>
                  Questions? Email{" "}
                  <a
                    className="font-medium hover:underline"
                    style={{ color: AUTH_COLORS.accent }}
                    href={`mailto:${supportEmail}`}
                  >
                    {supportEmail}
                  </a>
                  .
                </p>
              </section>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer
          className="mt-8 py-6 text-meta"
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
                to="/terms-of-service"
                className="hover:text-white"
                style={{ color: AUTH_COLORS.textDim }}
              >
                Terms
              </Link>
              <Link
                to="/contact"
                className="hover:text-white"
                style={{ color: AUTH_COLORS.textDim }}
              >
                Support
              </Link>
              <Link
                to="/pricing"
                className="hover:text-white"
                style={{ color: AUTH_COLORS.textDim }}
              >
                Pricing
              </Link>
            </nav>
          </div>
        </footer>
      </div>
    </div>
  );
}
