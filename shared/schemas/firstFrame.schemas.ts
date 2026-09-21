/**
 * The first-frame arming fact — issue #136, the second outcome of a handoff.
 *
 * "The take reached its session" (the attachment fact,
 * `attachment.schemas.ts`) and "the take was armed as the session's first
 * frame" are two further independent facts. The handoff services used to
 * attempt the arming write last and swallow a failure into a log line while
 * the response read as success; this module names the arming outcome so it can
 * travel beside the attachment fact and be retried on its own.
 *
 * The three states are the whole vocabulary:
 * - `armed`    — `keyframes[0]` is the take (ADR-0011 D4), written with the
 *                take identity AND its durable media handle (#125), so a
 *                reopened session restores the exact accepted picture even
 *                after the URL has expired.
 * - `failed`   — the arming was owed and did not land. Retryable through the
 *                arm door without readmission and without a second take; the
 *                reason names what happened.
 * - `not-owed` — this handoff was never arming this take: the acceptance
 *                named a destination session whose first frame is not this
 *                bridge's to replace (ADR-0022, "open and deliberately not
 *                decided"), or the arming follows a later attachment rather
 *                than this response.
 *
 * Pure by construction (`shared/` rule): a Zod declaration and its inferred
 * types, no I/O.
 */
import { z } from "zod";

export const TAKE_ARMING_STATES = [
  "armed",
  "failed",
  "not-owed",
] as const;

export const FirstFrameArmingStateSchema = z.enum(TAKE_ARMING_STATES);
export type FirstFrameArmingState = z.infer<
  typeof FirstFrameArmingStateSchema
>;

export const FirstFrameArmingSchema = z.object({
  state: FirstFrameArmingStateSchema,
  /**
   * The take the frame arms — or would have armed. Present in every state, so
   * a retry can address the same take by identity.
   */
  generationId: z.string(),
  /** Why the arming did not land. Absent while armed. */
  reason: z.string().optional(),
});
export type FirstFrameArming = z.infer<typeof FirstFrameArmingSchema>;
