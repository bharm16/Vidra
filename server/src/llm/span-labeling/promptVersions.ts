/**
 * Prompt version constants for span labeling templates.
 *
 * Centralizes version identifiers so that changes are tracked in one place
 * and can be correlated with LLM metrics (operation + version → quality).
 *
 * The span-labeling entries derive from the wire contract in
 * `shared/spanLabeling.ts` so a logged version always names the template the
 * request actually keyed.
 */

import { SPAN_LABELING_TEMPLATE_VERSIONS } from "#shared/spanLabeling.ts";

export const PROMPT_VERSIONS = {
  /** Standard span labeling prompt (multi-provider) */
  SPAN_LABELING: `span-${SPAN_LABELING_TEMPLATE_VERSIONS.STANDARD}`,
  /** Image-to-video span labeling (motion-only categories) */
  I2V_SPAN_LABELING: SPAN_LABELING_TEMPLATE_VERSIONS.I2V,
  /** Gemini simple prompt variant */
  GEMINI_SIMPLE: "gemini-simple-v2",
  /** Gemini streaming (NDJSON) prompt variant */
  GEMINI_STREAMING: "gemini-streaming-v1",
  /** Visual control points extraction */
  VISUAL_CONTROL_POINTS: "vcp-v1",
  /** Role classifier prompt */
  ROLE_CLASSIFIER: "role-v1",
} as const;

export type PromptVersion =
  (typeof PROMPT_VERSIONS)[keyof typeof PROMPT_VERSIONS];
