import React from "react";
import { Button } from "@promptstudio/system/components/ui/button";
import {
  Icon,
  WarningCircle,
  Sparkle,
  CaretDown,
  X,
} from "@promptstudio/system/components/ui";
import { CoherenceIssueCard } from "./CoherenceIssueCard";
import type { CoherenceIssue } from "./useCoherenceAnnotations";
import type { CoherenceRecommendation } from "@features/prompt-optimizer/types/coherence";
import { cn } from "@/utils/cn";

interface CoherencePanelProps {
  issues: CoherenceIssue[];
  isChecking: boolean;
  isExpanded: boolean;
  onToggleExpanded: () => void;
  onDismissIssue: (issueId: string) => void;
  onDismissAll: () => void;
  onApplyFix: (
    issueId: string,
    recommendation: CoherenceRecommendation,
  ) => void;
  onScrollToSpan: (spanId: string) => void;
}

export function CoherencePanel({
  issues,
  isChecking,
  isExpanded,
  onToggleExpanded,
  onDismissIssue,
  onDismissAll,
  onApplyFix,
  onScrollToSpan,
}: CoherencePanelProps) {
  const conflicts = issues.filter((issue) => issue.type === "conflict");
  const harmonizations = issues.filter(
    (issue) => issue.type === "harmonization",
  );
  const hasIssues = issues.length > 0;

  if (!hasIssues && !isChecking) {
    return null;
  }

  return (
    <div className="mt-4 border-t border-[rgba(67,70,81,0.5)] px-4 pt-4">
      <div className="flex w-full max-w-[480px] items-center justify-between">
        <button
          type="button"
          onClick={onToggleExpanded}
          aria-expanded={isExpanded}
          className="flex h-10 min-w-0 flex-1 items-center justify-between gap-3 py-2 text-left"
        >
          <div className="flex min-w-0 items-center gap-2">
            {isChecking ? (
              <div className="border-muted border-t-accent h-4 w-4 animate-spin rounded-full border-2" />
            ) : conflicts.length > 0 ? (
              <Icon icon={WarningCircle} size="sm" className="text-error" />
            ) : harmonizations.length > 0 ? (
              <Icon icon={Sparkle} size="sm" className="text-info" />
            ) : null}

            <div className="flex min-w-0 items-center gap-2">
              {isChecking ? (
                <span className="text-body-sm text-muted">
                  Checking coherence...
                </span>
              ) : (
                <>
                  {conflicts.length > 0 && (
                    <span
                      className={cn(
                        "inline-flex items-center rounded-md px-3 py-1 text-xs font-medium",
                        "bg-[rgba(239,68,68,0.1)] text-[rgb(239,68,68)]",
                      )}
                    >
                      {conflicts.length} conflict
                      {conflicts.length > 1 ? "s" : ""}
                    </span>
                  )}
                  {harmonizations.length > 0 && (
                    <span className="bg-surface-2 text-muted inline-flex items-center rounded-md border border-[rgb(67,70,81)] px-3 py-1 text-xs font-medium">
                      {harmonizations.length} suggestion
                      {harmonizations.length > 1 ? "s" : ""}
                    </span>
                  )}
                </>
              )}
            </div>
          </div>

          <Icon
            icon={CaretDown}
            size="sm"
            className={cn(
              "text-[rgb(170,174,187)] transition-transform duration-200",
              isExpanded ? "rotate-180" : "rotate-0",
            )}
          />
        </button>

        {hasIssues && isExpanded && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onDismissAll}
            className="text-muted hover:text-foreground ml-2 h-8 w-8 shrink-0"
            aria-label="Dismiss all"
          >
            <Icon icon={X} size="sm" />
          </Button>
        )}
      </div>

      {isExpanded && (
        <div className="mt-3 flex w-full max-w-[480px] flex-col gap-3">
          <div className="flex flex-col gap-3">
            {conflicts.map((issue) => (
              <CoherenceIssueCard
                key={issue.id}
                issue={issue}
                onDismiss={() => onDismissIssue(issue.id)}
                onApplyFix={(rec) => onApplyFix(issue.id, rec)}
                onScrollToSpan={onScrollToSpan}
              />
            ))}
            {harmonizations.map((issue) => (
              <CoherenceIssueCard
                key={issue.id}
                issue={issue}
                onDismiss={() => onDismissIssue(issue.id)}
                onApplyFix={(rec) => onApplyFix(issue.id, rec)}
                onScrollToSpan={onScrollToSpan}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
