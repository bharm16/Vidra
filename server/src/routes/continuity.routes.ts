import express, { type Request, type Response, type Router } from "express";
import { asyncHandler } from "@middleware/asyncHandler";
import type { ContinuitySessionService } from "@services/continuity/ContinuitySessionService";
import type { UserCreditService } from "@services/credits/UserCreditService";
import {
  ContinuitySessionInputSchema,
  RequestWithUser,
  handleCreateSceneProxy,
  handleCreateShot,
  handleGenerateShot,
  handlePreviewSceneProxy,
  handleUpdatePrimaryStyleReference,
  handleUpdateSessionSettings,
  handleUpdateShot,
  handleUpdateStyleReference,
  requireSessionForUser,
  requireUserId,
} from "./continuity/continuityRouteShared";

export function createContinuityRoutes(
  service: ContinuitySessionService,
  userCreditService?: UserCreditService | null,
): Router {
  const router = express.Router();
  const requireShotId = (req: Request, res: Response): string | null => {
    const shotId = req.params.shotId;
    if (typeof shotId !== "string" || shotId.trim().length === 0) {
      res.status(400).json({ success: false, error: "Invalid shotId" });
      return null;
    }
    return shotId;
  };

  router.post(
    "/sessions",
    asyncHandler(async (req: Request, res: Response) => {
      const userId = requireUserId(req as RequestWithUser, res);
      if (!userId) return;

      const parsed = ContinuitySessionInputSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: "Invalid request",
          details: parsed.error.issues,
        });
        return;
      }

      const {
        name,
        description,
        sourceVideoId,
        sourceImageUrl,
        initialPrompt,
        settings,
      } = parsed.data;

      const session = await service.createSession(userId, {
        name,
        ...(typeof description === "string" ? { description } : {}),
        ...(typeof sourceVideoId === "string" ? { sourceVideoId } : {}),
        ...(typeof sourceImageUrl === "string" ? { sourceImageUrl } : {}),
        ...(typeof initialPrompt === "string" ? { initialPrompt } : {}),
        ...(settings ? { settings } : {}),
      });

      res.status(201).json({ success: true, data: session });
    }),
  );

  router.get(
    "/sessions",
    asyncHandler(async (req: Request, res: Response) => {
      const userId = requireUserId(req as RequestWithUser, res);
      if (!userId) return;

      const sessions = await service.getUserSessions(userId);
      res.json({ success: true, data: sessions });
    }),
  );

  router.get(
    "/sessions/:sessionId",
    asyncHandler(async (req: Request, res: Response) => {
      const session = await requireSessionForUser(service, req, res);
      if (!session) return;
      res.json({ success: true, data: session });
    }),
  );

  router.post(
    "/sessions/:sessionId/shots",
    asyncHandler(async (req: Request, res: Response) => {
      const session = await requireSessionForUser(service, req, res);
      if (!session) return;
      await handleCreateShot(service, req, res, {
        sessionId: session.id,
        status: 201,
      });
    }),
  );

  router.patch(
    "/sessions/:sessionId/shots/:shotId",
    asyncHandler(async (req: Request, res: Response) => {
      const session = await requireSessionForUser(service, req, res);
      if (!session) return;
      const shotId = requireShotId(req, res);
      if (!shotId) return;
      await handleUpdateShot(service, req, res, {
        sessionId: session.id,
        shotId,
      });
    }),
  );

  router.post(
    "/sessions/:sessionId/shots/:shotId/generate",
    asyncHandler(async (req: Request, res: Response) => {
      const session = await requireSessionForUser(service, req, res);
      if (!session) return;
      await handleGenerateShot(service, session, req, res, userCreditService);
    }),
  );

  router.put(
    "/sessions/:sessionId/shots/:shotId/style-reference",
    asyncHandler(async (req: Request, res: Response) => {
      const session = await requireSessionForUser(service, req, res);
      if (!session) return;
      const shotId = requireShotId(req, res);
      if (!shotId) return;
      await handleUpdateStyleReference(service, req, res, {
        sessionId: session.id,
        shotId,
      });
    }),
  );

  router.put(
    "/sessions/:sessionId/settings",
    asyncHandler(async (req: Request, res: Response) => {
      const authorizedSession = await requireSessionForUser(service, req, res);
      if (!authorizedSession) return;
      await handleUpdateSessionSettings(service, req, res, {
        sessionId: authorizedSession.id,
      });
    }),
  );

  router.put(
    "/sessions/:sessionId/style-reference",
    asyncHandler(async (req: Request, res: Response) => {
      const authorizedSession = await requireSessionForUser(service, req, res);
      if (!authorizedSession) return;
      await handleUpdatePrimaryStyleReference(service, req, res, {
        sessionId: authorizedSession.id,
      });
    }),
  );

  router.post(
    "/sessions/:sessionId/scene-proxy",
    asyncHandler(async (req: Request, res: Response) => {
      const authorizedSession = await requireSessionForUser(service, req, res);
      if (!authorizedSession) return;
      await handleCreateSceneProxy(service, req, res, {
        sessionId: authorizedSession.id,
        status: 201,
      });
    }),
  );

  router.post(
    "/sessions/:sessionId/shots/:shotId/scene-proxy-preview",
    asyncHandler(async (req: Request, res: Response) => {
      const authorizedSession = await requireSessionForUser(service, req, res);
      if (!authorizedSession) return;
      const shotId = requireShotId(req, res);
      if (!shotId) return;
      await handlePreviewSceneProxy(service, req, res, {
        sessionId: authorizedSession.id,
        shotId,
      });
    }),
  );

  return router;
}

export default createContinuityRoutes;
