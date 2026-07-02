/**
 * RegenerateButton Component
 *
 * Button to regenerate options for the current dimension.
 * Shows remaining regeneration count and credit cost.
 *
 * @requirement 14.1 - Display a "Regenerate" control when viewing dimension options
 * @requirement 14.4 - Limit regeneration to 3 times per dimension per session
 * @requirement 14.5 - Display remaining regeneration count to the user
 */

import React from "react";
import { cn } from "@/utils/cn";
import { RefreshCw, Coins } from "@promptstudio/system/components/ui";

/**
 * Maximum regenerations allowed per dimension
 */
const MAX_REGENERATIONS = 3;

/**
 * Credit cost per regeneration (same as dimension images)
 */
const REGENERATION_COST = 4;

export interface RegenerateButtonProps {
  /** Number of regenerations already used for this dimension */
  regenerationCount?: number;
  /** Whether the button is in loading state */
  isLoading?: boolean;
  /** Whether the button is disabled */
  disabled?: boolean;
  /** Callback when regenerate is clicked */
  onRegenerate?: (() => void) | undefined;
  /** Size variant */
  size?: "sm" | "md";
  /** Additional CSS classes */
  className?: string;
  /** Whether to show the cost */
  showCost?: boolean;
}

/**
 * RegenerateButton - Button to regenerate dimension options
 */
export const RegenerateButton: React.FC<RegenerateButtonProps> = ({
  regenerationCount = 0,
  isLoading = false,
  disabled = false,
  onRegenerate,
  size = "md",
  className,
  showCost = true,
}) => {
  const remainingRegenerations = Math.max(
    0,
    MAX_REGENERATIONS - regenerationCount,
  );
  const isLimitReached = remainingRegenerations === 0;
  const isDisabled = disabled || isLoading || isLimitReached;

  const handleClick = () => {
    if (!isDisabled && onRegenerate) {
      onRegenerate();
    }
  };

  // Touch-friendly tap targets: min 44px height (Task 35.4)
  const sizeClasses = {
    sm: "px-3 py-2.5 text-xs gap-1.5 min-h-[44px]",
    md: "px-4 py-2.5 text-sm gap-2 min-h-[44px]",
  };

  const iconSizes = {
    sm: "h-3.5 w-3.5",
    md: "h-4 w-4",
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isDisabled}
      className={cn(
        "inline-flex items-center justify-center rounded-lg font-medium",
        "border border-border bg-surface-1 text-foreground",
        "transition-all duration-200",
        // Hover state
        !isDisabled && "hover:bg-surface-2 hover:border-primary/30",
        // Disabled state
        isDisabled && "opacity-50 cursor-not-allowed",
        // Loading state
        isLoading && "cursor-wait",
        sizeClasses[size],
        className,
      )}
      aria-label={
        isLimitReached
          ? "Regeneration limit reached"
          : `Regenerate options (${remainingRegenerations} remaining)`
      }
      aria-disabled={isDisabled}
    >
      {/* Refresh icon */}
      <RefreshCw
        className={cn(iconSizes[size], isLoading && "animate-spin")}
        aria-hidden="true"
      />

      {/* Label */}
      <span>{isLoading ? "Regenerating..." : "Regenerate"}</span>

      {/* Remaining count badge */}
      {!isLoading && (
        <span
          className={cn(
            "inline-flex items-center justify-center rounded-full",
            "min-w-[1.25rem] h-5 px-1.5 text-xs font-semibold",
            isLimitReached
              ? "bg-error/10 text-error"
              : remainingRegenerations === 1
                ? "bg-warning/10 text-warning"
                : "bg-primary/10 text-primary",
          )}
        >
          {remainingRegenerations}
        </span>
      )}

      {/* Cost indicator */}
      {showCost && !isLoading && !isLimitReached && (
        <span
          className="inline-flex items-center gap-0.5 text-muted"
          aria-label={`Costs ${REGENERATION_COST} credits`}
        >
          <Coins
            className={cn(iconSizes[size], "text-amber-500")}
            aria-hidden="true"
          />
          <span>{REGENERATION_COST}</span>
        </span>
      )}
    </button>
  );
};

RegenerateButton.displayName = "RegenerateButton";

export default RegenerateButton;
