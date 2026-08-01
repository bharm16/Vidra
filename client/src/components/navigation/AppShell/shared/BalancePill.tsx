import React from "react";
import { useCreditBalance } from "@/contexts/CreditBalanceContext";

/**
 * Persistent credit-balance display for the app shell. Renders in the
 * ToolRail so users see their live balance on every route — home,
 * /session/<id>, /account, etc.
 */
export function BalancePill(): React.ReactElement {
  const { balance, isLoading, error } = useCreditBalance();

  let text: string;
  let ariaLabel: string;
  if (typeof balance === "number") {
    text = `${balance} credits`;
    ariaLabel = `${balance} credits`;
  } else if (isLoading) {
    text = "…";
    ariaLabel = "Loading credit balance";
  } else {
    text = "—";
    ariaLabel = error ?? "Credit balance unavailable";
  }

  return (
    <span
      data-testid="balance-pill"
      aria-label={ariaLabel}
      className="inline-flex items-center gap-1 rounded-full border border-tool-rail-border bg-tool-surface-card px-2 py-0.5 text-meta font-semibold tabular-nums text-tool-text-muted"
    >
      {text}
    </span>
  );
}
