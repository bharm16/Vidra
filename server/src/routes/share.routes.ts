import express, { type Request, type Response, type Router } from "express";
import { asyncHandler } from "@middleware/asyncHandler";
import { requireRouteParam } from "@middleware/requireRouteParam";
import { requireUserId, type RequestWithUser } from "@middleware/requireUserId";
import { CreateShareRequestSchema } from "@shared/schemas/share.schemas";
import type {
  CreateShareResponse,
  PublicClipDto,
} from "@shared/schemas/share.schemas";
import type { ApiResponse } from "@shared/types/api";
import type { ShareService } from "@services/share/ShareService";

/**
 * Authed mint router — mounted at /api/share (behind apiAuthMiddleware).
 * Only the clip's owner can turn one of their clips into a public share.
 */
export function createShareRouter(shareService: ShareService): Router {
  const router = express.Router();

  router.post(
    "/",
    asyncHandler(async (req: Request, res: Response) => {
      const userId = requireUserId(req as RequestWithUser, res);
      if (!userId) return;
      const parsed = CreateShareRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res
          .status(400)
          .json({ success: false, error: "Invalid share request" });
        return;
      }
      const data = await shareService.mint(userId, parsed.data);
      res.json({
        success: true,
        data,
      } satisfies ApiResponse<CreateShareResponse>);
    }),
  );

  return router;
}

/**
 * Public read router — mounted at /api/public/share (NO auth).
 * Returns only the denormalized clip snapshot (fresh view URL + description),
 * never user-scoped session data, so nothing is exposed without an explicit
 * prior Share that minted the id.
 */
export function createPublicClipRouter(shareService: ShareService): Router {
  const router = express.Router();

  router.get(
    "/:shareId",
    asyncHandler(async (req: Request, res: Response) => {
      const shareId = requireRouteParam(req, res, "shareId");
      if (!shareId) return;
      const clip = await shareService.resolve(shareId);
      if (!clip) {
        res.status(404).json({ success: false, error: "Clip not found" });
        return;
      }
      res.json({
        success: true,
        data: clip,
      } satisfies ApiResponse<PublicClipDto>);
    }),
  );

  return router;
}
