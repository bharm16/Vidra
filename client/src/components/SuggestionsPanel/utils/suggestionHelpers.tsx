/**
 * SuggestionsPanel Utility Functions
 *
 * Pure functions for compatibility rendering, keyboard hints, and data normalization.
 */

import {
  Badge,
  type BadgeProps,
  CheckCircle,
  AlertCircle,
} from "@promptstudio/system/components/ui";
import {
  COMPATIBILITY_THRESHOLDS,
  MAX_KEYBOARD_SHORTCUTS,
} from "../config/panelConfig";
import type { SuggestionItem } from "../hooks/types";

// ===========================
// COMPATIBILITY UTILITIES
// ===========================

export interface CompatibilityStyles {
  variant: NonNullable<BadgeProps["variant"]>;
  IconComponent: typeof CheckCircle | typeof AlertCircle | null;
  percent: number;
}

/**
 * Map a compatibility score onto a Badge variant
 */
export function getCompatibilityStyles(
  compatibility: number | undefined,
): CompatibilityStyles | null {
  if (typeof compatibility !== "number") {
    return null;
  }

  let variant: NonNullable<BadgeProps["variant"]> = "neutral";
  let IconComponent: typeof CheckCircle | typeof AlertCircle | null = null;

  if (compatibility >= COMPATIBILITY_THRESHOLDS.HIGH) {
    variant = "success";
    IconComponent = CheckCircle;
  } else if (compatibility < COMPATIBILITY_THRESHOLDS.LOW) {
    variant = "warning";
    IconComponent = AlertCircle;
  }

  return {
    variant,
    IconComponent,
    percent: Math.round(compatibility * 100),
  };
}

/**
 * Render compatibility badge component
 */
export function renderCompatibilityBadge(
  compatibility: number | undefined,
): React.ReactElement | null {
  const styles = getCompatibilityStyles(compatibility);
  if (!styles) return null;

  const { variant, IconComponent, percent } = styles;

  return (
    <Badge variant={variant} className="gap-1">
      {IconComponent ? (
        <IconComponent className="h-3.5 w-3.5" aria-hidden="true" />
      ) : null}
      <span>{percent}% fit</span>
    </Badge>
  );
}

// ===========================
// KEYBOARD HINT UTILITIES
// ===========================

/**
 * Compute keyboard hint text based on active state and suggestion count
 */
export function computeKeyboardHint(
  hasActiveSuggestions: boolean,
  suggestionCount: number,
): string | null {
  if (!hasActiveSuggestions || suggestionCount === 0) {
    return null;
  }

  const shortcutCount = Math.min(suggestionCount, MAX_KEYBOARD_SHORTCUTS);
  return `Use number keys 1-${shortcutCount} for quick selection`;
}

// ===========================
// LOADING SKELETON UTILITIES
// ===========================

/**
 * Calculate number of loading skeleton items to display
 */
export function getLoadingSkeletonCount(
  textLength: number,
  isPlaceholder: boolean,
): number {
  if (isPlaceholder) return 4;
  if (textLength < 20) return 6;
  if (textLength < 100) return 5;
  return 4;
}

// ===========================
// SUGGESTION NORMALIZATION
// ===========================

export interface NormalizedSuggestion extends SuggestionItem {
  text: string;
  [key: string]: unknown;
}

/**
 * Normalize suggestion to object format
 */
export function normalizeSuggestion(
  suggestion: string | SuggestionItem,
): NormalizedSuggestion | null {
  if (typeof suggestion === "string") {
    return { text: suggestion };
  }
  if (suggestion && typeof suggestion.text === "string") {
    return { ...suggestion, text: suggestion.text };
  }
  return null;
}
