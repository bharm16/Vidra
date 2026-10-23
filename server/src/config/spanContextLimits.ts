/** Enhancement accepts the labeler's supported 80-span maximum per prompt. */
export const SPAN_CONTEXT_LIMITS = {
  maxSpans: 80,
  maxTextLength: 10_000,
  maxCategoryLength: 200,
  maxPromptLength: 50_000,
} as const;
