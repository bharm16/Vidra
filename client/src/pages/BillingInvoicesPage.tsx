import React from "react";
import { Link, useLocation } from "react-router-dom";
import {
  CreditCard,
  ExternalLink,
  FileText,
  RefreshCw,
  ShieldAlert,
} from "@promptstudio/system/components/ui";
import {
  createBillingPortalSession,
  fetchInvoices,
  type InvoiceSummary,
} from "@/features/billing/api/billingApi";
import { logger } from "@/services/LoggingService";
import { sanitizeError } from "@/utils/logging";
import { cn } from "@/utils/cn";
import { useToast } from "@components/Toast";
import { Button } from "@promptstudio/system/components/ui/button";
import { useAuthUser } from "@hooks/useAuthUser";
import { AuthShell } from "./auth/AuthShell";
import {
  AUTH_COLORS,
  authAlpha,
  AUTH_CTA_CLASS,
  AUTH_CTA_STYLE,
  AUTH_CARD_STYLE,
  AUTH_ERROR_STYLE,
} from "./auth/auth-styles";

function formatStripeAmount(
  amountMinor: number | null,
  currency: string | null,
): string {
  if (!currency || typeof currency !== "string") return "—";
  if (typeof amountMinor !== "number" || !Number.isFinite(amountMinor))
    return "—";

  const normalizedCurrency = currency.trim().toUpperCase();
  if (!normalizedCurrency) return "—";

  const formatter = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: normalizedCurrency,
  });
  const fractionDigits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
  const factor = 10 ** fractionDigits;
  return formatter.format(amountMinor / factor);
}

