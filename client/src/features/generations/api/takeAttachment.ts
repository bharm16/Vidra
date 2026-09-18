import { z } from "zod";
import { apiClient } from "@/services/ApiClient";
import { logger } from "@/services/LoggingService";
import { TakeAttachmentSchema } from "@shared/schemas/attachment.schemas";
import type {
  TakeAttachment,
  TakeAttachmentState,
} from "@shared/schemas/attachment.schemas";

/**
 * Retrying an attachment — the creator's side of ADR-0022 decision 6.
 *
 * A take that was made but not saved has real media and a real take identity;
 * what it lacks is a row in its session. These two calls ask for exactly that
 * row and nothing else. Neither can rerun a generation, and neither reaches a
 * credit surface: the picture and the clip already exist and were already paid
 * for when the attachment failed.
 *
 * Both are idempotent by take identity, so a retry of an attachment that
 * actually landed is a no-op rather than a second copy of the same take.
 */

const AttachTakeResponseSchema = z
  .object({ success: z.boolean(), error: z.string().optional() })
  .passthrough();

const ClipAttachResponseSchema = z
  .object({
    success: z.boolean(),
    error: z.string().optional(),
    attachment: TakeAttachmentSchema.optional(),
  })
  .passthrough();

/**
 * Re-send the picture record the failed attachment handed back, under the same
 * take identity. The record is the server's own — the client only holds it
 * between the failure and the retry.
 */
export async function retryPictureAttachment(
  attachment: TakeAttachment,
): Promise<void> {
  if (!attachment.record) {
    throw new Error("This picture has no record to attach");
  }

  const payload = (await apiClient.post(
    `/sessions/${encodeURIComponent(attachment.sessionId)}/versions/${encodeURIComponent(
      attachment.promptVersionId,
    )}/generations`,
    { generation: attachment.record },
  )) as unknown;

  const response = AttachTakeResponseSchema.parse(payload);
  if (!response.success) {
    throw new Error(response.error ?? "Could not save this picture");
  }
}

/**
 * Ask the server to re-attach a completed clip. Nothing about the clip travels
 * on this request: the job already holds the record its session is owed.
 */
export async function retryClipAttachment(
  jobId: string,
): Promise<TakeAttachment | undefined> {
  const payload = (await apiClient.post(
    `/preview/video/jobs/${encodeURIComponent(jobId)}/attach`,
    {},
  )) as unknown;

  const response = ClipAttachResponseSchema.parse(payload);
  if (!response.success) {
    throw new Error(response.error ?? "Could not save this clip");
  }
  return response.attachment;
}

/**
 * Resolve a clip's attachment after its render finished: one server-side retry
 * for anything unresolved, then the truth, whatever it is.
 *
 * The retry is the cheap half of "failed after retries" — it re-sends the
 * record the job already holds, so it cannot rerun the render, change the
 * job's generation outcome, or reach refund logic. Returns `"failed"` when the
 * take still is not in its session, which is what the space draws as made but
 * not saved.
 */
export async function settleClipAttachment(
  jobId: string | undefined,
  attachment: TakeAttachment | undefined,
): Promise<TakeAttachmentState | undefined> {
  if (!attachment) return undefined;
  if (attachment.state === "attached") return "attached";
  if (!jobId) return attachment.state;

  try {
    const retried = await retryClipAttachment(jobId);
    return retried?.state ?? "failed";
  } catch (error) {
    logger.child("takeAttachment").warn("Clip attachment retry failed", {
      jobId,
      error: error instanceof Error ? error.message : String(error),
    });
    return "failed";
  }
}
