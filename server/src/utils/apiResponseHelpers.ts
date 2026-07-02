import type { ZodIssue } from "zod";

/**
 * Summarize Zod validation issues into the canonical `details` string. The
 * shared ApiResponse error contract (shared/types/api.ts) types `details` as
 * a string, so structured issues are flattened to "path: message" pairs;
 * routes that need the structured issues should log them server-side.
 */
export const formatValidationDetails = (issues: readonly ZodIssue[]): string =>
  issues
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
