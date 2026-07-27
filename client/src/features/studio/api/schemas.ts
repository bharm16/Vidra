/**
 * Zod anti-corruption boundary for /api/studio responses (house rule:
 * every feature api/ validates server DTOs at the wire).
 */

import { z } from "zod";

export const StudioModelSlugSchema = z.enum([
  "recraft-v4.1",
  "recraft-v4.1-svg",
  "recraft-v4.1-pro",
  "recraft-v4.1-pro-svg",
  "nano-banana-2",
  "nano-banana-2-lite",
  "nano-banana-pro",
  "gpt-image-2",
]);

export type StudioModelSlug = z.infer<typeof StudioModelSlugSchema>;

export const StudioAttachmentSchema = z.object({
  id: z.string(),
  storagePath: z.string(),
  filename: z.string(),
  createdAtMs: z.number(),
  /** Present on the register response for the composer chip preview. */
  viewUrl: z.string().optional(),
});

export type StudioAttachment = z.infer<typeof StudioAttachmentSchema>;

export const StudioProjectSchema = z.object({
  id: z.string(),
  title: z.string(),
  selectedImageId: z.string().nullish(),
  /** User-uploaded reference images (S-12). */
  attachments: z.array(StudioAttachmentSchema).optional(),
  /**
   * Plain string on the wire, NOT the slug enum: a persisted pin whose
   * model left the roster must still parse (behavior 9 — stale pins
   * revert to Auto with a notice, they never brick the project fetch).
   * Writes stay narrow — updateStudioProject accepts only roster slugs.
   */
  pinnedModel: z.string().nullish(),
  createdAtMs: z.number(),
  updatedAtMs: z.number(),
});

export type StudioProject = z.infer<typeof StudioProjectSchema>;

export const StudioDecisionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("clarify"),
    questions: z.array(
      z.object({ text: z.string(), quickPicks: z.array(z.string()) }),
    ),
  }),
  z.object({
    action: z.literal("generate"),
    /** LLM reasoning shown above the results (behavior 8). */
    thinking: z.string().optional(),
    basePrompt: z.string(),
    variants: z.array(z.string()),
    capability: z.string(),
    aspectRatio: z.string().optional(),
    suggestions: z.array(z.string()),
    title: z.string().optional(),
  }),
  z.object({
    action: z.literal("edit"),
    thinking: z.string().optional(),
    instruction: z.string(),
    sourceImageIds: z.array(z.string()),
    suggestions: z.array(z.string()),
  }),
  z.object({
    action: z.literal("transform"),
    thinking: z.string().optional(),
    operation: z.string(),
    sourceImageId: z.string(),
    suggestions: z.array(z.string()),
  }),
  z.object({
    action: z.literal("diagnose"),
    question: z.string(),
    quickPicks: z.array(z.string()),
  }),
  z.object({
    action: z.literal("negotiate"),
    reason: z.string(),
    options: z.array(z.object({ label: z.string(), message: z.string() })),
  }),
]);

export type StudioDecision = z.infer<typeof StudioDecisionSchema>;

export const StudioImageSchema = z.object({
  id: z.string(),
  storagePath: z.string(),
  sourcePrompt: z.string(),
  model: z.string(),
  /** Minted per poll; may be briefly absent if signing failed server-side. */
  viewUrl: z.string().optional(),
});

export type StudioImage = z.infer<typeof StudioImageSchema>;

export const StudioCallSchema = z.object({
  index: z.number(),
  status: z.enum(["running", "succeeded", "failed"]),
  image: StudioImageSchema.optional(),
  error: z.string().optional(),
});

export const StudioTurnSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  status: z.enum(["running", "complete", "partial", "failed"]),
  userMessage: z.string(),
  decision: StudioDecisionSchema,
  /** Absent on conversational turns (clarify/diagnose/negotiate). */
  resolvedModel: z.string().optional(),
  calls: z.array(StudioCallSchema),
  createdAtMs: z.number(),
  updatedAtMs: z.number(),
});

export type StudioTurn = z.infer<typeof StudioTurnSchema>;

export const RunTurnResponseSchema = z.object({
  turnId: z.string(),
  decision: StudioDecisionSchema,
});

export type RunTurnResponse = z.infer<typeof RunTurnResponseSchema>;

/** Picker roster entry — display data only; the server keeps Replicate IDs. */
export const StudioModelInfoSchema = z.object({
  /**
   * Plain string, NOT the slug enum — same class as pinnedModel above. The
   * server declares the roster slug as a string, so a model registered
   * after this client shipped must still parse: the roster is fetched
   * during bootstrap, and a throw there blanks the whole project list.
   */
  slug: z.string(),
  displayName: z.string(),
  capabilities: z.array(z.string()),
  latencyHintSeconds: z.number(),
});

export type StudioModelInfo = z.infer<typeof StudioModelInfoSchema>;
