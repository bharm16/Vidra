import React, { useState } from "react";
import { Button } from "@promptstudio/system/components/ui/button";
import { Icon, X, ArrowRight } from "@promptstudio/system/components/ui";
import type { CoherenceIssue } from "./useCoherenceAnnotations";
import type { CoherenceRecommendation } from "@features/prompt-optimizer/types/coherence";
import { cn } from "@/utils/cn";

interface CoherenceIssueCardProps {
  issue: CoherenceIssue;
  onDismiss: () => void;
  onApplyFix: (recommendation: CoherenceRecommendation) => void;
  onScrollToSpan?: ((spanId: string) => void) | undefined;
}

export function CoherenceIssueCard({
  issue,
  onDismiss,
  onApplyFix,
  onScrollToSpan,
}: CoherenceIssueCardProps) {
  const [showDiff, setShowDiff] = useState(false);

  return (
    <div
      className={cn(
        "relative rounded-xl border border-[rgb(41,44,50)] bg-[rgb(30,31,37)] p-4",
      )}
    >
      <Button
        variant="ghost"
        size="icon"
        onClick={onDismiss}
        className="absolute right-3 top-3 h-6 w-6 text-muted hover:text-foreground"
        aria-label="Dismiss"
      >
        <Icon icon={X} size="sm" />
      </Button>

      <div className="pr-8">
        <p className="text-sm font-medium text-[rgb(235,236,239)]">
          {issue.message}
        </p>
        <p className="mt-1 text-ui leading-5 text-[rgb(170,174,187)]">
          {issue.reasoning}
        </p>
      </div>

      {issue.involvedSpanIds.length > 0 && onScrollToSpan && (
        <div className="mt-3 flex flex-wrap gap-2">
          {issue.involvedSpanIds.map((spanId, idx) => (
            <button
              key={spanId}
              type="button"
              onClick={() => onScrollToSpan(spanId)}
              className="bg-[rgb(44,48,55)] text-xs font-medium text-[rgb(235,236,239)] hover:bg-[rgb(52,56,64)] rounded-md px-3 py-1.5"
            >
              Span {String.fromCharCode(65 + idx)}
            </button>
          ))}
        </div>
      )}

      {issue.recommendations.length > 0 && (
        <div className="mt-3 grid gap-3">
          {issue.recommendations.map((rec, idx) => (
            <div
              key={rec.id || idx}
              className="flex items-center justify-between gap-3 rounded-lg border border-[rgb(67,70,81)] bg-transparent p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-[rgb(235,236,239)]">
                  {rec.title}
                </p>
                {showDiff && rec.edits?.[0]?.type === "replaceSpanText" && (
                  <div className="mt-2 flex items-center gap-2 text-xs">
                    <span className="text-[rgb(170,174,187)] line-through">
                      {rec.edits[0].anchorQuote?.slice(0, 30)}...
                    </span>
                    <Icon icon={ArrowRight} size="xs" className="text-muted" />
                    <span className="text-[rgb(235,236,239)]">
                      {rec.edits[0].replacementText?.slice(0, 30)}...
                    </span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowDiff(!showDiff)}
                  className="text-muted h-8 rounded-md border border-[rgb(67,70,81)] bg-transparent px-3 text-xs hover:text-foreground"
                >
                  {showDiff ? "Hide" : "Diff"}
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => onApplyFix(rec)}
                  className="h-8 rounded-md bg-[rgb(99,102,241)] px-3 text-xs font-medium text-white hover:opacity-90"
                >
                  Apply
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
