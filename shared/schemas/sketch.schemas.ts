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
