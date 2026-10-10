import React from "react";
import { Link } from "react-router-dom";

const CARD: React.CSSProperties = {
  background: "var(--card)",
  border: `1px solid ${"var(--border)"}`,
  borderRadius: "10px",
};

type TocItem = { id: string; label: string };

const TOC: TocItem[] = [
  { id: "summary", label: "Summary" },
  { id: "who", label: "Who we are" },
  { id: "accounts", label: "Accounts" },
  { id: "acceptable-use", label: "Acceptable use" },
  { id: "billing", label: "Billing" },
  { id: "privacy", label: "Privacy" },
  { id: "ip", label: "Your content" },
  { id: "disclaimers", label: "Disclaimers" },
  { id: "liability", label: "Limitation of liability" },
  { id: "termination", label: "Termination" },
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
    <h2 id={id} className="text-ui mb-3 scroll-mt-16 font-semibold text-white">
      {children}
    </h2>
  );
}

export function TermsOfServicePage(): React.ReactElement {
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
      style={{ background: "var(--background)" }}
    >
      {/* Sticky header */}
      <div
        className="sticky top-0 z-10 px-4 py-3 sm:px-6"
        style={{
          background: "var(--background)",
          borderBottom: `1px solid ${"var(--border)"}`,
        }}
      >
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
          <div className="min-w-0">
            <p
              className="text-meta font-semibold tracking-[0.2em]"
              style={{ color: "var(--ghost-foreground)" }}
            >
              LEGAL
            </p>
            <h1 className="text-ui font-semibold tracking-tight text-white">
              Terms of Service
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span
              className="text-meta"
              style={{ color: "var(--faint-foreground)" }}
            >
              Updated {updatedAt}
            </span>
            <Link
              to="/"
              className="text-meta font-medium transition-colors hover:text-white"
              style={{ color: "var(--faint-foreground)" }}
            >
              Back to app
            </Link>
          </div>
        </div>
      </div>

      {/* Content with sidebar TOC */}
      <div className="mx-auto max-w-4xl px-4 pb-16 sm:px-6">
        <div className="mt-5 grid gap-5 lg:grid-cols-[200px_1fr]">
          {/* TOC sidebar */}
          <aside className="lg:sticky lg:top-14 lg:self-start">
            <nav aria-label="On this page" className="text-meta">
              <p
                className="text-meta mb-2 font-semibold tracking-[0.18em]"
                style={{ color: "var(--ghost-foreground)" }}
              >
                ON THIS PAGE
              </p>
              <ul className="space-y-1.5">
                {TOC.map((item) => (
                  <li key={item.id}>
                    <a
                      className="transition-colors hover:text-white"
                      style={{ color: "var(--faint-foreground)" }}
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
              className="text-meta space-y-8 leading-relaxed"
              style={{ color: "var(--muted-foreground)" }}
            >
              <section>
                <SectionHeading id="summary">Summary</SectionHeading>
                <p>
                  These Terms govern your use of {productName} (the
                  &ldquo;Service&rdquo;). By accessing or using the Service, you
                  agree to these Terms.
                </p>
              </section>

              <section>
                <SectionHeading id="who">Who we are</SectionHeading>
                <p>
                  The Service is provided by {companyName} (&ldquo;we&rdquo;,
                  &ldquo;us&rdquo;, &ldquo;our&rdquo;). Contact:{" "}
                  <a
                    className="font-medium hover:underline"
                    style={{ color: "var(--foreground)" }}
                    href={`mailto:${supportEmail}`}
                  >
                    {supportEmail}
                  </a>
                  .
                </p>
              </section>

              <section>
                <SectionHeading id="accounts">Accounts</SectionHeading>
                <ul className="list-disc space-y-1.5 pl-5">
                  <li>
                    You&apos;re responsible for activity under your account.
                  </li>
                  <li>
                    Provide accurate information and keep credentials secure.
                  </li>
                  <li>
                    We may suspend accounts that violate these Terms or
                    applicable law.
                  </li>
                </ul>
              </section>

              <section>
                <SectionHeading id="acceptable-use">
                  Acceptable use
                </SectionHeading>
                <p>
                  Don&apos;t misuse the Service. Don&apos;t reverse engineer,
                  disrupt, or overload our systems, and don&apos;t use the
                  Service to generate unlawful, harmful, or infringing content.
                </p>
              </section>

              <section>
                <SectionHeading id="billing">Billing</SectionHeading>
                <p>
                  Some features require payment. Subscriptions are charged on a
                  recurring basis until you cancel (processed by Stripe).
                </p>
                <ul className="mt-2 list-disc space-y-1.5 pl-5">
                  <li>Taxes may apply.</li>
                  <li>Manage billing via the billing portal.</li>
                  <li>Invoices and receipts available in the Service.</li>
                  <li>Refunds follow our posted policy or applicable law.</li>
                  <li>Prices may change with advance notice.</li>
                </ul>
              </section>

              <section>
                <SectionHeading id="privacy">Privacy</SectionHeading>
                <p>
                  Our{" "}
                  <Link
                    to="/privacy-policy"
                    className="font-medium hover:underline"
                    style={{ color: "var(--foreground)" }}
                  >
                    Privacy Policy
                  </Link>{" "}
                  describes how we collect and use information.
                </p>
              </section>

              <section>
                <SectionHeading id="ip">Your content</SectionHeading>
                <p>
                  You retain ownership of content you submit. You grant us a
                  limited license to host, store, and process that content to
                  operate and improve the Service.
                </p>
              </section>

              <section>
                <SectionHeading id="disclaimers">Disclaimers</SectionHeading>
                <p>
                  The Service is provided &ldquo;as is&rdquo; without
                  warranties. AI outputs may be inaccurate; verify results
                  before relying on them.
                </p>
              </section>

              <section>
                <SectionHeading id="liability">
                  Limitation of liability
                </SectionHeading>
                <p>
                  To the maximum extent permitted by law, we will not be liable
                  for indirect, incidental, special, consequential, or punitive
                  damages, or any loss of profits or revenues.
                </p>
              </section>

              <section>
                <SectionHeading id="termination">Termination</SectionHeading>
                <p>
                  You may stop using the Service at any time. We may suspend or
                  terminate access if you violate these Terms or if required by
                  law.
                </p>
              </section>

              <section>
                <SectionHeading id="changes">Changes</SectionHeading>
                <p>
                  We may update these Terms. Material changes will be
                  communicated. Continued use means you accept the updated
                  Terms.
                </p>
              </section>

              <section>
                <SectionHeading id="contact">Contact</SectionHeading>
                <p>
                  Questions? Email{" "}
                  <a
                    className="font-medium hover:underline"
                    style={{ color: "var(--foreground)" }}
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
          className="text-meta mt-8 py-6"
          style={{
            borderTop: `1px solid ${"var(--border)"}`,
            color: "var(--faint-foreground)",
          }}
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Link to="/" className="font-medium text-white hover:underline">
              Go to app
            </Link>
            <nav className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <Link
                to="/privacy-policy"
                className="hover:text-white"
                style={{ color: "var(--faint-foreground)" }}
              >
                Privacy
              </Link>
              <Link
                to="/contact"
                className="hover:text-white"
                style={{ color: "var(--faint-foreground)" }}
              >
                Support
              </Link>
            </nav>
          </div>
        </footer>
      </div>
    </div>
  );
}
