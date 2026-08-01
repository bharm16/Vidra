import React from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Check,
  CreditCard,
  FileText,
} from "@promptstudio/system/components/ui";
import {
  createBillingPortalSession,
  createCheckoutSession,
} from "@/features/billing/api/billingApi";
import { logger } from "@/services/LoggingService";
import { sanitizeError } from "@/utils/logging";
import { cn } from "@/utils/cn";
import { useToast } from "@components/Toast";
import { Button } from "@promptstudio/system/components/ui/button";
import { useAuthUser } from "@hooks/useAuthUser";
import { useUserCreditBalance } from "@hooks/useUserCreditBalance";
import {
  SUBSCRIPTION_TIERS,
  type SubscriptionTier,
} from "@/features/billing/subscriptionTiers";
import { CREDIT_PACKS } from "@/features/billing/creditPacks";
import { useBillingStatus } from "@/features/billing/hooks/useBillingStatus";
import { useCreditHistory } from "@/features/billing/hooks/useCreditHistory";
import { AuthShell } from "./auth/AuthShell";
import {
  AUTH_COLORS,
  authAlpha,
  AUTH_CTA_CLASS,
  AUTH_CTA_STYLE,
  AUTH_CARD_STYLE,
  AUTH_SUCCESS_STYLE,
} from "./auth/auth-styles";

function formatInteger(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(
    value,
  );
}

function formatSignedCredits(value: number): string {
  const sign = value >= 0 ? "+" : "-";
  return `${sign}${formatInteger(Math.abs(value))}`;
}

function formatActivityTime(createdAtMs: number): string {
  if (!Number.isFinite(createdAtMs) || createdAtMs <= 0) return "Unknown time";
  return new Date(createdAtMs).toLocaleString();
}

function toActivityLabel(type: string): string {
  switch (type) {
    case "starter_grant":
      return "Starter grant";
    case "reserve":
      return "Generation debit";
    case "refund":
      return "Refund";
    case "add":
      return "Credit add";
    default:
      return type;
  }
}

function deriveCheckoutStatus(search: string): {
  sessionId: string | null;
  canceled: boolean;
} {
  const params = new URLSearchParams(search);
  return {
    sessionId: params.get("session_id"),
    canceled: params.get("canceled") === "true",
  };
}

/** Inline style for secondary action buttons */
const BTN_SECONDARY: React.CSSProperties = {
  background: AUTH_COLORS.card,
  border: `1px solid ${AUTH_COLORS.cardBorder}`,
};

/** Inline style for tertiary / muted buttons */
const BTN_MUTED: React.CSSProperties = {
  background: AUTH_COLORS.inputBg,
  border: `1px solid ${AUTH_COLORS.inputBorder}`,
  color: AUTH_COLORS.textSecondary,
};

