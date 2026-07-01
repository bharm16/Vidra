/**
 * Span Highlighting Module
 *
 * Unified module for span labeling and text highlighting functionality.
 * Provides hooks, utilities, and services for:
 * - AI-powered span labeling
 * - DOM-based text highlighting
 * - Span validation and processing
 * - Cache management
 *
 * @module span-highlighting
 */

// ============================================================================
// HOOKS (Primary API)
// ============================================================================

export {
  useSpanLabeling,
  useHighlightRendering,
  useHighlightSourceSelection,
  useHighlightFingerprint,
  createHighlightSignature,
} from "./hooks/index.ts";

// ============================================================================
// UTILITIES (Secondary API)
// ============================================================================

// DOM utilities - Most commonly used
export {
  buildTextNodeIndex,
  wrapRangeSegments,
  mapGlobalRangeToDom,
} from "./utils/anchorRanges";

// Validation - Most commonly used
export {
  sanitizeSpans,
  normalizeSpan,
  snapSpanToTokenBoundaries,
  convertLabeledSpansToHighlights,
} from "./utils/index.ts";

// Processing - Most commonly used
export {
  findNearbySpans,
  buildSimplifiedSpans,
  prepareSpanContext,
} from "./utils/spanProcessing";

// Cache utilities - Most commonly used
export { hashString, sanitizeText } from "./utils/index.ts";

// ============================================================================
// SERVICES (Advanced API)
// ============================================================================

export { spanLabelingCache } from "./services/index.ts";
export { SpanLabelingApi } from "./api/index.ts";

// ============================================================================
// CONFIGURATION (Exports for customization)
// ============================================================================

export { DEFAULT_POLICY, DEFAULT_OPTIONS } from "./config/index.ts";

// ============================================================================
// NAMESPACE EXPORTS (For organized imports)
// ============================================================================

import * as spanHooks from "./hooks/index.ts";
import * as spanUtils from "./utils/index.ts";
import * as spanConfig from "./config/index.ts";
import * as spanServices from "./services/index.ts";
import * as spanApi from "./api/index.ts";

export { spanHooks, spanUtils, spanConfig, spanServices, spanApi };