function formatInvoiceDate(epochSeconds: number | null): string {
  if (typeof epochSeconds !== "number" || !Number.isFinite(epochSeconds))
    return "—";
  return new Date(epochSeconds * 1000).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function resolveInvoiceLabel(status: string | null): {
  label: string;
  tone: "good" | "warn" | "neutral";
} {
  switch ((status ?? "").toLowerCase()) {
    case "paid":
      return { label: "Paid", tone: "good" };
    case "open":
    case "uncollectible":
      return {
        label: status === "open" ? "Payment due" : "Payment issue",
        tone: "warn",
      };
    case "void":
      return { label: "Voided", tone: "neutral" };
    case "draft":
      return { label: "Draft", tone: "neutral" };
    default:
      return { label: status ? status : "Unknown", tone: "neutral" };
  }
}

/** Inline style for secondary action buttons */
const BTN_SECONDARY: React.CSSProperties = {
  background: AUTH_COLORS.card,
  border: `1px solid ${AUTH_COLORS.cardBorder}`,
};

/** Inline style for muted buttons */
const BTN_MUTED: React.CSSProperties = {
  background: AUTH_COLORS.inputBg,
  border: `1px solid ${AUTH_COLORS.inputBorder}`,
  color: AUTH_COLORS.textSecondary,
};

export function BillingInvoicesPage(): React.ReactElement {
  const toast = useToast();
  const location = useLocation();
  const log = React.useMemo(() => logger.child("BillingInvoicesPage"), []);

  const [invoices, setInvoices] = React.useState<InvoiceSummary[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isBusy, setIsBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const user = useAuthUser();

  const signInLink = React.useMemo(() => {
    const redirect = encodeURIComponent(
      `${location.pathname}${location.search}`,
    );
    return `/signin?redirect=${redirect}`;
  }, [location.pathname, location.search]);

  const loadInvoices = React.useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetchInvoices();
      setInvoices(response);
    } catch (err) {
      const info = sanitizeError(err);
      log.error(
        "Failed to load invoices",
        err instanceof Error ? err : new Error(info.message),
        { operation: "loadInvoices" },
      );
      setError("Failed to load invoices. Billing may not be configured yet.");
    } finally {
      setIsLoading(false);
    }
  }, [log, user]);

  React.useEffect(() => {
    if (!user) return;
    void loadInvoices();
  }, [loadInvoices, user]);

  const handleOpenPortal = async (): Promise<void> => {
    if (!user) {
      toast.error("Sign in to manage billing.");
      return;
    }
    setIsBusy(true);
    try {
      const { url } = await createBillingPortalSession();
      if (!url) throw new Error("Missing billing portal URL");
      window.location.href = url;
    } catch (err) {
      const info = sanitizeError(err);
      log.error(
        "Failed to create billing portal session",
        err instanceof Error ? err : new Error(info.message),
        {
          operation: "billingPortal",
        },
      );
      toast.error(
        "Billing portal unavailable. Subscribe first or contact support.",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const hasPaymentIssue = invoices.some((invoice) =>
    ["open", "uncollectible"].includes((invoice.status ?? "").toLowerCase()),
  );

  return (
    <AuthShell
      variant="page"
      title="Invoices"
      footer={
        <>
          Need help?{" "}
          <Link to="/contact" className="text-white hover:underline">
            Contact support
          </Link>
          .
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {!user ? (
          <div className="p-4" style={AUTH_CARD_STYLE}>
            <p className="text-ui font-semibold text-white">
              Sign in to view receipts
            </p>
            <p
              className="mt-1 text-ui leading-snug"
              style={{ color: AUTH_COLORS.textSecondary }}
            >
              Invoices are tied to your account so you can grab receipts
              anytime.
            </p>
            <Button
              asChild
              variant="ghost"
              className={`mt-4 ${AUTH_CTA_CLASS}`}
              style={AUTH_CTA_STYLE}
            >
              <Link to={signInLink}>Sign in</Link>
            </Button>
          </div>
        ) : null}

        {user && hasPaymentIssue ? (
          <div
            className="px-3.5 py-2.5"
            style={{
              background: "#f5c05c15",
              border: "1px solid #f5c05c30",
              borderRadius: "8px",
            }}
          >
            <div className="flex items-start gap-2.5">
              <ShieldAlert
                className="mt-0.5 h-4 w-4 shrink-0"
                style={{ color: "#f5c05c" }}
                aria-hidden="true"
              />
              <div className="min-w-0">
                <p
                  className="text-ui font-semibold"
                  style={{ color: "#f5c05c" }}
                >
                  Payment issue detected
                </p>
                <p
                  className="mt-1 text-ui leading-snug"
                  style={{ color: "#f5c05c", opacity: 0.7 }}
                >
                  One of your invoices needs attention. Open the billing portal
                  to update your payment method or retry.
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {user && error ? (
          <div
            role="alert"
            className="px-3.5 py-2.5 text-ui"
            style={AUTH_ERROR_STYLE}
          >
            <span style={{ color: AUTH_COLORS.danger }}>{error}</span>
          </div>
        ) : null}

        {user ? (
          <div className="grid gap-2.5 sm:grid-cols-2">
            <Button
              type="button"
              onClick={handleOpenPortal}
              disabled={isBusy}
              variant="ghost"
              className="h-9 gap-2 rounded-lg text-ui font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60"
              style={BTN_SECONDARY}
            >
              <CreditCard className="h-3.5 w-3.5" aria-hidden="true" />
              Manage billing
            </Button>

            <Button
              type="button"
              onClick={() => void loadInvoices()}
              disabled={isLoading || isBusy}
              variant="ghost"
              className="h-9 gap-2 rounded-lg text-ui font-semibold transition disabled:cursor-not-allowed disabled:opacity-60"
              style={BTN_MUTED}
            >
              <RefreshCw
                className={cn("h-3.5 w-3.5", isLoading ? "animate-spin" : null)}
                aria-hidden="true"
              />
              Refresh
            </Button>
          </div>
        ) : null}

        {user ? (
          <div className="p-4" style={AUTH_CARD_STYLE}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-ui font-semibold text-white">
                  Payment history
                </p>
                <p
                  className="mt-1 text-ui leading-snug"
                  style={{ color: AUTH_COLORS.textSecondary }}
                >
                  Download PDFs or open hosted invoices for receipts.
                </p>
              </div>
              <p
                className="text-meta font-semibold tracking-[0.22em]"
                style={{ color: AUTH_COLORS.textLabel }}
              >
                {isLoading ? "LOADING" : `${invoices.length} INVOICES`}
              </p>
            </div>

            {isLoading ? (
              <p
                className="mt-4 text-ui"
                style={{ color: AUTH_COLORS.textSecondary }}
              >
                Loading…
              </p>
            ) : invoices.length === 0 ? (
              <p
                className="mt-4 text-ui"
                style={{ color: AUTH_COLORS.textSecondary }}
              >
                No invoices yet.
              </p>
            ) : (
              <div className="mt-4 grid gap-2.5">
                {invoices.map((invoice) => {
                  const status = resolveInvoiceLabel(invoice.status);
                  const pdfUrl = invoice.invoicePdf;
                  const hostedUrl = invoice.hostedInvoiceUrl;
                  const primaryLink = pdfUrl || hostedUrl;
                  const primaryLabel = pdfUrl ? "Download PDF" : "Open invoice";
                  return (
                    <div
                      key={invoice.id}
                      className="rounded-md p-3.5"
                      style={{
                        background: AUTH_COLORS.inputBg,
                        border: `1px solid ${AUTH_COLORS.inputBorder}`,
                      }}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-ui font-semibold text-white">
                            {invoice.number
                              ? `Invoice ${invoice.number}`
                              : "Invoice"}
                          </p>
                          <p
                            className="mt-1 text-ui"
                            style={{ color: AUTH_COLORS.textSecondary }}
                          >
                            {formatInvoiceDate(invoice.created)} •{" "}
                            <span className="font-medium text-white">
                              {formatStripeAmount(
                                invoice.amountPaid ?? invoice.amountDue,
                                invoice.currency,
                              )}
                            </span>
                          </p>
                        </div>

                        <span
                          className="inline-flex items-center rounded-full border px-2.5 py-1 text-meta font-semibold tracking-wide"
                          style={
                            status.tone === "good"
                              ? {
                                  borderColor: authAlpha(
                                    AUTH_COLORS.success,
                                    19,
                                  ),
                                  background: authAlpha(AUTH_COLORS.success, 8),
                                  color: AUTH_COLORS.success,
                                }
                              : status.tone === "warn"
                                ? {
                                    borderColor: "#f5c05c30",
                                    background: "#f5c05c15",
                                    color: "#f5c05c",
                                  }
                                : {
                                    borderColor: AUTH_COLORS.cardBorder,
                                    background: AUTH_COLORS.card,
                                    color: AUTH_COLORS.textDim,
                                  }
                          }
                        >
                          {status.label}
                        </span>
                      </div>

                      {primaryLink ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            asChild
                            variant="ghost"
                            className="h-8 gap-1.5 rounded-lg px-3 text-meta font-semibold text-white transition"
                            style={BTN_SECONDARY}
                          >
                            <a
                              href={primaryLink}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {pdfUrl ? (
                                <FileText
                                  className="h-3.5 w-3.5"
                                  aria-hidden="true"
                                />
                              ) : (
                                <ExternalLink
                                  className="h-3.5 w-3.5"
                                  aria-hidden="true"
                                />
                              )}
                              {primaryLabel}
                            </a>
                          </Button>

                          {pdfUrl && hostedUrl ? (
                            <Button
                              asChild
                              variant="ghost"
                              className="h-8 gap-1.5 rounded-lg px-3 text-meta font-semibold transition"
                              style={BTN_MUTED}
                            >
                              <a
                                href={hostedUrl}
                                target="_blank"
                                rel="noreferrer"
                              >
                                <ExternalLink
                                  className="h-3.5 w-3.5"
                                  aria-hidden="true"
                                />
                                Open hosted invoice
                              </a>
                            </Button>
                          ) : null}
                        </div>
                      ) : (
                        <p
                          className="mt-3 text-ui"
                          style={{ color: AUTH_COLORS.textSecondary }}
                        >
                          Receipt links aren't available for this invoice.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </AuthShell>
  );
}
