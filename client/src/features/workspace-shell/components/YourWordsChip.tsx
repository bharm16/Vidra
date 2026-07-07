import React from "react";
import { Button } from "@promptstudio/system/components/ui/button";
import { cn } from "@/utils/cn";

export interface YourWordsChipProps {
  /** The immutable original one-liner (SessionPrompt.input, kept per D1). */
  originalWords: string;
  /** Refill the composer with the original one-liner — an explicit action. */
  onRestore: () => void;
}

/**
 * "Your words" — a labeled, deliberate control shown once the one-liner has
 * grown into the full shot description (ADR-0010). It holds the original
 * one-liner and restores it into the composer when activated (UX rule: browsing
 * is read-only, restoration is an explicit action — never automatic). Renders
 * nothing when there is no original to restore.
 */
export function YourWordsChip({
  originalWords,
  onRestore,
}: YourWordsChipProps): React.ReactElement | null {
  const words = originalWords.trim();
  if (!words) return null;
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onRestore}
      title={`Restore your words: "${words}"`}
      className={cn(
        "flex h-auto max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-normal",
        "border-tool-rail-border bg-tool-surface-card text-tool-text-subdued",
        "hover:border-tool-text-label hover:text-foreground",
      )}
    >
      <span className="shrink-0 font-medium">Your words</span>
      <span aria-hidden="true" className="text-tool-text-label shrink-0">
        ·
      </span>
      <span className="text-tool-text-dim truncate">{words}</span>
    </Button>
  );
}
