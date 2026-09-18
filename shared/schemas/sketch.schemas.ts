/**
 * Sketch relay admission contract (issue #84).
 *
 * The realtime-sketch relay reserves an estimated dollar cost against the
 * creator's daily allowance BEFORE it dispatches a frame to fal. When the
 * reservation cannot be granted the relay answers with this envelope instead
 * of calling upstream, and the live editor turns `reason` into the right
 * product behaviour: a hard pause for a spent allowance, a transient error
 * for a budget store that could not answer.
 *
 * `reason` — not the status code — is the discriminator: the relay's burst
 * lane also answers 429, and the two must never be confused.
 */
import { z } from "zod";

export const SketchFrameRefusalSchema = z.discriminatedUnion("reason", [
  z.object({
    reason: z.literal("daily-allowance-reached"),
    /** Human-readable cause; the live editor shows this text verbatim. */
    detail: z.string().min(1),
    /**
     * Epoch ms of the next reset boundary (UTC midnight). Carried by every
     * allowance refusal — it is what lets a paused editor resume on its own
     * once the day rolls over, instead of needing a reload.
     */
    resetAtMs: z.number().int().positive(),
  }),
  z.object({
    reason: z.literal("budget-unavailable"),
    detail: z.string().min(1),
  }),
]);

export type SketchFrameRefusal = z.infer<typeof SketchFrameRefusalSchema>;

/**
 * The live editor's accept bridge — ADR-0022 decision 5, issue #87.
 *
 * "Use this" hands the server the picture the creator was LOOKING AT together
 * with the drawing and the settings that produced that exact picture. The
 * tuple travels as one object for one reason: the live editor keeps sending
 * frames and the creator keeps typing, so anything the server re-reads at
 * acceptance time would describe a different image than the one accepted.
 * Nothing here is re-derived server-side and nothing is regenerated.
 */

/**
 * The inputs of ONE live output, captured when that output's frame was
 * dispatched — never the sketchpad and settings at the moment of the press.
 */
export const SketchProductionInputsSchema = z.object({
  prompt: z.string().min(1),
  strength: z.number().min(0).max(1),
  steps: z.number().int().min(1).max(20),
  seed: z.number().int(),
});

export type SketchProductionInputs = z.infer<
  typeof SketchProductionInputsSchema
>;

/**
 * Where the accepted picture lands when the creator already has a session.
 *
 * Optional by contract and unused by the standalone launch, which is the only
 * launch today: a session-launched live editor (ADR-0022's "open and
 * deliberately not decided") returns to its own session and words-version
 * instead of minting a second one. Carried now so the bridge does not have to
 * change shape the day that surface exists.
 */
export const SketchAcceptDestinationSchema = z.object({
  sessionId: z.string().min(1),
  promptVersionId: z.string().min(1),
});

export type SketchAcceptDestination = z.infer<
  typeof SketchAcceptDestinationSchema
>;

export const SketchAcceptRequestSchema = z.object({
  /** The picture on screen at the press, as the relay returned it. */
  liveOutputDataUri: z.string().min(1),
  /** The drawing that produced it, as it was sent. */
  sketchSnapshotDataUri: z.string().min(1),
  inputs: SketchProductionInputsSchema,
  /** Stable across every retry AND every re-press of this one output. */
  idempotencyKey: z.string().min(1),
  destination: SketchAcceptDestinationSchema.optional(),
});

export type SketchAcceptRequest = z.infer<typeof SketchAcceptRequestSchema>;

export const SketchAcceptResultSchema = z.object({
  sessionId: z.string(),
  promptVersionId: z.string(),
  generationId: z.string(),
  imageUrl: z.string(),
  /** False when the picture was admitted into a destination the caller named. */
  createdSession: z.boolean(),
});

export type SketchAcceptResult = z.infer<typeof SketchAcceptResultSchema>;
