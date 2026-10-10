import React from "react";
import { Link } from "react-router-dom";

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
      style={{ background: "var(--background)" }}
    >
      {/* Compact header — matches HistoryPage / ContactSupportPage pattern */}
      <div
        className="sticky top-0 z-10 px-4 py-3 sm:px-6"
        style={{
          background: "var(--background)",
          borderBottom: `1px solid ${"var(--border)"}`,
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
                style={{ color: "var(--ghost-foreground)" }}
              >
                {eyebrow}
              </p>
            ) : null}
            <h1 className="text-ui truncate font-semibold tracking-tight text-white">
              {title}
            </h1>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            {actions}
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

      {/* Content */}
      <div
        className="mx-auto px-4 sm:px-6"
        style={{ maxWidth: MAX_WIDTH_MAP[maxWidth] }}
      >
        {subtitle ? (
          <p
            className="text-ui pb-1 pt-5 leading-relaxed"
            style={{ color: "var(--muted-foreground)" }}
          >
            {subtitle}
          </p>
        ) : null}

        <div className="pb-16 pt-4">{children}</div>

        {!hideFooter ? (
          <footer
            className="text-meta py-6"
            style={{
              borderTop: `1px solid ${"var(--border)"}`,
              color: "var(--faint-foreground)",
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
                  to="/contact"
                  className="hover:text-white"
                  style={{ color: "var(--faint-foreground)" }}
                >
                  Support
                </Link>
                <Link
                  to="/privacy-policy"
                  className="hover:text-white"
                  style={{ color: "var(--faint-foreground)" }}
                >
                  Privacy
                </Link>
                <Link
                  to="/terms-of-service"
                  className="hover:text-white"
                  style={{ color: "var(--faint-foreground)" }}
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
