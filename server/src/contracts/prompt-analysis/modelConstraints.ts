/**
 * Prompt-analysis model constraints.
 *
 * Single-sourced from the shared contract so the server strategy layer and the
 * shared `getPromptModelConstraints()` data cannot drift. Kept under this name
 * (`ModelConstraints`) so existing server importers are unaffected.
 */
export type { PromptModelConstraints as ModelConstraints } from "@shared/videoModels";
