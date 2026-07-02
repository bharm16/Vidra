import type { Request, Response } from "express";
import type { PreviewApiResponse } from "@shared/schemas/preview.schemas";
import { isIP } from "node:net";
import type { PreviewRoutesServices } from "@routes/types";
import { sendVideoContent } from "@routes/preview/videoRequest";
import { extractVideoContentToken } from "../content";

type VideoContentServices = Pick<
  PreviewRoutesServices,
  "videoGenerationService" | "videoJobStore" | "videoContentAccessService"
>;

export const createVideoContentHandler =
  ({
    videoGenerationService,
    videoJobStore,
    videoContentAccessService,
  }: VideoContentServices) =>
  async (
    req: Request,
    res: Response<PreviewApiResponse<never>>,
  ): Promise<Response | void> => {
    if (!videoGenerationService) {
      return res.status(503).json({
        success: false,
        error: "Video generation service is not available",
      });
    }

    const { contentId } = req.params as { contentId?: string };
    if (!contentId) {
      return res.status(400).json({
        success: false,
        error: "contentId is required",
      });
    }

    const token = extractVideoContentToken(req);
    if (token && !videoContentAccessService) {
      return res.status(503).json({
        success: false,
        error: "Video access tokens are not configured",
      });
    }

    const tokenPayload =
      token && videoContentAccessService
        ? videoContentAccessService.verifyToken(token, contentId)
        : null;

    if (!tokenPayload) {
      if (!videoJobStore) {
        return res.status(503).json({
          success: false,
          error: "Video job store is not available",
        });
      }

      const userId =
        (req as Request & { user?: { uid?: string } }).user?.uid ?? null;
      if (!userId || userId === "anonymous" || isIP(userId) !== 0) {
        return res.status(401).json({
          success: false,
          error: "Authentication required",
          message: "You must be logged in to access this video content.",
        });
      }

      const job = await videoJobStore.findJobByAssetId(contentId);
      if (!job) {
        return res.status(404).json({
          success: false,
          error: "Video content not found or expired",
        });
      }

      if (job.userId !== userId) {
        return res.status(403).json({
          success: false,
          error: "Access denied",
          message: "This video does not belong to the authenticated user.",
        });
      }
    }

    const entry = await videoGenerationService.getVideoContent(contentId);
    if (!entry) {
      return res.status(404).json({
        success: false,
        error: "Video content not found or expired",
      });
    }

    await sendVideoContent(res, entry);
    return;
  };
