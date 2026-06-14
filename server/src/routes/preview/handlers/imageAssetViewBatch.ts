import type { Request, Response } from "express";
import { extractFirebaseUid } from "@utils/requestHelpers";
import type { PreviewRoutesServices } from "@routes/types";
import { logger } from "@infrastructure/Logger";

type ImageAssetViewBatchServices = Pick<
  PreviewRoutesServices,
  "imageGenerationService"
>;

const log = logger.child({ handler: "imageAssetViewBatch" });

/** Maximum number of asset IDs allowed per batch request. */
const MAX_BATCH_SIZE = 50;

interface BatchItem {
  assetId: string;
  viewUrl: string | null;
  error?: string;
}

/**
 * Batch handler for resolving multiple image asset IDs to signed view URLs
 * in a single request. Reduces N+1 API calls from the client.
 *
 * POST /api/preview/image/view-batch
 * Body: { assetIds: string[] }
 * Response: { success: true, data: { results: BatchItem[] } }
 */
export const createImageAssetViewBatchHandler =
  ({ imageGenerationService }: ImageAssetViewBatchServices) =>
  async (req: Request, res: Response): Promise<Response | void> => {
    if (!imageGenerationService) {
      return res.status(503).json({
        success: false,
        error: "Image generation service is not available",
      });
    }

    const userId = extractFirebaseUid(req);
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: "Authentication required",
        message: "You must be logged in to access preview images.",
      });
    }

    const body = req.body as { assetIds?: unknown };
    if (!body || !Array.isArray(body.assetIds)) {
      return res.status(400).json({
        success: false,
        error: "assetIds must be an array of strings",
      });
    }

    const rawIds: unknown[] = body.assetIds;
    if (rawIds.length === 0) {
      return res.json({ success: true, data: { results: [] } });
    }

    if (rawIds.length > MAX_BATCH_SIZE) {
      return res.status(400).json({
        success: false,
        error: `Batch size exceeds maximum of ${MAX_BATCH_SIZE}`,
      });
    }

    // Validate and deduplicate
    const seen = new Set<string>();
    const validIds: string[] = [];
    for (const raw of rawIds) {
      if (typeof raw !== "string") continue;
      const id = raw.trim();
      if (!id || id.includes("/")) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      validIds.push(id);
    }

    // Resolve all in parallel
    const results: BatchItem[] = await Promise.all(
      validIds.map(async (assetId): Promise<BatchItem> => {
        try {
          const viewUrl = await imageGenerationService.getImageUrl(
            assetId,
            userId,
          );
          if (!viewUrl) {
            return { assetId, viewUrl: null, error: "not_found" };
          }
          return { assetId, viewUrl };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          log.warn("Batch item failed", { assetId, userId, error: message });
          return { assetId, viewUrl: null, error: "internal_error" };
        }
      }),
    );

    return res.json({
      success: true,
      data: { results },
    });
  };
