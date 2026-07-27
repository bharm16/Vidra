/**
 * Span labeling wire contract.
 *
 * These values cross the client/server boundary on every `/api/llm/label-spans`
 * request, so they must be defined exactly once. Both sides import from here.
 *
 * `templateVersion` is hashed into the server-side span-labeling cache key
 * (`generateCacheKey`), so a client and server that disagree on this string key
 * two different cache namespaces and the client permanently misses the cache
 * the server writes to. Bumping the value here is what busts that cache.
 *
 * Pure data only — no Node APIs, no React, no I/O (shared-layer rule).
 */

/**
 * Template identifiers sent as `templateVersion` on a label-spans request.
 *
 * - `STANDARD` — v2.3: explicit weather-as-separate-span rule, lighting/source
 *   disambiguation table, and removal of the "foggy alley" compound-noun
 *   exception that contradicted the weather rule.
 * - `I2V` — image-to-video mode: motion-only categories, because the reference
 *   image already fixes every static visual attribute.
 */
export const SPAN_LABELING_TEMPLATE_VERSIONS = {
  STANDARD: "v2.3",
  I2V: "i2v-v2",
} as const;

export type SpanLabelingTemplateVersion =
  (typeof SPAN_LABELING_TEMPLATE_VERSIONS)[keyof typeof SPAN_LABELING_TEMPLATE_VERSIONS];

/**
 * Default validation policy sent with a label-spans request.
 *
 * The server spreads the request policy over its own defaults, so whatever the
 * client sends wins. Keeping one definition means evaluations validate under
 * the same limits production enforces.
 */
export const SPAN_LABELING_DEFAULT_POLICY = {
  /** Maximum word count for a non-technical span. */
  nonTechnicalWordLimit: 6,
  /** Whether overlapping spans are permitted. */
  allowOverlap: false,
} as const;
