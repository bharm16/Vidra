import { z } from "zod";
import { apiClient } from "@/services/ApiClient";
import { logger } from "@/services/LoggingService";
import { TakeAttachmentSchema } from "@shared/schemas/attachment.schemas";
import { FirstFrameArmingSchema } from "@shared/schemas/firstFrame.schemas";
import type {
  TakeAttachment,
  TakeAttachmentState,
} from "@shared/schemas/attachment.schemas";
import type { FirstFrameArming } from "@shared/schemas/firstFrame.schemas";

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

const OwedPictureAttachmentsResponseSchema = z
  .object({
    success: z.boolean(),
    error: z.string().optional(),
    data: z.object({ attachments: z.array(TakeAttachmentSchema) }).optional(),
  })
  .passthrough();

const ArmFirstFrameResponseSchema = z
  .object({
    success: z.boolean(),
    error: z.string().optional(),
    data: z.object({ arming: FirstFrameArmingSchema }).optional(),
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
 * Arm an already-saved take as its session's first frame — the retry half of
 * the arming boundary (issue #136). Nothing about the picture travels on this
 * request: the take is named by the identity admission minted for it, and the
 * server reads the record and its durable handle from the session the take is
 * already in. It cannot re-admit, re-store media, or mint a second take. The
 * server's refusals are the truth and come back as thrown errors carrying its
 * own sentence: a take that is not saved yet belongs to the attachment retry
 * first, and a picture with no durable handle is not a completable handoff.
 */
export async function retryFirstFrameArming(
  sessionId: string,
  generationId: string,
): Promise<FirstFrameArming> {
  const payload = (await apiClient.post(
    `/sessions/${encodeURIComponent(sessionId)}/first-frame/arm`,
    { generationId },
  )) as unknown;

  const response = ArmFirstFrameResponseSchema.parse(payload);
  if (!response.success) {
    throw new Error(response.error ?? "Could not set the first frame");
  }
  return (
    response.data?.arming ?? { state: "armed", generationId }
  );
}

/**
 * Every quick-picture take this creator's session is still owed — the
 * generated-picture side of ADR-0022 decision 6, issue #133. A generated take
 * is not admitted, so a lost response used to strand it with no server-side
 * memory; this is how a reloaded client rediscovers those made-but-not-saved
 * pictures so it can surface them and offer a retry.
 */
export async function fetchOwedPictureAttachments(
  sessionId: string,
): Promise<TakeAttachment[]> {
  const payload = (await apiClient.get(
    `/preview/pictures/owed-attachments?sessionId=${encodeURIComponent(sessionId)}`,
  )) as unknown;

  const response = OwedPictureAttachmentsResponseSchema.parse(payload);
  if (!response.success) {
    throw new Error(response.error ?? "Could not load unsaved pictures");
  }
  return response.data?.attachments ?? [];
}

/**
 * Every accepted live output minted into this session whose take is still not
 * in it — the sketchpad side of recovery (issue #134). The live editor keeps
 * nothing (ADR-0017), so a reloaded client asks the SESSION, which answers
 * from the server-side truth: the #128 receipt is the index, the session the
 * take was minted into decides what is still owed. Each attachment carries
 * the exact record its retry re-sends through {@link retryPictureAttachment}
 * — the same take, never a re-accept, never a re-render.
 */
export async function fetchUnresolvedSketchAcceptances(
  sessionId: string,
): Promise<TakeAttachment[]> {
  const payload = (await apiClient.get(
    `/sketch/accept/unresolved?sessionId=${encodeURIComponent(sessionId)}`,
  )) as unknown;

  const response = OwedPictureAttachmentsResponseSchema.parse(payload);
  if (!response.success) {
    throw new Error(response.error ?? "Could not load unsaved pictures");
  }
  return response.data?.attachments ?? [];
}

/**
 * Ask the server to re-attach one owed quick-picture take by identity. Nothing
 * about the picture travels on this request: the server's owed ledger holds the
 * record its session is owed, so this cannot rerun a generation, re-store media,
 * or reach a credit surface. A destination that was deleted comes back as a
 * truthful `failed` attachment, not a false success.
 */
export async function retryOwedPictureAttachment(
  generationId: string,
): Promise<TakeAttachment | undefined> {
  const payload = (await apiClient.post(
    `/preview/pictures/owed-attachments/${encodeURIComponent(generationId)}/retry`,
    {},
  )) as unknown;

  const response = ClipAttachResponseSchema.parse(payload);
  if (!response.success) {
    throw new Error(response.error ?? "Could not save this picture");
  }
  return response.attachment;
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
