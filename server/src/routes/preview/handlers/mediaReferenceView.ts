import type { Request, Response } from "express";
import { isOwnedMediaReference } from "@services/owned-media";
import type { PreviewApiResponse } from "@shared/schemas/preview.schemas";
import { extractFirebaseUid } from "@utils/requestHelpers";
import type { PreviewRoutesServices } from "@routes/types";

type MediaKind = "image" | "video";

type MediaReferenceViewServices = Pick<
  PreviewRoutesServices,
  "imageGenerationService" | "videoGenerationService" | "videoJobStore" | "storageService"
>;

function isStorageReference(reference: string): boolean {
  return isOwnedMediaReference(reference) || reference.includes("/");
}

/**
 * One client-facing refresh boundary for every owned-media reference. The
 * client submits an opaque ref (or a legacy ref during migration); the server
 * alone decides whether it is generic owned media or a preview asset.
 */
export const createMediaReferenceViewHandler =
  ({
    imageGenerationService,
    videoGenerationService,
    videoJobStore,
    storageService,
  }: MediaReferenceViewServices) =>
  async (
    req: Request,
    res: Response<
      PreviewApiResponse<{
        viewUrl: string;
        expiresAt?: string | undefined;
        mediaRef?: string | undefined;
        source: "owned" | "preview";
      }>
    >,
  ): Promise<Response | void> => {
    const userId = extractFirebaseUid(req);
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: "Authentication required",
      });
    }

    const reference =
      typeof req.query.ref === "string" ? req.query.ref.trim() : "";
    const kind = typeof req.query.kind === "string" ? req.query.kind : "";
    if (!reference || reference.length > 500) {
      return res.status(400).json({
        success: false,
        error: "ref is required",
      });
    }
    if (kind !== "image" && kind !== "video") {
      return res.status(400).json({
        success: false,
        error: "kind must be image or video",
      });
    }

    if (isStorageReference(reference)) {
      if (!storageService) {
        return res.status(503).json({
          success: false,
          error: "Storage service is not available",
        });
      }
      const result = await storageService.getOwnedMediaViewUrl(
        userId,
        reference,
      );
      return res.json({
        success: true,
        data: {
          viewUrl: result.viewUrl,
          expiresAt: result.expiresAt,
          ...(result.mediaRef ? { mediaRef: result.mediaRef } : {}),
          source: "owned",
        },
      });
    }

    if (kind === "image") {
      if (!imageGenerationService) {
        return res.status(503).json({
          success: false,
          error: "Image generation service is not available",
        });
      }
      const viewUrl =
        (await imageGenerationService.getImageUrl(reference, userId)) ??
        (storageService
          ? await storageService.getPreviewImageViewUrl(userId, reference)
          : null);
      if (!viewUrl) {
        return res.status(404).json({
          success: false,
          error: "Image asset not found",
        });
      }
      return res.json({
        success: true,
        data: { viewUrl, source: "preview" },
      });
    }

    if (!videoGenerationService || !videoJobStore) {
      return res.status(503).json({
        success: false,
        error: "Video generation service is not available",
      });
    }
    const job = await videoJobStore.findJobByAssetId(reference);
    if (!job || job.userId !== userId) {
      return res.status(job ? 403 : 404).json({
        success: false,
        error: job ? "Forbidden" : "Video asset not found",
      });
    }
    if (job.result?.storagePath && storageService) {
      const result = await storageService.getOwnedMediaViewUrl(
        userId,
        job.result.storagePath,
      );
      return res.json({
        success: true,
        data: {
          viewUrl: result.viewUrl,
          expiresAt: result.expiresAt,
          ...(result.mediaRef ? { mediaRef: result.mediaRef } : {}),
          source: "owned",
        },
      });
    }
    const viewUrl = await videoGenerationService.getVideoUrl(reference);
    if (!viewUrl) {
      return res.status(404).json({
        success: false,
        error: "Video asset not found",
      });
    }
    return res.json({ success: true, data: { viewUrl, source: "preview" } });
  };
