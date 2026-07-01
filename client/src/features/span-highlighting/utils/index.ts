/**
 * Utilities Module
 *
 * Barrel export for all utility functions.
 * Pure functions with no side effects.
 */

// DOM utilities - Text node manipulation
export {
  buildTextNodeIndex,
  mapGlobalRangeToDom,
  surroundRange,
  wrapRangeSegments,
} from "./anchorRanges";

// DOM utilities - Highlight wrapper management
export {
  createHighlightWrapper,
  enhanceWrapperWithMetadata,
  unwrapHighlight,
  logEmptyWrappers,
} from "./domManipulation";

// DOM utilities - Coverage tracking
export { hasOverlap, addToCoverage } from "./coverageTracking";

// Validation - Span structure validation
export { sanitizeSpans, normalizeSpan } from "./spanValidation";

// Validation - Token boundaries
export {
  isWordBoundary,
  snapSpanToTokenBoundaries,
  rangeOverlaps,
} from "./tokenBoundaries";

// Processing - Business logic for spans
export {
  findNearbySpans,
  buildSimplifiedSpans,
  prepareSpanContext,
} from "./spanProcessing";

// Processing - Rendering preparation
export {
  hasValidOffsets,
  snapSpan,
  processAndSortSpans,
} from "./spanRenderingUtils";

// Processing - Text matching
export {
  normalizeText,
  isSubstringMatch,
  validateHighlightText,
} from "./textMatching";

// Processing - Highlight format conversion
export { convertLabeledSpansToHighlights } from "./highlightConversion";

// Cache utilities - Hashing
export { hashString } from "./hashing";

// Cache utilities - Cache key generation
export { buildCacheKey } from "./cacheKey";

// Cache utilities - Text processing
export { sanitizeText, serializePolicy } from "./textUtils";
