import { type ReactElement, type ReactNode } from "react";
import { LegalPageLayout } from "@/features/public-site/LegalPageLayout";
import { supportAddress } from "@/features/public-site/support";
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
function SectionHeading({ id, children }: { id: string; children: ReactNode }): ReactElement { return <h2 id={id} tabIndex={-1}>{children}</h2>; }
export function PrivacyPolicyPage(): ReactElement {
  const supportEmail = supportAddress();
  const companyName = "Vidra";
  const productName = "Vidra";
  return <LegalPageLayout title="Privacy policy" toc={TOC}>
              <section>
                <SectionHeading id="overview">Overview</SectionHeading>
                <p>
                  This Privacy Policy explains how {companyName}{" "}
                  (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;)
                  collects, uses, and shares information when you use{" "}
                  {productName} (the &ldquo;Service&rdquo;).
                  Questions? Contact us at{" "}
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
                <SectionHeading id="data">
                  Information we collect
                </SectionHeading>
                <ul>
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
                <p>
                  AI processing.
                  When you use AI features, we send inputs to the relevant AI
                  provider to process your request and return results.
                </p>
              </section>

              <section>
                <SectionHeading id="use">How we use data</SectionHeading>
                <ul>
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
                <ul>
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
                    style={{ color: "var(--foreground)" }}
                    href={`mailto:${supportEmail}`}
                  >
                    {supportEmail}
                  </a>
                  .
                </p>
              </section>
  </LegalPageLayout>;
}
