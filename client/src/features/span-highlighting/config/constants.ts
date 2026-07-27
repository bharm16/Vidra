/**
 * Configuration Constants
 * Unified constants for span labeling and highlighting
 */

import {
  SPAN_LABELING_DEFAULT_POLICY,
  SPAN_LABELING_TEMPLATE_VERSIONS,
} from "@shared/spanLabeling";

// ============================================================================
// SPAN LABELING CONSTANTS
// ============================================================================

/**
 * Default policy configuration for span labeling
 *
 * Wire contract — the server spreads this over its own defaults, so this is
 * the limit production actually enforces.
 */
export const DEFAULT_POLICY = SPAN_LABELING_DEFAULT_POLICY;

/**
 * Default options for the useSpanLabeling hook
 */
export const DEFAULT_OPTIONS = {
  maxSpans: 60,
  minConfidence: 0.5,
  // Wire contract — the server hashes this into its cache key, so it must be
  // the same string on both sides or requests key a namespace the server
  // never writes to.
  templateVersion: SPAN_LABELING_TEMPLATE_VERSIONS.STANDARD,
  debounceMs: 500, // Fallback if smart debounce is disabled
  useSmartDebounce: true, // Enable smart debouncing by default
} as const;

// ============================================================================
// HIGHLIGHT RENDERING CONSTANTS
// ============================================================================

/**
 * Debug flag for highlight logging
 */
export const DEBUG_HIGHLIGHTS = import.meta.env.DEV;

/**
 * Performance marks for highlight rendering
 */
export const PERFORMANCE_MARKS = {
  HIGHLIGHTS_VISIBLE: "highlights-visible-on-screen",
  PROMPT_DISPLAYED: "prompt-displayed-on-screen",
} as const;

/**
 * Performance measures for highlight rendering
 */
export const PERFORMANCE_MEASURES = {
  PROMPT_TO_HIGHLIGHTS: "CRITICAL-prompt-to-highlights",
} as const;

/**
 * Dataset keys for highlight elements
 */
export const DATASET_KEYS = {
  CATEGORY: "category",
  SOURCE: "source",
  SPAN_ID: "spanId",
  START: "start",
  END: "end",
  START_DISPLAY: "startDisplay",
  END_DISPLAY: "endDisplay",
  START_GRAPHEME: "startGrapheme",
  END_GRAPHEME: "endGrapheme",
  VALIDATOR_PASS: "validatorPass",
  IDEMPOTENCY_KEY: "idempotencyKey",
  QUOTE: "quote",
  LEFT_CTX: "leftCtx",
  RIGHT_CTX: "rightCtx",
  DISPLAY_QUOTE: "displayQuote",
  DISPLAY_LEFT_CTX: "displayLeftCtx",
  DISPLAY_RIGHT_CTX: "displayRightCtx",
  CONFIDENCE: "confidence",
} as const;
