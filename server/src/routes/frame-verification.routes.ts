import express, { type Router, type Request, type Response } from "express";
import { z } from "zod";
import { asyncHandler } from "@middleware/asyncHandler";
import type { FrameVerificationService } from "@services/frame-verification";
import { FrameVerificationParseError } from "@services/frame-verification";
import type { FrameVerificationResult } from "@services/frame-verification";
import type { ApiResponse } from "@shared/types/api";
import { formatValidationDetails } from "@utils/apiResponseHelpers";

const FrameVerificationRequestSchema = z
  .object({
    image: z.string().min(1),
    spans: z
      .array(
        z
          .object({
            text: z.string().min(1),
            category: z.string().min(1),
            start: z.number().int().min(0).optional(),
            end: z.number().int().min(0).optional(),
          })
          .strip(),
      )
      .min(1)
      .max(50),
  })
  .strip();

export function createFrameVerificationRoutes(
  frameVerificationService: FrameVerificationService,
): Router {
  const router = express.Router();

  router.post(
    "/frame-verification",
    asyncHandler(
      async (
        req: Request,
        res: Response<ApiResponse<FrameVerificationResult>>,
      ) => {
        const parsed = FrameVerificationRequestSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({
            success: false,
            error: "Invalid frame verification request",
            details: formatValidationDetails(parsed.error.issues),
          });
        }

        try {
          const result = await frameVerificationService.verify(parsed.data);
          return res.json({ success: true, data: result });
        } catch (error) {
          if (error instanceof FrameVerificationParseError) {
            return res.status(502).json({
              success: false,
              error: "Frame verification model returned an unusable response",
            });
          }
          throw error;
        }
      },
    ),
  );

  return router;
}

export default createFrameVerificationRoutes;
