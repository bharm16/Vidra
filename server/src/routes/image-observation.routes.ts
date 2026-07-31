import express, { type Router, type Request, type Response } from "express";
import { z } from "zod";
import { asyncHandler } from "@middleware/asyncHandler";
import { requireBody } from "@middleware/intake";
import type { ImageObservationService } from "@services/image-observation";

const ImageObservationRequestSchema = z
  .object({
    image: z.string().min(1),
    skipCache: z.boolean().optional(),
    sourcePrompt: z.string().min(1).optional(),
  })
  .strip();

export function createImageObservationRoutes(
  imageObservationService: ImageObservationService,
): Router {
  const router = express.Router();

  router.post(
    "/enhancement/observe-image",
    asyncHandler(async (req: Request, res: Response) => {
      const parsed = requireBody(ImageObservationRequestSchema, req, res);
      if (!parsed.ok) return;

      const { image, skipCache, sourcePrompt } = parsed.value;
      const result = await imageObservationService.observe({
        image,
        ...(skipCache ? { skipCache } : {}),
        ...(sourcePrompt ? { sourcePrompt } : {}),
      });

      const { success, ...rest } = result;
      return res.json({
        success,
        data: rest,
        ...rest,
      });
    }),
  );

  return router;
}
