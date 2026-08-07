/**
 * Span Highlighting Module
 *
 * What this feature publishes to the rest of the app: AI span labeling, the
 * DOM highlight renderer, and the protocol other modules use to find a
 * rendered highlight.
 *
 * Every name here has a caller outside the feature. The previous version
 * exported 26 names plus 5 namespace objects, 20 of which nothing outside
 * imported, while the names callers genuinely needed — the selector protocol,
 * `HighlightSpan` — were reachable only by deep path. A published surface that
 * callers route around is not an interface, so this one was cut back to what
 * is actually crossed.
 *
 * Internals (anchorRanges, domManipulation, textMatching, spanValidation, the
 * scheduler, the cache service) stay unexported on purpose: they are the
 * renderer's implementation, and a caller reaching for them is a signal that
 * this module is the wrong shape, not that the export list is too short.
 *
 * @module span-highlighting
 */

// ============================================================================
// HOOKS
// ============================================================================

export {
  useSpanLabeling,
  useHighlightRendering,
  useHighlightFingerprint,
  createHighlightSignature,
} from "./hooks/index.ts";

// ============================================================================
// TYPES CROSSING THE SEAM
// ============================================================================

// Declared in hooks/types.ts. Callers used to reach them through
// hooks/useHighlightRendering, which merely re-exported them — a dependency on
// which hook file happens to declare a shared type.
export type { HighlightSpan, SpanLabelingResult } from "./hooks/types";

// ============================================================================
// TEXT + SPAN CONVERSION
// ============================================================================

export {
  sanitizeText,
  convertLabeledSpansToHighlights,
} from "./utils/index.ts";

// ============================================================================
// HIGHLIGHT DOM PROTOCOL (read side)
// ============================================================================

// This feature writes the highlight element; the modules that query it live in
// prompt-optimizer. See config/spanSelectors for why the writer publishes the
// read side.
export {
  HIGHLIGHT_CLASS,
  HIGHLIGHT_SELECTOR,
  LABELLED_HIGHLIGHT_SELECTOR,
  SPAN_ID_ATTR,
  spanIdSelector,
} from "./config/spanSelectors";
