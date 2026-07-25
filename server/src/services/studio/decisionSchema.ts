/**
 * Deep-shape gate for the LLM's per-turn decision (plan: "LLM output
 * schema"). StructuredOutputEnforcer only guarantees parseable JSON with a
 * top-level `action`; this schema enforces the full discriminated union —
 * exactly 4 variants, exactly 3 suggestions, non-empty prompts.
 *
 * Ownership split: Zod owns JSON shape/types; validateDecisionReferences
 * owns domain rules (question counts, source-image existence). A failure in
 * either takes the same schema-retry path back to the LLM.
 */

import { z } from "zod";
import { STUDIO_UTILITY_OPERATIONS, type StudioDecision } from "./types";

const NonEmpty = z.string().min(1);

const SuggestionsSchema = z.tuple([NonEmpty, NonEmpty, NonEmpty]);

export const StudioDecisionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("clarify"),
    questions: z.array(
      z.object({ text: NonEmpty, quickPicks: z.array(z.string()) }),
    ),
  }),
  z.object({
    action: z.literal("generate"),
    basePrompt: NonEmpty,
    variants: z.tuple([NonEmpty, NonEmpty, NonEmpty, NonEmpty]),
    capability: z.enum(["design", "svg", "general"]),
    aspectRatio: z.string().optional(),
    suggestions: SuggestionsSchema,
    title: z.string().optional(),
  }),
  z.object({
    action: z.literal("edit"),
    instruction: NonEmpty,
    sourceImageIds: z.array(z.string()),
    suggestions: SuggestionsSchema,
  }),
  z.object({
    action: z.literal("transform"),
    operation: z.enum(STUDIO_UTILITY_OPERATIONS),
    sourceImageId: NonEmpty,
    suggestions: SuggestionsSchema,
  }),
  z.object({
    action: z.literal("diagnose"),
    question: NonEmpty,
    quickPicks: z.array(z.string()),
  }),
  z.object({
    action: z.literal("negotiate"),
    reason: NonEmpty,
    options: z.array(z.object({ label: NonEmpty, message: NonEmpty })).min(1),
  }),
]);

/**
 * Compile-time contract: the schema's output must be a StudioDecision. If
 * the Zod schema and the hand-written union drift, this assignment errors.
 */
type ParsedStudioDecision = z.infer<typeof StudioDecisionSchema>;
export function asStudioDecision(parsed: ParsedStudioDecision): StudioDecision {
  return parsed;
}
