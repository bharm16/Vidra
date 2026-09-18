import type { Request, Response } from "express";
import { extractFirebaseUid } from "@utils/requestHelpers";
import type { PreviewRoutesServices } from "@routes/types";
import { attachTakeWithOwedTracking } from "@services/sessions/attachTakeWithOwedTracking";
import type {
  OwedTakeAttachment,
  OwedTakeAttachmentStore,
} from "@services/sessions/attachTakeWithOwedTracking";
import type { TakeAttachment } from "@shared/schemas/attachment.schemas";

/**
 * Discovery and retry for quick-picture takes that were made but not saved —
 * ADR-0022 decision 6, the generated-picture side of the boundary the clip
 * routes (`/video/jobs/:jobId/attach`) already own for clips.
 *
 * A generated take is not admitted, so a lost response used to strand it with
 * no server-side memory that the session was owed it. These two routes are how a
 * reloaded client finds that debt (`GET`) and repairs it (`POST … /retry`).
 * Neither reruns generation, re-stores media, or reaches a credit surface: the
 * picture is durable and paid for; only the session row is owed.
 */

type OwedPictureAttachmentServices = Pick<
  PreviewRoutesServices,
  "owedTakeAttachmentStore" | "sessionService"
>;

/** The owed ledger row is a superset of the wire attachment; project it down. */
function toTakeAttachment(owed: OwedTakeAttachment): TakeAttachment {
  return {
    state: owed.state,
    generationId: owed.generationId,
    sessionId: owed.sessionId,
    promptVersionId: owed.promptVersionId,
    ...(owed.reason ? { reason: owed.reason } : {}),
    record: owed.record,
  };
}

/**
 * `GET /api/preview/pictures/owed-attachments?sessionId=…` — every quick-picture
 * take this creator's session is still owed, so a client that lost the original
 * response (or navigated away) can surface them as made-but-not-saved on reload.
 */
export const createOwedPictureAttachmentsHandler =
  ({
    owedTakeAttachmentStore,
  }: Pick<OwedPictureAttachmentServices, "owedTakeAttachmentStore">) =>
  async (req: Request, res: Response): Promise<Response | void> => {
    if (!owedTakeAttachmentStore) {
      return res.status(503).json({
        success: false,
        error: "Attachment recovery is not available",
      });
    }

    const userId = extractFirebaseUid(req);
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: "Authentication required",
      });
    }

    const rawSessionId = (req.query as { sessionId?: unknown }).sessionId;
    const sessionId =
      typeof rawSessionId === "string" && rawSessionId.trim().length > 0
        ? rawSessionId.trim()
        : null;
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: "sessionId is required",
      });
    }

    const owed = await owedTakeAttachmentStore.listOwedForSession(
      userId,
      sessionId,
    );
    return res.json({
      success: true,
      data: { attachments: owed.map(toTakeAttachment) },
    });
  };

/**
 * `POST /api/preview/pictures/owed-attachments/:generationId/retry` — re-attach
 * one owed take by identity. Nothing about the picture crosses the wire: the
 * ledger holds the exact record its session is owed, so this cannot write a take
 * the server did not produce. A destination that was deleted comes back as a
 * truthful `failed` attachment with its reason, never a false "saved".
 */
export const createRetryPictureAttachmentHandler =
  ({
    owedTakeAttachmentStore,
    sessionService,
  }: OwedPictureAttachmentServices) =>
  async (req: Request, res: Response): Promise<Response | void> => {
    if (!owedTakeAttachmentStore || !sessionService) {
      return res.status(503).json({
        success: false,
        error: "Attachment recovery is not available",
      });
    }

    const userId = extractFirebaseUid(req);
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: "Authentication required",
      });
    }

    const { generationId } = req.params as { generationId?: string };
    if (!generationId) {
      return res.status(400).json({
        success: false,
        error: "generationId is required",
      });
    }

    const owed = await owedTakeAttachmentStore.getOwned(userId, generationId);
    if (!owed) {
      // Nothing owed under this identity for this creator — either it never
      // failed, it already attached (and was cleared), or it is not theirs.
      return res.status(404).json({
        success: false,
        error: "No unsaved picture found for that take",
      });
    }

    const attachment = await attachTakeWithOwedTracking({
      store: owedTakeAttachmentStore as OwedTakeAttachmentStore,
      sessionService,
      input: {
        userId,
        generationId: owed.generationId,
        sessionId: owed.sessionId,
        promptVersionId: owed.promptVersionId,
        record: owed.record,
      },
      logLabel: "Retried picture",
    });

    return res.json({ success: true, attachment });
  };
