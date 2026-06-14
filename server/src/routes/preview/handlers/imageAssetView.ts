import type { Request, Response } from "express";
import { extractFirebaseUid } from "@utils/requestHelpers";
import type { PreviewRoutesServices } from "@routes/types";
import { logger } from "@infrastructure/Logger";

type ImageAssetViewServices = Pick<
  PreviewRoutesServices,
  "imageGenerationService"
>;
const log = logger.child({ handler: "imageAssetView" });

export const createImageAssetViewHandler =
  ({ imageGenerationService }: ImageAssetViewServices) =>
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

    const assetId =
      typeof req.query.assetId === "string" ? req.query.assetId.trim() : "";
    if (!assetId) {
      return res.status(400).json({
        success: false,
        error: "assetId is required",
      });
    }

    if (assetId.includes("/")) {
      return res.status(400).json({
        success: false,
        error: "Invalid assetId",
      });
    }

    const viewUrl = await imageGenerationService.getImageUrl(assetId, userId);
    if (!viewUrl) {
      log.warn("Image asset not found in GCS", { assetId, userId });
      return res.status(404).json({
        success: false,
        error: "Image asset not found",
      });
    }

    return res.json({
      success: true,
      data: {
        viewUrl,
        assetId,
        source: "preview",
      },
    });
  };
