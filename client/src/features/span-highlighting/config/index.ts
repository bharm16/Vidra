/**
 * Configuration Module
 *
 * Barrel export for all configuration constants and utilities.
 */

// Constants
export {
  DEFAULT_POLICY,
  DEFAULT_OPTIONS,
  DEBUG_HIGHLIGHTS,
  PERFORMANCE_MARKS,
  PERFORMANCE_MEASURES,
  DATASET_KEYS,
} from "./constants";

// Debounce utilities
export { calculateSmartDebounce } from "./debounce";

// Highlight styles
export { getHighlightClassName, applyHighlightStyles } from "./highlightStyles";

// How other modules find a rendered highlight
export {
  HIGHLIGHT_CLASS,
  HIGHLIGHT_SELECTOR,
  LABELLED_HIGHLIGHT_SELECTOR,
  SPAN_ID_ATTR,
  spanIdSelector,
} from "./spanSelectors";
