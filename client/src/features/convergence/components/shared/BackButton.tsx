/**
 * BackButton Component
 *
 * Button to navigate back to the previous step in the convergence flow.
 *
 * @requirement 13.1 - Display a "Back" control on any step after direction
 * @requirement 13.2 - Unlock the most recent dimension and return to that step
 */

import React from "react";
import { cn } from "@/utils/cn";
import { ArrowLeft } from "@promptstudio/system/components/ui";

export interface BackButtonProps {
  /** Callback when back is clicked */
  onBack?: (() => void) | undefined;
  /** Whether the button is disabled */
  disabled?: boolean;
  /** Size variant */
  size?: "sm" | "md";
  /** Additional CSS classes */
  className?: string;
  /** Custom label (defaults to "Back") */
  label?: string;
}

/**
 * BackButton - Navigation button to go to previous step
 */
export const BackButton: React.FC<BackButtonProps> = ({
  onBack,
  disabled = false,
  size = "md",
  className,
  label = "Back",
}) => {
  const handleClick = () => {
    if (!disabled && onBack) {
      onBack();
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
      disabled={disabled}
      className={cn(
        "inline-flex items-center justify-center rounded-lg font-medium",
        "border border-border bg-surface-1 text-foreground",
        "transition-all duration-200",
        // Hover state
        !disabled && "hover:bg-surface-2 hover:border-primary/30",
        // Disabled state
        disabled && "opacity-50 cursor-not-allowed",
        sizeClasses[size],
        className,
      )}
      aria-label={label}
    >
      <ArrowLeft className={iconSizes[size]} aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
};

BackButton.displayName = "BackButton";

export default BackButton;