export function BillingPage(): React.ReactElement {
  const toast = useToast();
  const location = useLocation();
  const log = React.useMemo(() => logger.child("BillingPage"), []);

  const [isBusy, setIsBusy] = React.useState<string | null>(null);
  const user = useAuthUser();
  const { status: billingStatus, isLoading: isLoadingBillingStatus } =
    useBillingStatus();
  const {
    history: creditHistory,
    isLoading: isLoadingCreditHistory,
    error: creditHistoryError,
  } = useCreditHistory({ limit: 50 });

  const {
    balance,
    isLoading: isLoadingBalance,
    error: balanceError,
  } = useUserCreditBalance(user?.uid ?? null);
  const checkout = React.useMemo(
    () => deriveCheckoutStatus(location.search),
    [location.search],
  );
  const selectedPlan = React.useMemo(() => {
    const params = new URLSearchParams(location.search);
    const raw = params.get("plan");
    return typeof raw === "string" && raw.trim() ? raw.trim() : null;
  }, [location.search]);

  const signInLink = React.useMemo(() => {
    const redirect = encodeURIComponent(
      `${location.pathname}${location.search}`,
    );
    return `/signin?redirect=${redirect}`;
  }, [location.pathname, location.search]);

  const handleCheckout = async (priceId: string): Promise<void> => {
    if (!user) {
      toast.error("Sign in to manage billing.");
      return;
    }

    setIsBusy(priceId);
    try {
      const { url: redirectUrl } = await createCheckoutSession(priceId);

      if (!redirectUrl) {
        throw new Error("Missing checkout URL");
      }

      window.location.href = redirectUrl;
    } catch (error) {
      const info = sanitizeError(error);
      log.error(
        "Checkout failed",
        error instanceof Error ? error : new Error(info.message),
        {
          operation: "checkout",
          priceId,
        },
      );
      toast.error("Checkout failed. Billing may not be configured.");
    } finally {
      setIsBusy(null);
    }
  };

  const handleSubscribe = async (tier: SubscriptionTier): Promise<void> => {
    await handleCheckout(tier.priceId);
  };

  const handleOpenPortal = async (): Promise<void> => {
    if (!user) {
      toast.error("Sign in to manage billing.");
      return;
    }

    setIsBusy("portal");
    try {
      const { url: redirectUrl } = await createBillingPortalSession();

      if (!redirectUrl) {
        throw new Error("Missing billing portal URL");
      }

      window.location.href = redirectUrl;
    } catch (error) {
      const info = sanitizeError(error);
      log.error(
        "Billing portal failed",
        error instanceof Error ? error : new Error(info.message),
        {
          operation: "portal",
        },
      );
      toast.error(
        "Billing portal unavailable. Subscribe first or contact support.",
      );
    } finally {
      setIsBusy(null);
    }
  };

  return (
    <AuthShell
      variant="page"
      title="Billing"
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
        {checkout.sessionId ? (
          <div className="px-3.5 py-2.5" style={AUTH_SUCCESS_STYLE}>
            <p
              className="text-ui font-semibold"
              style={{ color: AUTH_COLORS.success }}
            >
              Checkout complete
            </p>
            <p
              className="mt-1 text-ui leading-snug"
              style={{ color: AUTH_COLORS.success, opacity: 0.8 }}
            >
              Your subscription is being confirmed. Credits land when the
              invoice is paid.
            </p>
          </div>
        ) : null}

        {checkout.canceled ? (
          <div className="px-3.5 py-2.5" style={AUTH_CARD_STYLE}>
            <p className="text-ui font-semibold text-white">
              Checkout canceled
            </p>
            <p
              className="mt-1 text-ui leading-snug"
              style={{ color: AUTH_COLORS.textSecondary }}
            >
              No changes were made. You can pick a plan anytime.
            </p>
          </div>
        ) : null}

        {!user ? (
          <div className="p-4" style={AUTH_CARD_STYLE}>
            <p className="text-ui font-semibold text-white">
              Sign in to manage billing
            </p>
            <p
              className="mt-1 text-ui leading-snug"
              style={{ color: AUTH_COLORS.textSecondary }}
            >
              Billing is tied to your account so credits sync everywhere you
              work.
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
        ) : (
          <div className="p-4" style={AUTH_CARD_STYLE}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-ui font-semibold text-white">
                    Credit balance
                  </p>
                  <span
                    className="rounded-full border px-2 py-0.5 text-meta font-semibold uppercase tracking-wide"
                    style={
                      billingStatus?.isSubscribed
                        ? {
                            borderColor: authAlpha(AUTH_COLORS.success, 19),
                            background: authAlpha(AUTH_COLORS.success, 8),
                            color: AUTH_COLORS.success,
                          }
                        : {
                            borderColor: AUTH_COLORS.cardBorder,
                            background: AUTH_COLORS.card,
                            color: AUTH_COLORS.textDim,
                          }
                    }
                  >
                    {isLoadingBillingStatus
                      ? "..."
                      : billingStatus?.isSubscribed
                        ? `Subscribed${billingStatus.planTier ? ` · ${billingStatus.planTier}` : ""}`
                        : "Free"}
                  </span>
                </div>
                <p
                  className="mt-1 text-ui leading-snug"
                  style={{ color: AUTH_COLORS.textSecondary }}
                >
                  Used for generation and previews.
                </p>
              </div>
              <div className="text-right">
                <p
                  className="text-meta font-semibold tracking-[0.22em]"
                  style={{ color: AUTH_COLORS.textLabel }}
                >
                  CREDITS
                </p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-white">
                  {isLoadingBalance ? "—" : formatInteger(balance ?? 0)}
                </p>
              </div>
            </div>
            {balanceError ? (
              <p className="mt-3 text-ui" style={{ color: AUTH_COLORS.danger }}>
                {balanceError}
              </p>
            ) : null}
          </div>
        )}

        {user ? (
          <div className="grid gap-2.5 sm:grid-cols-2">
            <Button
              type="button"
              onClick={handleOpenPortal}
              disabled={isBusy !== null}
              variant="ghost"
              className="h-9 gap-2 rounded-lg text-ui font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60"
              style={BTN_SECONDARY}
            >
              <CreditCard className="h-3.5 w-3.5" aria-hidden="true" />
              Manage billing
            </Button>

            <Button
              asChild
              variant="ghost"
              className="h-9 gap-2 rounded-lg text-ui font-semibold transition"
              style={BTN_MUTED}
            >
              <Link to="/settings/billing/invoices">
                <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                View invoices
              </Link>
            </Button>
          </div>
        ) : null}

        <div>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-ui font-semibold tracking-tight text-white">
              Plans
            </h2>
            <p
              className="text-meta font-semibold tracking-[0.22em]"
              style={{ color: AUTH_COLORS.textLabel }}
            >
              MONTHLY
            </p>
          </div>

          <div className="mt-3 grid gap-2.5">
            {SUBSCRIPTION_TIERS.map((tier) => {
              const isSelected = selectedPlan === tier.priceId;
              const isHighlighted = tier.highlight || isSelected;
              return (
                <div
                  key={tier.priceId}
                  className="rounded-md p-4"
                  style={{
                    background: AUTH_COLORS.card,
                    border: `1px solid ${isHighlighted ? AUTH_COLORS.accent : AUTH_COLORS.cardBorder}`,
                    boxShadow: isHighlighted
                      ? `0 0 0 1px ${authAlpha(AUTH_COLORS.accent, 25)}`
                      : undefined,
                  }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-ui font-semibold text-white">
                          {tier.name}
                        </p>
                        {tier.highlight ? (
                          <span
                            className="rounded-full px-2 py-0.5 text-meta font-semibold tracking-wide"
                            style={{
                              background: authAlpha(AUTH_COLORS.accent, 13),
                              color: AUTH_COLORS.accent,
                            }}
                          >
                            POPULAR
                          </span>
                        ) : null}
                        {isSelected && !tier.highlight ? (
                          <span
                            className="rounded-full px-2 py-0.5 text-meta font-semibold tracking-wide"
                            style={{
                              background: AUTH_COLORS.activeBg,
                              color: AUTH_COLORS.textDim,
                            }}
                          >
                            SELECTED
                          </span>
                        ) : null}
                      </div>
                      <p
                        className="mt-1 text-ui leading-snug"
                        style={{ color: AUTH_COLORS.textSecondary }}
                      >
                        {tier.description}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-xl font-semibold text-white tabular-nums">
                        {tier.priceMonthly}
                        <span
                          className="ml-1 text-meta font-medium"
                          style={{ color: AUTH_COLORS.textLabel }}
                        >
                          /mo
                        </span>
                      </p>
                      <p
                        className="mt-1 text-meta tabular-nums"
                        style={{ color: AUTH_COLORS.textSecondary }}
                      >
                        {formatInteger(tier.creditsPerMonth)} credits
                      </p>
                    </div>
                  </div>

                  <ul
                    className="mt-3 space-y-1.5 text-ui"
                    style={{ color: AUTH_COLORS.textSecondary }}
                  >
                    {tier.bullets.map((bullet) => (
                      <li key={bullet} className="flex items-start gap-2">
                        <Check
                          className="mt-0.5 h-3.5 w-3.5 shrink-0"
                          style={{ color: AUTH_COLORS.textDim }}
                          aria-hidden="true"
                        />
                        <span className="min-w-0">{bullet}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-4">
                    <Button
                      type="button"
                      onClick={() => handleSubscribe(tier)}
                      disabled={!user || isBusy !== null}
                      variant="ghost"
                      className={cn(
                        "h-9 w-full gap-2 rounded-lg text-ui font-semibold transition",
                        "disabled:cursor-not-allowed disabled:opacity-60",
                      )}
                      style={isHighlighted ? AUTH_CTA_STYLE : BTN_SECONDARY}
                    >
                      <CreditCard className="h-3.5 w-3.5" aria-hidden="true" />
                      {isBusy === tier.priceId ? "Redirecting…" : "Subscribe"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          <p
            className="mt-3 text-meta leading-relaxed"
            style={{ color: AUTH_COLORS.textLabel }}
          >
            Subscriptions are processed by Stripe. Credits are granted on
            successful invoice payment. Image previews cost 1 credit per image.
            For changes or cancellations, contact support.
          </p>
        </div>

        <div>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-ui font-semibold tracking-tight text-white">
              Credit packs
            </h2>
            <p
              className="text-meta font-semibold tracking-[0.22em]"
              style={{ color: AUTH_COLORS.textLabel }}
            >
              ONE-TIME
            </p>
          </div>

          <div className="mt-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            {CREDIT_PACKS.map((pack) => (
              <div
                key={pack.priceId}
                className="rounded-md p-3.5"
                style={{
                  background: AUTH_COLORS.card,
                  border: `1px solid ${AUTH_COLORS.cardBorder}`,
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-ui font-semibold text-white">
                      {pack.name}
                    </p>
                    <p
                      className="mt-1 text-ui leading-snug"
                      style={{ color: AUTH_COLORS.textSecondary }}
                    >
                      {pack.description}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-semibold text-white tabular-nums">
                      {pack.price}
                    </p>
                    <p
                      className="mt-1 text-meta tabular-nums"
                      style={{ color: AUTH_COLORS.textSecondary }}
                    >
                      {formatInteger(pack.credits)} credits
                    </p>
                  </div>
                </div>

                <div className="mt-3">
                  <Button
                    type="button"
                    onClick={() => handleCheckout(pack.priceId)}
                    disabled={!user || isBusy !== null}
                    variant="ghost"
                    className="h-8 w-full rounded-lg text-meta font-semibold transition disabled:cursor-not-allowed disabled:opacity-60"
                    style={BTN_MUTED}
                  >
                    {isBusy === pack.priceId ? "Redirecting…" : "Buy credits"}
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <p
            className="mt-3 text-meta leading-relaxed"
            style={{ color: AUTH_COLORS.textLabel }}
          >
            Credit packs are one-time purchases and add credits immediately
            after checkout confirmation.
          </p>
        </div>

        <div>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-ui font-semibold tracking-tight text-white">
              Credit activity
            </h2>
            <p
              className="text-meta font-semibold tracking-[0.22em]"
              style={{ color: AUTH_COLORS.textLabel }}
            >
              HISTORY
            </p>
          </div>

          <div
            className="mt-3 overflow-hidden rounded-md"
            style={{
              background: AUTH_COLORS.card,
              border: `1px solid ${AUTH_COLORS.cardBorder}`,
            }}
          >
            {isLoadingCreditHistory ? (
              <div
                className="px-3.5 py-3 text-ui"
                style={{ color: AUTH_COLORS.textSecondary }}
              >
                Loading credit activity…
              </div>
            ) : null}

            {!isLoadingCreditHistory && creditHistoryError ? (
              <div
                className="px-3.5 py-3 text-ui"
                style={{ color: AUTH_COLORS.danger }}
              >
                {creditHistoryError}
              </div>
            ) : null}

            {!isLoadingCreditHistory &&
            !creditHistoryError &&
            creditHistory.length === 0 ? (
              <div
                className="px-3.5 py-3 text-ui"
                style={{ color: AUTH_COLORS.textSecondary }}
              >
                No credit activity yet.
              </div>
            ) : null}

            {!isLoadingCreditHistory &&
            !creditHistoryError &&
            creditHistory.length > 0 ? (
              <ul
                style={{ borderColor: AUTH_COLORS.divider }}
                className="divide-y"
              >
                {creditHistory.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-center justify-between gap-3 px-3.5 py-2.5"
                    style={{ borderColor: AUTH_COLORS.divider }}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-ui font-medium text-white">
                        {toActivityLabel(entry.type)}
                      </p>
                      <p
                        className="mt-0.5 truncate text-meta"
                        style={{ color: AUTH_COLORS.textLabel }}
                      >
                        {[
                          entry.source,
                          entry.reason,
                          formatActivityTime(entry.createdAtMs),
                        ]
                          .filter((value): value is string => Boolean(value))
                          .join(" · ")}
                      </p>
                    </div>
                    <p
                      className="text-ui font-semibold tabular-nums"
                      style={{
                        color:
                          entry.amount >= 0 ? AUTH_COLORS.success : "#f5c05c",
                      }}
                    >
                      {formatSignedCredits(entry.amount)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </div>
    </AuthShell>
  );
}
