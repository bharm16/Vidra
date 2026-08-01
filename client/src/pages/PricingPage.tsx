import React from "react";
import { Link } from "react-router-dom";
import { Check } from "@promptstudio/system/components/ui";
import { useAuthUser } from "@hooks/useAuthUser";
import { SUBSCRIPTION_TIERS } from "@/features/billing/subscriptionTiers";
import { CREDIT_PACKS } from "@/features/billing/creditPacks";
import { AUTH_COLORS, authAlpha } from "./auth/auth-styles";

const CARD: React.CSSProperties = {
  background: AUTH_COLORS.card,
  border: `1px solid ${AUTH_COLORS.cardBorder}`,
  borderRadius: "10px",
};

const INSET: React.CSSProperties = {
  background: AUTH_COLORS.inputBg,
  border: `1px solid ${AUTH_COLORS.inputBorder}`,
  borderRadius: "8px",
};

export function PricingPage(): React.ReactElement {
  const user = useAuthUser();

  const billingPath = "/settings/billing";
  const buildBillingLink = React.useCallback(
    (plan: string | null = null) => {
      const params = new URLSearchParams();
      params.set("from", "pricing");
      if (plan) params.set("plan", plan);
      return `${billingPath}?${params.toString()}`;
    },
    [billingPath],
  );

  const billingLink = buildBillingLink();
  const signInLink = `/signin?redirect=${encodeURIComponent(billingLink)}`;
  const signUpLink = `/signup?redirect=${encodeURIComponent(billingLink)}`;

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
        <div className="mx-auto max-w-3xl flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p
              className="text-meta font-semibold tracking-[0.2em]"
              style={{ color: AUTH_COLORS.textLabel }}
            >
              PRICING
            </p>
            <h1 className="text-ui font-semibold text-white tracking-tight">
              Plans & credits
            </h1>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {user ? (
              <Link
                to={billingLink}
                className="inline-flex h-7 items-center rounded-lg px-3 text-meta font-semibold transition"
                style={{
                  background: AUTH_COLORS.card,
                  border: `1px solid ${AUTH_COLORS.cardBorder}`,
                  color: AUTH_COLORS.text,
                }}
              >
                Manage billing
              </Link>
            ) : (
              <>
                <Link
                  to={signUpLink}
                  className="inline-flex h-7 items-center rounded-lg px-3 text-meta font-semibold transition"
                  style={{
                    background: AUTH_COLORS.accent,
                    color: AUTH_COLORS.bg,
                  }}
                >
                  Sign up
                </Link>
                <Link
                  to={signInLink}
                  className="inline-flex h-7 items-center rounded-lg px-3 text-meta font-semibold text-white transition"
                  style={{
                    background: AUTH_COLORS.card,
                    border: `1px solid ${AUTH_COLORS.cardBorder}`,
                  }}
                >
                  Sign in
                </Link>
              </>
            )}
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

      {/* Content */}
      <div className="mx-auto max-w-3xl px-4 sm:px-6 pb-16">
        <p
          className="pt-5 pb-4 text-ui leading-relaxed"
          style={{ color: AUTH_COLORS.textSecondary }}
        >
          Simple plans that buy you speed. All plans include core prompt
          optimization.
        </p>

        {/* Free tier */}
        <div className="p-4" style={CARD}>
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <h2 className="text-ui font-semibold text-white">Free</h2>
                <span
                  className="text-meta tabular-nums"
                  style={{ color: AUTH_COLORS.textDim }}
                >
                  $0/mo
                </span>
              </div>
              <p
                className="mt-1 text-meta"
                style={{ color: AUTH_COLORS.textSecondary }}
              >
                Local history, core prompt optimization, upgrade anytime.
              </p>
            </div>
            <Link
              to="/"
              className="inline-flex h-8 items-center rounded-lg px-3.5 text-meta font-semibold text-white transition shrink-0"
              style={{
                background: AUTH_COLORS.inputBg,
                border: `1px solid ${AUTH_COLORS.inputBorder}`,
              }}
            >
              Open app
            </Link>
          </div>
        </div>

        {/* Paid tiers — stacked list */}
        <div className="mt-3 flex flex-col gap-2.5">
          {SUBSCRIPTION_TIERS.map((tier) => (
            <div
              key={tier.priceId}
              className="p-4"
              style={
                tier.highlight
                  ? {
                      ...CARD,
                      border: `1px solid ${authAlpha(AUTH_COLORS.accent, 25)}`,
                      boxShadow: `0 0 16px ${authAlpha(AUTH_COLORS.accent, 3)}`,
                    }
                  : CARD
              }
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2.5">
                    <h3 className="text-ui font-semibold text-white">
                      {tier.name}
                    </h3>
                    <span className="text-ui font-semibold tabular-nums text-white">
                      {tier.priceMonthly}
                    </span>
                    <span
                      className="text-meta"
                      style={{ color: AUTH_COLORS.textDim }}
                    >
                      /mo
                    </span>
                    {tier.highlight ? (
                      <span
                        className="rounded-full px-2 py-0.5 text-meta font-semibold tracking-wide"
                        style={{
                          background: authAlpha(AUTH_COLORS.accent, 13),
                          border: `1px solid ${authAlpha(AUTH_COLORS.accent, 25)}`,
                          color: AUTH_COLORS.accent,
                        }}
                      >
                        Popular
                      </span>
                    ) : null}
                  </div>
                  <p
                    className="mt-1.5 text-meta leading-relaxed"
                    style={{ color: AUTH_COLORS.textSecondary }}
                  >
                    {tier.description}
                  </p>

                  {/* Credits inset */}
                  <div
                    className="mt-3 inline-flex items-center gap-2.5 rounded-lg px-3 py-1.5"
                    style={INSET}
                  >
                    <span
                      className="text-meta font-semibold tracking-[0.15em]"
                      style={{ color: AUTH_COLORS.textLabel }}
                    >
                      CREDITS
                    </span>
                    <span className="text-ui font-semibold tabular-nums text-white">
                      {tier.creditsPerMonth.toLocaleString()}/mo
                    </span>
                  </div>

                  {/* Bullets inline */}
                  <ul
                    className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-meta"
                    style={{ color: AUTH_COLORS.textSecondary }}
                  >
                    {tier.bullets.map((bullet) => (
                      <li key={bullet} className="flex items-center gap-1.5">
                        <Check
                          className="h-3 w-3 shrink-0"
                          style={{ color: AUTH_COLORS.textDim }}
                          aria-hidden="true"
                        />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <Link
                  to={
                    user
                      ? buildBillingLink(tier.priceId)
                      : `/signup?redirect=${encodeURIComponent(buildBillingLink(tier.priceId))}`
                  }
                  className="inline-flex h-8 items-center rounded-lg px-3.5 text-meta font-semibold transition shrink-0"
                  style={
                    tier.highlight
                      ? {
                          background: AUTH_COLORS.accent,
                          color: AUTH_COLORS.bg,
                        }
                      : {
                          background: AUTH_COLORS.card,
                          border: `1px solid ${AUTH_COLORS.cardBorder}`,
                          color: AUTH_COLORS.text,
                        }
                  }
                >
                  {user ? "Choose" : "Start"}
                </Link>
              </div>
            </div>
          ))}
        </div>

        {/* Credit packs */}
        <div className="mt-6 p-4" style={CARD}>
          <div className="flex items-center justify-between gap-3 mb-3">
            <h3 className="text-ui font-semibold text-white">Credit packs</h3>
            <span
              className="text-meta font-semibold tracking-[0.2em]"
              style={{ color: AUTH_COLORS.textLabel }}
            >
              ONE-TIME
            </span>
          </div>
          <p
            className="text-meta leading-relaxed mb-3"
            style={{ color: AUTH_COLORS.textSecondary }}
          >
            Need more credits mid-cycle? Top up with a one-time pack.
          </p>
          <div
            className="overflow-hidden rounded-lg"
            style={{ border: `1px solid ${AUTH_COLORS.inputBorder}` }}
          >
            {CREDIT_PACKS.map((pack, i) => (
              <div
                key={pack.priceId}
                className="flex items-center justify-between gap-3 px-3.5 py-2.5"
                style={{
                  background: AUTH_COLORS.inputBg,
                  ...(i > 0
                    ? { borderTop: `1px solid ${AUTH_COLORS.inputBorder}` }
                    : {}),
                }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-ui font-semibold text-white">
                    {pack.name}
                  </span>
                  <span
                    className="text-meta tabular-nums"
                    style={{ color: AUTH_COLORS.textDim }}
                  >
                    {pack.credits.toLocaleString()} credits
                  </span>
                </div>
                <span className="text-ui font-semibold tabular-nums text-white shrink-0">
                  {pack.price}
                </span>
              </div>
            ))}
          </div>
          <p
            className="mt-2.5 text-meta"
            style={{ color: AUTH_COLORS.textDim }}
          >
            Image previews: 1 credit. Wan video previews: 5 credits. Packs
            applied after checkout.
          </p>
        </div>

        {/* FAQ — flat list, not cards */}
        <div className="mt-6 p-4" style={CARD}>
          <h3 className="text-ui font-semibold text-white mb-3">FAQ</h3>
          <div className="flex flex-col gap-3">
            <div>
              <p className="text-meta font-semibold text-white">
                Do I need an account to pay?
              </p>
              <p
                className="mt-0.5 text-meta leading-relaxed"
                style={{ color: AUTH_COLORS.textSecondary }}
              >
                Yes — billing attaches to your account so credits sync and
                purchases are recoverable.
              </p>
            </div>
            <div
              style={{
                borderTop: `1px solid ${AUTH_COLORS.cardBorder}`,
                paddingTop: "12px",
              }}
            >
              <p className="text-meta font-semibold text-white">
                Where do credits show up?
              </p>
              <p
                className="mt-0.5 text-meta leading-relaxed"
                style={{ color: AUTH_COLORS.textSecondary }}
              >
                In the app after the invoice is paid. If you don&apos;t see
                them, reach out via{" "}
                <Link
                  to="/contact"
                  className="font-medium hover:underline"
                  style={{ color: AUTH_COLORS.accent }}
                >
                  support
                </Link>
                .
              </p>
            </div>
            <div
              style={{
                borderTop: `1px solid ${AUTH_COLORS.cardBorder}`,
                paddingTop: "12px",
              }}
            >
              <p className="text-meta font-semibold text-white">
                How much do previews cost?
              </p>
              <p
                className="mt-0.5 text-meta leading-relaxed"
                style={{ color: AUTH_COLORS.textSecondary }}
              >
                Image previews cost 1 credit per image. Wan video previews cost
                5 credits.
              </p>
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
                to="/contact"
                className="hover:text-white"
                style={{ color: AUTH_COLORS.textDim }}
              >
                Support
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
