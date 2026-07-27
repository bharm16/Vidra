/**
 * Performance and UI Configuration Constants
 *
 * Centralized configuration for magic numbers used throughout the application.
 * Each constant includes documentation explaining its purpose and rationale.
 */

export const PERFORMANCE_CONFIG = {
  /**
   * UNDO/REDO CONFIGURATION
   */
  // Maximum number of undo/redo history entries to maintain
  // Limits memory usage while providing sufficient history for typical editing sessions
  UNDO_STACK_SIZE: 100,

  /**
   * CACHE CONFIGURATION
   */
  // Maximum size of the hash cache for string memoization
  // Balance between memory usage and cache hit rate for hash lookups
  HASH_CACHE_MAX_SIZE: 1000,

  // Number of span labeling results to cache
  // Increased from 20 to 50 for better cache hit rate without excessive memory usage
  SPAN_LABELING_CACHE_LIMIT: 50,

  /**
   * HIGHLIGHTING CONFIGURATION
   */
  // Maximum number of highlighted spans to render in the UI
  // Prevents UI performance degradation with excessive highlights
  // Based on typical video prompt complexity
  MAX_HIGHLIGHTS: 60,

  // Minimum confidence score (0-1) for displaying a highlight
  // Balance between precision (showing only good highlights) and recall (showing all relevant ones)
  // 0.5 provides a good balance for most use cases
  MIN_CONFIDENCE_SCORE: 0.5,

  /**
   * DEBOUNCE TIMING
   */
  // Debounce delay for span labeling API calls (milliseconds)
  // Prevents excessive API calls while user is typing
  // 500ms provides good responsiveness without API spam
  DEBOUNCE_DELAY_MS: 500,

  /**
   * ASYNC OPERATION TIMING
   */
  // Delay before executing async operations after state changes (milliseconds)
  // Allows React to complete its render cycle before triggering side effects
  // 100ms is standard for post-render async operations
  ASYNC_OPERATION_DELAY_MS: 100,

  // Minimum delay for resetting refs after history operations (milliseconds)
  // 0ms uses next event loop tick via setTimeout, allowing state updates to flush
  REF_RESET_DELAY_MS: 0,

  /**
   * API CONFIGURATION
   */
  // Maximum prompt length to include in logs (characters)
  // Prevents excessive log sizes while providing enough context for debugging
  MAX_LOG_PROMPT_LENGTH: 500,
} as const;

/**
 * Storage keys used throughout the application
 */
export const STORAGE_KEYS = {
  SPAN_LABELING_CACHE: "promptBuilder.spanLabelingCache.v2", // Updated to v2 for new role taxonomy
} as const;

export default PERFORMANCE_CONFIG;
