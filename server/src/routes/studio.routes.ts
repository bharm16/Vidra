/**
 * Studio record routes (ADR-0027). Mounted at /api/studio behind
 * apiAuthMiddleware. Studio retired into /app; its records stay readable.
 *
 * GET    /projects                            list the caller's projects
 * GET    /projects/:projectId                 fetch one project
 * DELETE /projects/:projectId                 delete a project and its turns
 * GET    /projects/:projectId/turns           every turn, with fresh URLs
 * GET    /projects/:projectId/turns/:turnId   one turn, with fresh URLs
 */

import express, { type Request, type Response, type Router } from "express";
import { asyncHandler } from "@middleware/asyncHandler";
import { requireCreatorId } from "@middleware/intake";
import type { StudioService } from "@services/studio/StudioService";

/** Matched route segments are always non-empty strings; "" never occurs. */
function routeParam(req: Request, name: string): string {
  const value = (req.params as Record<string, unknown>)[name];
  return typeof value === "string" ? value : "";
}

export function createStudioRouter(studioService: StudioService): Router {
  const router = express.Router();

  router.get(
    "/projects",
    asyncHandler(async (req: Request, res: Response) => {
      const userId = requireCreatorId(req, res);
      if (!userId) return;
      const projects = await studioService.listProjects(userId);
      res.json({ success: true, data: projects });
    }),
  );

  router.get(
    "/projects/:projectId",
    asyncHandler(async (req: Request, res: Response) => {
      const userId = requireCreatorId(req, res);
      if (!userId) return;
      // The view, not the raw record: a bridged project's picture is signed
      // per read, so reopening resolves it however long ago it was bridged.
      const project = await studioService.getProjectView(
        userId,
        routeParam(req, "projectId"),
      );
      res.json({ success: true, data: project });
    }),
  );

  router.delete(
    "/projects/:projectId",
    asyncHandler(async (req: Request, res: Response) => {
      const userId = requireCreatorId(req, res);
      if (!userId) return;
      await studioService.deleteProject(userId, routeParam(req, "projectId"));
      res.json({ success: true, data: { deleted: true } });
    }),
  );

  router.get(
    "/projects/:projectId/turns",
    asyncHandler(async (req: Request, res: Response) => {
      const userId = requireCreatorId(req, res);
      if (!userId) return;
      const turns = await studioService.listTurnsWithFreshUrls(
        userId,
        routeParam(req, "projectId"),
      );
      res.json({ success: true, data: turns });
    }),
  );

  router.get(
    "/projects/:projectId/turns/:turnId",
    asyncHandler(async (req: Request, res: Response) => {
      const userId = requireCreatorId(req, res);
      if (!userId) return;
      const turn = await studioService.getTurnWithFreshUrls(
        userId,
        routeParam(req, "projectId"),
        routeParam(req, "turnId"),
      );
      res.json({ success: true, data: turn });
    }),
  );

  return router;
}
