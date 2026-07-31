/**
 * Zod schemas for the `/api/enhancement/prompt-coherence` contract.
 *
 * Single declaration: the schemas here are the contract, and every type in
 * `shared/types/coherence.ts` is `z.infer`'d from them. Server and client
 * both import from that pair, so a field can no longer exist on one side and
 * not the other — the previous three hand-written copies (shared TS, the
 * server service, the client api module) had already drifted apart.
 *
 * Objects strip unknown keys rather than passing them through, so the
 * inferred types stay closed. `CoherenceSpanSchema` is the one exception —
 * spans are an open bag that callers annotate, so it stays loose.
 */
import { z } from "zod";

export const CoherenceEditSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("replaceSpanText"),
    spanId: z.string().optional(),
    replacementText: z.string().optional(),
    anchorQuote: z.string().optional(),
  }),
  z.object({
    type: z.literal("removeSpan"),
    spanId: z.string().optional(),
    anchorQuote: z.string().optional(),
  }),
]);

export const CoherenceRecommendationSchema = z.object({
  id: z.string().optional(),
  title: z.string(),
  rationale: z.string(),
  edits: z.array(CoherenceEditSchema),
  confidence: z.number().optional(),
});

export const CoherenceFindingSchema = z.object({
  id: z.string().optional(),
  severity: z.enum(["low", "medium", "high", "suggestion"]).optional(),
  message: z.string(),
  reasoning: z.string(),
  involvedSpanIds: z.array(z.string()).optional(),
  recommendations: z.array(CoherenceRecommendationSchema),
});

/**
 * A span the coherence check reasons over. Loose on purpose: the client
 * builds these from its highlight snapshot and the server appends
 * sentence-level context spans (`source: "context"`) before prompting, so
 * neither side owns the full key set.
 */
export const CoherenceSpanSchema = z
  .object({
    id: z.string().optional(),
    category: z.string().optional(),
    text: z.string().optional(),
    quote: z.string().optional(),
    start: z.number().optional(),
    end: z.number().optional(),
    confidence: z.number().optional(),
    leftCtx: z.string().optional(),
    rightCtx: z.string().optional(),
    source: z.enum(["labeled", "context"]).optional(),
  })
  .passthrough();

export const AppliedChangeSchema = z.object({
  spanId: z.string().optional(),
  category: z.string().optional(),
  oldText: z.string().optional(),
  newText: z.string().optional(),
});

export const CoherenceCheckRequestSchema = z.object({
  beforePrompt: z.string(),
  afterPrompt: z.string(),
  appliedChange: AppliedChangeSchema.optional(),
  spans: z.array(CoherenceSpanSchema).optional(),
});

export const CoherenceCheckResultSchema = z.object({
  conflicts: z.array(CoherenceFindingSchema),
  harmonizations: z.array(CoherenceFindingSchema),
});

export type CoherenceEdit = z.infer<typeof CoherenceEditSchema>;
export type CoherenceRecommendation = z.infer<
  typeof CoherenceRecommendationSchema
>;
export type CoherenceFinding = z.infer<typeof CoherenceFindingSchema>;
export type CoherenceSpan = z.infer<typeof CoherenceSpanSchema>;
export type AppliedChange = z.infer<typeof AppliedChangeSchema>;
export type CoherenceCheckRequest = z.infer<typeof CoherenceCheckRequestSchema>;
export type CoherenceCheckResult = z.infer<typeof CoherenceCheckResultSchema>;
