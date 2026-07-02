/**
 * Image Content Handler
 *
 * Local image serving has been disabled.
 * Images should be accessed via GCS signed URLs or storage URLs.
 */

import type { Request, Response } from "express";
import type { PreviewApiResponse } from "@shared/schemas/preview.schemas";
import { logger } from "@infrastructure/Logger";

const log = logger.child({ handler: "imageContent" });

export const createImageContentHandler =
  () =>
  async (
    req: Request,
    res: Response<PreviewApiResponse<never>>,
  ): Promise<Response | void> => {
    const { contentId } = req.params as { contentId?: string };

    if (!contentId) {
      return res.status(400).json({
        success: false,
        error: "contentId is required",
      });
    }

    log.warn("Local image content endpoint is disabled", { contentId });
    return res.status(410).json({
      success: false,
      error:
        "Local image content endpoint is disabled. Use GCS signed URLs instead.",
    });
  };
