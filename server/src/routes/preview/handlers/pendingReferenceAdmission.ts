import type { Request, Response } from "express";
import { z } from "zod";
import type { PreviewRoutesServices } from "@routes/types";
import { extractFirebaseUid } from "@utils/requestHelpers";
import { validatePathOwnership } from "@services/storage/utils/pathUtils";
import { fetchRemoteMedia } from "@services/owned-media";
import { validateImageBuffer } from "@utils/validateFileType";
import {
  admitPictureTake,
  resumePendingUpload,
} from "@services/admission/admitPictureTake";

const RequestSchema = z
  .object({
    storagePath: z.string().trim().min(1).max(500),
    sessionId: z.string().trim().min(1).max(200),
    promptVersionId: z.string().trim().min(1).max(200),
    admissionKey: z.string().trim().min(1).max(200),
  })
  .strict();

type Services = Pick<
  PreviewRoutesServices,
  | "storageService"
  | "imageAssetStore"
  | "sessionService"
  | "requestIdempotencyService"
  | "ownedPictureResolver"
>;

/** Admit already uploaded reference bytes, after explicit words association. */
export const createPendingReferenceAdmissionHandler =
  ({
    storageService,
    imageAssetStore,
    sessionService,
    requestIdempotencyService,
    ownedPictureResolver,
  }: Services) =>
  async (req: Request, res: Response): Promise<Response | void> => {
    const userId = extractFirebaseUid(req);
    if (!userId)
      return res
        .status(401)
        .json({ success: false, error: "Authentication required" });
    const parsed = RequestSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({
        success: false,
        error:
          "A reference, session, words-version and admission key are required",
      });
    const input = parsed.data;
    // Reference uploads use the user-scoped store. Reject another creator's
    // handle before signing it, fetching bytes or taking an admission claim.
    if (!validatePathOwnership(input.storagePath, userId)) {
      return res
        .status(404)
        .json({ success: false, error: "Reference not found" });
    }
    if (
      !storageService ||
      !imageAssetStore ||
      !sessionService ||
      !requestIdempotencyService
    ) {
      return res
        .status(503)
        .json({ success: false, error: "Admission unavailable" });
    }
    const deps = {
      sessionService,
      mediaStore: imageAssetStore,
      idempotency: requestIdempotencyService,
      ...(ownedPictureResolver ? { resolver: ownedPictureResolver } : {}),
    };
    const resumed = await resumePendingUpload(deps, { userId, ...input });
    if (resumed) return respond(res, resumed);
    let session;
    try {
      session = await sessionService.requireOwnedSession(
        userId,
        input.sessionId,
      );
    } catch {
      return res
        .status(404)
        .json({ success: false, error: "Session not found" });
    }
    const version = session.prompt?.versions?.find(
      (entry) => entry.versionId === input.promptVersionId,
    );
    if (!version?.prompt.trim()) {
      return res.status(409).json({
        success: false,
        error: "Save associated words before using this reference",
      });
    }
    const { viewUrl } = await storageService.getViewUrl(
      userId,
      input.storagePath,
    );
    const media = await fetchRemoteMedia({
      sourceUrl: viewUrl,
      fieldName: "reference",
      allowedContentTypes: ["image/png", "image/jpeg", "image/webp"],
      maxBytes: 10 * 1024 * 1024,
    });
    const contentType = await validateImageBuffer(media.buffer, "reference");
    const admitted = await admitPictureTake(deps, {
      userId,
      sessionId: input.sessionId,
      promptVersionId: input.promptVersionId,
      idempotencyKey: input.admissionKey,
      origin: "upload",
      media: { buffer: media.buffer, contentType },
      productionProvenance: { state: "unknown" },
      sourceInputs: [{ kind: "upload", storagePath: input.storagePath }],
      displayAncestorGenerationId: null,
    });
    return respond(res, admitted);
  };

function respond(
  res: Response,
  admitted: Awaited<ReturnType<typeof admitPictureTake>>,
): Response {
  if (admitted.state !== "admitted") {
    return res.status(admitted.state === "refused" ? 404 : 409).json({
      success: false,
      error:
        "Reference could not be admitted; retry with its original destination",
    });
  }
  const { take } = admitted;
  return res.status(201).json({
    success: true,
    data: {
      imageUrl: take.imageUrl,
      viewUrl: take.imageUrl,
      storagePath: take.storagePath,
      assetId: take.assetId,
      promptVersionId: take.promptVersionId,
      attachment: take.attachment,
      ...(take.attachment.state === "attached"
        ? { generationId: take.generationId }
        : {}),
    },
  });
}
