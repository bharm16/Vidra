import React from "react";
import { Link } from "react-router-dom";
import { AUTH_COLORS } from "./auth/auth-styles";

type MarketingPageProps = {
  /** Page title shown in the compact header */
  title: string;
  /** Optional label above the title */
  eyebrow?: string;
  /** Optional subtitle below the title */
  subtitle?: string;
  /** Optional right-side actions in header */
  actions?: React.ReactNode;
  /** Page content */
  children?: React.ReactNode;
  /** Max width of content area — defaults to 3xl (~48rem) */
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl" | "3xl";
  /** Hide footer */
  hideFooter?: boolean;
};

const MAX_WIDTH_MAP: Record<string, string> = {
  sm: "24rem",
  md: "28rem",
  lg: "32rem",
  xl: "36rem",
  "2xl": "42rem",
  "3xl": "48rem",
};

export function MarketingPage({
  title,
  eyebrow,
  subtitle,
  actions,
  children,
  maxWidth = "3xl",
  hideFooter,
}: MarketingPageProps): React.ReactElement {
  return (
    <div
      className="h-full overflow-y-auto"
      style={{ background: AUTH_COLORS.bg }}
    >
      {/* Compact header — matches HistoryPage / ContactSupportPage pattern */}
      <div
        className="sticky top-0 z-10 px-4 py-3 sm:px-6"
        style={{
          background: AUTH_COLORS.bg,
          borderBottom: `1px solid ${AUTH_COLORS.divider}`,
        }}
      >
        <div
          className="mx-auto flex items-center justify-between gap-4"
          style={{ maxWidth: MAX_WIDTH_MAP[maxWidth] }}
        >
          <div className="min-w-0">
            {eyebrow ? (
              <p
                className="text-meta font-semibold tracking-[0.2em]"
                style={{ color: AUTH_COLORS.textLabel }}
              >
                {eyebrow}
              </p>
            ) : null}
            <h1 className="text-ui font-semibold text-white tracking-tight truncate">
              {title}
            </h1>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {actions}
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
      <div
        className="mx-auto px-4 sm:px-6"
        style={{ maxWidth: MAX_WIDTH_MAP[maxWidth] }}
      >
        {subtitle ? (
          <p
            className="pt-5 pb-1 text-ui leading-relaxed"
            style={{ color: AUTH_COLORS.textSecondary }}
          >
            {subtitle}
          </p>
        ) : null}

        <div className="pb-16 pt-4">{children}</div>

        {!hideFooter ? (
          <footer
            className="py-6 text-meta"
            style={{
              borderTop: `1px solid ${AUTH_COLORS.cardBorder}`,
              color: AUTH_COLORS.textDim,
            }}
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <Link to="/" className="font-medium text-white hover:underline">
                Go to app
              </Link>
              <nav
                aria-label="Footer"
                className="flex flex-wrap items-center gap-x-4 gap-y-1"
              >
                <Link
                  to="/pricing"
                  className="hover:text-white"
                  style={{ color: AUTH_COLORS.textDim }}
                >
                  Pricing
                </Link>
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
        ) : null}
      </div>
    </div>
  );
}
