/**
 * NetworkStatusBanner Component
 *
 * Displays network connectivity status and recovery prompts.
 * Shows when the user is offline and when connection is restored.
 *
 * @requirement 11.8 - Recover session on reconnect
 * @task 37.3 - Add network disconnect detection and recovery prompt
 */

import React, { useEffect, useState } from "react";
import {
  WifiOff,
  Wifi,
  RefreshCw,
  X,
} from "@promptstudio/system/components/ui";
import { cn } from "@/utils/cn";
import type { NetworkStatus } from "@/features/convergence/types";

// ============================================================================
// Types
// ============================================================================

export interface NetworkStatusBannerProps {
  /** Current network status */
  status: NetworkStatus;
  /** Callback when retry button is clicked */
  onRetry?: () => void;
  /** Callback when dismiss button is clicked (for recovery banner) */
  onDismiss?: () => void;
  /** Whether a retry is in progress */
  isRetrying?: boolean;
  /** Additional CSS classes */
  className?: string;
}

// ============================================================================
// Component
// ============================================================================

/**
 * NetworkStatusBanner - Shows network connectivity status
 *
 * @example
 * ```tsx
 * const { status, clearRecoveryFlag } = useNetworkStatus();
 *
 * <NetworkStatusBanner
 *   status={status}
 *   onRetry={handleRetry}
 *   onDismiss={clearRecoveryFlag}
 * />
 * ```
 */
export const NetworkStatusBanner: React.FC<NetworkStatusBannerProps> = ({
  status,
  onRetry,
  onDismiss,
  isRetrying = false,
  className,
}) => {
  const [showRecoveryBanner, setShowRecoveryBanner] = useState(false);

  // Show recovery banner when connection is restored
  useEffect(() => {
    if (status.wasOffline && status.isOnline) {
      setShowRecoveryBanner(true);
      // Auto-hide after 10 seconds
      const timer = setTimeout(() => {
        setShowRecoveryBanner(false);
        onDismiss?.();
      }, 10000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [status.wasOffline, status.isOnline, onDismiss]);

  // Handle dismiss
  const handleDismiss = () => {
    setShowRecoveryBanner(false);
    onDismiss?.();
  };

  // Show offline banner
  if (!status.isOnline) {
    return (
      <div
        className={cn(
          "fixed top-0 left-0 right-0 z-fixed",
          "bg-warning/95 backdrop-blur-sm",
          "border-b border-warning/20",
          "px-4 py-3",
          "animate-in slide-in-from-top duration-300",
          className,
        )}
        role="alert"
        aria-live="assertive"
      >
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <WifiOff
              className="w-5 h-5 text-warning-foreground"
              aria-hidden="true"
            />
            <div>
              <p className="text-sm font-medium text-warning-foreground">
                You're offline
              </p>
              <p className="text-xs text-warning-foreground/80">
                Please check your internet connection. Your progress is saved.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show recovery banner
  if (showRecoveryBanner) {
    return (
      <div
        className={cn(
          "fixed top-0 left-0 right-0 z-fixed",
          "bg-success/95 backdrop-blur-sm",
          "border-b border-success/20",
          "px-4 py-3",
          "animate-in slide-in-from-top duration-300",
          className,
        )}
        role="alert"
        aria-live="polite"
      >
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Wifi
              className="w-5 h-5 text-success-foreground"
              aria-hidden="true"
            />
            <div>
              <p className="text-sm font-medium text-success-foreground">
                You're back online
              </p>
              <p className="text-xs text-success-foreground/80">
                Your connection has been restored.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                disabled={isRetrying}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md",
                  "bg-success-foreground/20 text-success-foreground",
                  "hover:bg-success-foreground/30",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                  "transition-colors",
                )}
                aria-label={isRetrying ? "Retrying..." : "Retry last operation"}
              >
                <RefreshCw
                  className={cn("w-3.5 h-3.5", isRetrying && "animate-spin")}
                  aria-hidden="true"
                />
                {isRetrying ? "Retrying..." : "Retry"}
              </button>
            )}

            <button
              type="button"
              onClick={handleDismiss}
              className={cn(
                "text-success-foreground/70 hover:text-success-foreground",
                "rounded",
                "transition-colors",
              )}
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

NetworkStatusBanner.displayName = "NetworkStatusBanner";

export default NetworkStatusBanner;
