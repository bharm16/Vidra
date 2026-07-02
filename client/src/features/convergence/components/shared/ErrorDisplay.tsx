/**
 * ErrorDisplay Component
 *
 * Displays error messages with optional retry functionality.
 * Shows user-friendly error messages with appropriate actions.
 *
 * @requirement 11.1 - Display user-friendly error messages
 * @requirement 11.3 - Provide retry functionality for failed operations
 * @task 37.2 - Add retry buttons for failed operations
 */

import React from "react";
import {
  AlertCircle,
  RefreshCw,
  X,
  WifiOff,
} from "@promptstudio/system/components/ui";
import { cn } from "@/utils/cn";
import type { ConvergenceErrorCode } from "@/features/convergence/types";
import {
  getErrorMessage,
  isRetryableError,
  type ErrorMessageConfig,
} from "@/features/convergence/utils/errorMessages";

// ============================================================================
// Types
// ============================================================================

export interface ErrorDisplayProps {
  /** The error message to display */
  error: string;
  /** Optional error code for enhanced display */
  errorCode?: ConvergenceErrorCode;
  /** Callback when retry button is clicked */
  onRetry?: () => void;
  /** Callback when dismiss button is clicked */
  onDismiss?: () => void;
  /** Whether a retry is currently in progress */
  isRetrying?: boolean;
  /** Whether this is a network error */
  isNetworkError?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Variant for different display styles */
  variant?: "inline" | "banner" | "toast";
}

// ============================================================================
// Component
// ============================================================================

/**
 * ErrorDisplay - Shows error messages with retry functionality
 *
 * @example
 * ```tsx
 * <ErrorDisplay
 *   error="Image generation failed"
 *   errorCode="IMAGE_GENERATION_FAILED"
 *   onRetry={() => actions.regenerate()}
 *   onDismiss={() => setError(null)}
 * />
 * ```
 */
export const ErrorDisplay: React.FC<ErrorDisplayProps> = ({
  error,
  errorCode,
  onRetry,
  onDismiss,
  isRetrying = false,
  isNetworkError = false,
  className,
  variant = "banner",
}) => {
  // Get enhanced error config if error code is provided
  const errorConfig: ErrorMessageConfig | null = errorCode
    ? getErrorMessage(errorCode)
    : null;

  // Determine if retry should be shown
  const showRetry =
    onRetry &&
    (isNetworkError ||
      (errorCode && isRetryableError(errorCode)) ||
      (!errorCode && !error.toLowerCase().includes("limit")));

  // Get the icon based on error type
  const ErrorIcon = isNetworkError ? WifiOff : AlertCircle;

  // Get display message
  const displayMessage = errorConfig?.message ?? error;
  const displayTitle = errorConfig?.title;
  const suggestedAction = errorConfig?.suggestedAction;

  // Variant-specific styles
  const variantStyles = {
    inline: "p-3 rounded-md",
    banner: "p-4 rounded-lg",
    toast: "p-4 rounded-lg shadow-lg",
  };

  return (
    <div
      className={cn(
        "bg-error/10 border border-error/20",
        variantStyles[variant],
        className,
      )}
      role="alert"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        {/* Error Icon */}
        <ErrorIcon
          className="w-5 h-5 text-error flex-shrink-0 mt-0.5"
          aria-hidden="true"
        />

        {/* Error Content */}
        <div className="flex-1 min-w-0">
          {/* Title (if available) */}
          {displayTitle && (
            <h4 className="text-sm font-medium text-error mb-1">
              {displayTitle}
            </h4>
          )}

          {/* Message */}
          <p className="text-sm text-error/90">{displayMessage}</p>

          {/* Suggested Action */}
          {suggestedAction && (
            <p className="text-xs text-error/70 mt-1">{suggestedAction}</p>
          )}

          {/* Action Buttons */}
          {(showRetry || onDismiss) && (
            <div className="flex items-center gap-2 mt-3">
              {showRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  disabled={isRetrying}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md",
                    "bg-error/20 text-error hover:bg-error/30",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                    "transition-colors",
                  )}
                  aria-label={isRetrying ? "Retrying..." : "Retry operation"}
                >
                  <RefreshCw
                    className={cn("w-3.5 h-3.5", isRetrying && "animate-spin")}
                    aria-hidden="true"
                  />
                  {isRetrying ? "Retrying..." : "Try Again"}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Dismiss Button */}
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className={cn(
              "text-error/70 hover:text-error transition-colors",
              "rounded",
            )}
            aria-label="Dismiss error"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
};

ErrorDisplay.displayName = "ErrorDisplay";

export default ErrorDisplay;
