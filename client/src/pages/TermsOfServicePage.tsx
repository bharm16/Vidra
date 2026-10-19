import { type ReactElement, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { LegalPageLayout } from "@/features/public-site/LegalPageLayout";
import { supportAddress } from "@/features/public-site/support";
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
function SectionHeading({ id, children }: { id: string; children: ReactNode }): ReactElement { return <h2 id={id} tabIndex={-1}>{children}</h2>; }
export function TermsOfServicePage(): ReactElement {
  const supportEmail = supportAddress();
  const companyName = "Vidra";
  const productName = "Vidra";
  return <LegalPageLayout title="Terms of service" updated="October 10, 2026" toc={TOC}>
              <section>
                <SectionHeading id="summary">Summary</SectionHeading>
                <p>
                  These Terms govern your use of {productName} (the<br />
                  &ldquo;Service&rdquo;). By accessing or using the Service, you
                  agree to these Terms.
                </p>
              </section>

              <section>
                <SectionHeading id="who">Who we are</SectionHeading>
                <p>
                  The Service is provided by {companyName} (&ldquo;we&rdquo;,<br />
                  &ldquo;us&rdquo;, &ldquo;our&rdquo;). Contact:<br />
                  <a
                    className="font-medium hover:underline"
                    style={{ color: "var(--foreground)" }}
                    href={`mailto:${supportEmail}`}
                  >
                    {supportEmail}
                  </a>
                  <br />.
                </p>
              </section>

              <section>
                <SectionHeading id="accounts">Accounts</SectionHeading>
                <ul>
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
                  <br />Service to generate unlawful, harmful, or infringing content.
                </p>
              </section>

              <section>
                <SectionHeading id="billing">Billing</SectionHeading>
                <p>Vidra is free during testing, with a limited allowance. Paid plans and purchases are not available during testing. If paid services are introduced, their prices and terms will be shown before a purchase.</p>
              </section>

              <section>
                <SectionHeading id="privacy">Privacy</SectionHeading>
                <p>
                  Our<br />
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
                  <br />Terms.
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
                  <br />.
                </p>
              </section>
  </LegalPageLayout>;
}
