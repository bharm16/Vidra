/**
 * PanelStates Components
 *
 * Loading, Empty, and Inactive state components for SuggestionsPanel.
 */

import { Info } from "@promptstudio/system/components/ui";
import { Button } from "@promptstudio/system/components/ui/button";
import { getLoadingSkeletonCount } from "../utils/suggestionHelpers";
import type {
  EmptyStateConfig,
  ErrorStateConfig,
  InactiveStateConfig,
} from "./types";

// ===========================
// LOADING STATE
// ===========================

interface LoadingStateProps {
  contextValue?: string;
  selectedText?: string;
  isPlaceholder?: boolean;
}

export function LoadingState({
  contextValue = "",
  selectedText = "",
  isPlaceholder = false,
}: LoadingStateProps): React.ReactElement {
  const textLength = contextValue?.length || selectedText?.length || 0;
  const skeletonCount = getLoadingSkeletonCount(textLength, isPlaceholder);

  return (
    <div className="space-y-2 px-3 py-3" role="status" aria-live="polite">
      {Array.from({ length: skeletonCount }).map((_, i) => (
        <div
          key={i}
          className="bg-surface-1 border-border relative animate-pulse overflow-hidden rounded-md border px-3 py-2"
          style={{ animationDelay: `${i * 75}ms`, animationDuration: "1.5s" }}
        >
          <div className="space-y-1">
            <div
              className={`bg-surface-2 h-3 rounded-md ${
                i % 4 === 0
                  ? "w-3/4"
                  : i % 4 === 1
                    ? "w-2/3"
                    : i % 4 === 2
                      ? "w-4/5"
                      : "w-5/6"
              }`}
            />
            {isPlaceholder ? (
              <>
                <div
                  className={`bg-surface-2 h-2.5 rounded-md ${i % 2 === 0 ? "w-full" : "w-11/12"}`}
                />
                <div
                  className={`bg-surface-2 h-2.5 rounded-md ${i % 3 === 0 ? "w-5/6" : "w-4/5"}`}
                />
              </>
            ) : (
              <>
                <div
                  className={`bg-surface-2 h-2.5 rounded-md ${i % 2 === 0 ? "w-full" : "w-11/12"}`}
                />
                {i % 3 !== 2 && (
                  <div
                    className={`bg-surface-2 h-2.5 rounded-md ${i % 2 === 0 ? "w-5/6" : "w-4/5"}`}
                  />
                )}
              </>
            )}
          </div>
        </div>
      ))}
      <p className="text-label-12 text-muted mt-4 text-center">
        {isPlaceholder ? "Finding relevant values..." : "Analyzing context..."}
      </p>
    </div>
  );
}

// ===========================
// EMPTY STATE
// ===========================

interface EmptyStateProps {
  emptyState: EmptyStateConfig;
}

export function EmptyState({
  emptyState,
}: EmptyStateProps): React.ReactElement {
  const EmptyIcon = emptyState.icon;

  return (
    <div className="flex flex-1 items-center justify-center py-8">
      <div className="max-w-[200px] px-3 text-center">
        <div className="relative mb-3 inline-flex">
          <div className="bg-surface-1 border-border relative rounded-md border p-2">
            <EmptyIcon className="text-muted h-6 w-6" aria-hidden="true" />
          </div>
        </div>
        <p className="text-label-12 text-foreground mb-1">{emptyState.title}</p>
        <p className="text-label-12 text-muted">{emptyState.description}</p>
      </div>
    </div>
  );
}

// ===========================
// ERROR STATE
// ===========================

interface ErrorStateProps {
  errorState: ErrorStateConfig;
  errorMessage?: string | null;
  onRetry?: () => void;
}

export function ErrorState({
  errorState,
  errorMessage,
  onRetry,
}: ErrorStateProps): React.ReactElement {
  const ErrorIcon = errorState.icon;
  const description = errorMessage || errorState.description;

  return (
    <div className="flex flex-1 items-center justify-center py-8">
      <div className="max-w-[220px] px-3 text-center">
        <div className="relative mb-3 inline-flex">
          <div className="bg-surface-1 border-border relative rounded-md border p-2">
            <ErrorIcon className="text-muted h-6 w-6" aria-hidden="true" />
          </div>
        </div>
        <p className="text-label-12 text-foreground mb-1">{errorState.title}</p>
        <p className="text-label-12 text-muted">{description}</p>
        {onRetry && (
          <Button
            onClick={onRetry}
            variant="ghost"
            className="text-label-12 bg-surface-2 hover:bg-hover mt-3 rounded-md px-3 py-1 font-medium transition-colors"
          >
            Retry
          </Button>
        )}
      </div>
    </div>
  );
}

// ===========================
// INACTIVE STATE
// ===========================

interface InactiveStateProps {
  inactiveState: InactiveStateConfig;
}

export function InactiveState({
  inactiveState,
}: InactiveStateProps): React.ReactElement {
  const InactiveIcon = inactiveState.icon;
  const example = inactiveState.example;

  return (
    <div className="flex flex-1 items-start justify-start px-4 py-4">
      <div className="w-full max-w-[360px]">
        <div className="flex items-start gap-3">
          <div className="bg-surface-1 border-border relative flex-shrink-0 rounded-md border p-2">
            <InactiveIcon className="text-muted h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h4 className="text-foreground text-sm font-medium">
              {inactiveState.title}
            </h4>
            <p className="text-label-12 text-muted mt-1">
              {inactiveState.description}
            </p>
          </div>
        </div>

        {example?.from &&
          Array.isArray(example.to) &&
          example.to.length > 0 && (
            <div className="mt-4">
              <div className="text-muted mb-2 text-meta font-medium uppercase tracking-wide">
                Example
              </div>
              <div className="bg-surface-1 border-border text-label-12 text-foreground rounded-md border px-3 py-2 font-mono">
                {example.from} → {example.to.join(" | ")}
              </div>
            </div>
          )}

        {Array.isArray(inactiveState.tips) && inactiveState.tips.length > 0 && (
          <div className="mt-3 space-y-1 text-left">
            {inactiveState.tips.map((tip, index) => {
              const TipIcon = tip.icon || Info;
              return (
                <div
                  key={`${tip.text}-${index}`}
                  className="bg-surface-1 border-border flex items-start gap-2 rounded-md border px-2 py-1"
                >
                  <TipIcon
                    className="text-muted mt-0.5 h-3 w-3 flex-shrink-0"
                    aria-hidden="true"
                  />
                  <span className="text-label-12 text-muted">{tip.text}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
