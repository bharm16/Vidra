import React from "react";
import { Link } from "react-router-dom";
import { X } from "@promptstudio/system/components/ui";

interface CreditOnboardingBannerProps {
  userId: string | null;
  starterGrantCredits: number | null;
  currentBalance?: number | null;
}

const dismissedKey = (userId: string): string =>
  `credit-onboarding-dismissed:${userId}`;

export function CreditOnboardingBanner({
  userId,
  starterGrantCredits,
  currentBalance,
}: CreditOnboardingBannerProps): React.ReactElement | null {
  const [dismissed, setDismissed] = React.useState(false);

  // Auto-dismiss once the live balance diverges from the starter grant —
  // either direction. The onboarding copy ("You started with N credits.")
  // is stale as soon as the user has spent anything OR topped up; leaving
  // it up after a top-up misleads users about their actual balance.
  const shouldAutoDismiss =
    typeof currentBalance === "number" &&
    typeof starterGrantCredits === "number" &&
    currentBalance !== starterGrantCredits;

  React.useEffect(() => {
    if (!userId) {
      setDismissed(true);
      return;
    }
    if (shouldAutoDismiss) {
      try {
        localStorage.setItem(dismissedKey(userId), "1");
      } catch {
        // Ignore storage failures.
      }
      setDismissed(true);
      return;
    }
    try {
      setDismissed(localStorage.getItem(dismissedKey(userId)) === "1");
    } catch {
      setDismissed(true);
    }
  }, [userId, shouldAutoDismiss]);

  const handleDismiss = React.useCallback((): void => {
    if (!userId) return;
    try {
      localStorage.setItem(dismissedKey(userId), "1");
    } catch {
      // Ignore storage failures.
    }
    setDismissed(true);
  }, [userId]);

  if (!userId || dismissed) {
    return null;
  }

  const starterText =
    typeof starterGrantCredits === "number" && starterGrantCredits > 0
      ? `You started with ${starterGrantCredits} credits.`
      : "Credits are required for previews and renders.";

  return (
    <section
      className="motion-presence-panel mx-3 mt-3 rounded-lg border border-tool-rail-border bg-tool-panel-inner px-3 py-2"
      data-testid="credit-onboarding-banner"
      data-motion-state="entered"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-meta font-semibold text-white">
            Credits power generation
          </p>
          <p className="mt-0.5 text-meta text-tool-text-dim">
            {starterText} You can top up anytime in{" "}
            <Link
              to="/billing"
              className="text-white underline underline-offset-2"
            >
              billing
            </Link>
            .
          </p>
        </div>

        <button
          type="button"
          onClick={handleDismiss}
          className="rounded-md p-1 text-tool-text-dim transition-[color,background-color,transform] duration-[140ms] [transition-timing-function:var(--motion-ease-standard)] hover:-translate-y-px hover:bg-tool-rail-border hover:text-white"
          aria-label="Dismiss credit onboarding"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </section>
  );
}
