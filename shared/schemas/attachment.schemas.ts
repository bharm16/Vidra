/**
 * The attachment fact — ADR-0022 decision 6 (the narrow freeze exception for
 * the worker-to-session attachment boundary).
 *
 * "The media was generated" and "the take reached its session" are two
 * independent facts. This module names the second one and nothing else. A take
 * whose attachment is `failed` was made but not saved: the media is durable and
 * the take identity already exists, so a retry re-attaches that exact take
 * rather than regenerating anything.
 *
 * The three states are the whole vocabulary:
 * - `pending`   — the attachment is owed and will be resumed.
 * - `attached`  — the take is in its session; refetching the session is now the
 *                 source of truth for it.
 * - `failed`    — failed and retryable. Never a refund, never a re-render.
 *
 * Pure by construction (`shared/` rule): a Zod declaration and its inferred
 * types, no I/O.
 */
import { z } from "zod";
import { SessionGenerationRecordSchema } from "./session.schemas.js";

export const TAKE_ATTACHMENT_STATES = [
  "pending",
  "attached",
  "failed",
] as const;

export const TakeAttachmentStateSchema = z.enum(TAKE_ATTACHMENT_STATES);
export type TakeAttachmentState = z.infer<typeof TakeAttachmentStateSchema>;

export const TakeAttachmentSchema = z.object({
  state: TakeAttachmentStateSchema,
  /**
   * The take identity this attachment is for. Stable across every retry — it is
   * minted before the first append is attempted, so a failure never costs the
   * take its name.
   */
  generationId: z.string(),
  sessionId: z.string(),
  promptVersionId: z.string(),
  /** Why the last attempt failed. Absent while pending and once attached. */
  reason: z.string().optional(),
  /**
   * The record that has not reached the session yet. Present only while the
   * attachment is unresolved: it is exactly what a retry re-sends, so the retry
   * writes the same media under the same take identity instead of asking a
   * caller to rebuild a record it does not own.
   */
  record: SessionGenerationRecordSchema.optional(),
});
export type TakeAttachment = z.infer<typeof TakeAttachmentSchema>;

/** An attachment is terminal for a client once it is no longer owed. */
export function isAttachmentResolved(state: TakeAttachmentState): boolean {
  return state !== "pending";
}
