/**
 * Studio routes (ADR-0019). Mounted at /api/studio behind apiAuthMiddleware.
 *
 * POST   /projects                    create a project
 * GET    /projects                    list the caller's projects
 * GET    /projects/:projectId         fetch one project
 * PATCH  /projects/:projectId         rename / pin model / set selection
 * DELETE /projects/:projectId         delete a project and its turns
 * POST   /projects/:projectId/turns   run a turn — NDJSON stream: thinking
 *                                     deltas, then accepted{turnId,decision}
 *                                     (async: image
 *                                     calls settle in the background)
 * GET    /projects/:projectId/turns/:turnId   poll a turn
 */

import express, { type Request, type Response, type Router } from "express";
import { z } from "zod";
import { asyncHandler } from "@middleware/asyncHandler";
import type { StudioService } from "@services/studio/StudioService";
import { STUDIO_MODEL_SLUGS } from "@services/studio/types";

const CreateProjectSchema = z.object({
  title: z.string().max(120).optional(),
});

const PatchProjectSchema = z
  .object({
    title: z.string().min(1).max(120).optional(),
    // null clears the pin (back to Auto); absent leaves it unchanged.
    pinnedModel: z.enum(STUDIO_MODEL_SLUGS).nullable().optional(),
    // null clears the selection; the id must exist in this project (M4 —
    // edits source from the persisted selection).
    selectedImageId: z.string().min(1).nullable().optional(),
  })
  .refine(
    (value) =>
      value.title !== undefined ||
      value.pinnedModel !== undefined ||
      value.selectedImageId !== undefined,
    { message: "Nothing to update" },
  );

const RunTurnSchema = z.object({
  message: z.string().min(1).max(4000),
});

interface AuthedRequest extends Request {
  user?: { uid: string };
}

function requireUserId(req: AuthedRequest, res: Response): string | null {
  const uid = req.user?.uid;
  if (!uid) {
    res.status(401).json({ success: false, error: "Authentication required" });
    return null;
  }
  return uid;
}

/** Matched route segments are always non-empty strings; "" never occurs. */
function routeParam(req: Request, name: string): string {
  const value = (req.params as Record<string, unknown>)[name];
  return typeof value === "string" ? value : "";
}

function sendError(res: Response, error: unknown): void {
  const statusCode =
    typeof (error as { statusCode?: number }).statusCode === "number"
      ? ((error as { statusCode: number }).statusCode ?? 500)
      : 500;
  const message =
    error instanceof Error ? error.message : "Unexpected studio error";
  res.status(statusCode).json({ success: false, error: message });
}

export function createStudioRouter(studioService: StudioService): Router {
  const router = express.Router();

  router.get(
    "/models",
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const userId = requireUserId(req, res);
      if (!userId) return;
      res.json({ success: true, data: studioService.getModelRoster() });
    }),
  );

  router.post(
    "/projects",
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const userId = requireUserId(req, res);
      if (!userId) return;
      const parsed = CreateProjectSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json({ success: false, error: "Invalid body" });
        return;
      }
      const project = await studioService.createProject(
        userId,
        parsed.data.title,
      );
      res.status(201).json({ success: true, data: project });
    }),
  );

  router.get(
    "/projects",
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const userId = requireUserId(req, res);
      if (!userId) return;
      const projects = await studioService.listProjects(userId);
      res.json({ success: true, data: projects });
    }),
  );

  router.get(
    "/projects/:projectId",
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const userId = requireUserId(req, res);
      if (!userId) return;
      try {
        const project = await studioService.getProject(
          userId,
          routeParam(req, "projectId"),
        );
        res.json({ success: true, data: project });
      } catch (error) {
        sendError(res, error);
      }
    }),
  );

  router.patch(
    "/projects/:projectId",
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const userId = requireUserId(req, res);
      if (!userId) return;
      const parsed = PatchProjectSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json({ success: false, error: "Invalid body" });
        return;
      }
      try {
        const project = await studioService.updateProject(
          userId,
          routeParam(req, "projectId"),
          parsed.data,
        );
        res.json({ success: true, data: project });
      } catch (error) {
        sendError(res, error);
      }
    }),
  );

  router.delete(
    "/projects/:projectId",
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const userId = requireUserId(req, res);
      if (!userId) return;
      try {
        await studioService.deleteProject(userId, routeParam(req, "projectId"));
        res.json({ success: true, data: { deleted: true } });
      } catch (error) {
        sendError(res, error);
      }
    }),
  );

  router.post(
    "/projects/:projectId/turns",
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const userId = requireUserId(req, res);
      if (!userId) return;
      const parsed = RunTurnSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json({ success: false, error: "Invalid body" });
        return;
      }

      // NDJSON response: `thinking` deltas stream as the LLM emits them,
      // then one terminal `accepted` (turnId + final decision — image calls
      // continue in the background, poll GET /turns/:turnId) or `error`
      // event. Errors BEFORE the first event fall back to plain JSON so
      // non-streaming failures keep today's status codes.
      let streaming = false;
      const writeEvent = (event: Record<string, unknown>): void => {
        if (!streaming) {
          streaming = true;
          res.status(200);
          res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
          res.setHeader("Cache-Control", "no-cache");
          res.flushHeaders();
        }
        res.write(`${JSON.stringify(event)}\n`);
      };

      try {
        const { turnId, decision } = await studioService.runTurn(
          userId,
          routeParam(req, "projectId"),
          parsed.data.message,
          {
            onThinkingStart: () => writeEvent({ type: "thinking-start" }),
            onThinkingDelta: (delta) => writeEvent({ type: "thinking", delta }),
          },
        );
        writeEvent({ type: "accepted", turnId, decision });
        res.end();
      } catch (error) {
        if (!streaming) {
          sendError(res, error);
          return;
        }
        const statusCode =
          typeof (error as { statusCode?: number }).statusCode === "number"
            ? (error as { statusCode: number }).statusCode
            : 500;
        writeEvent({
          type: "error",
          error: error instanceof Error ? error.message : "Studio turn failed",
          statusCode,
        });
        res.end();
      }
    }),
  );

  router.get(
    "/projects/:projectId/turns",
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const userId = requireUserId(req, res);
      if (!userId) return;
      try {
        const turns = await studioService.listTurnsWithFreshUrls(
          userId,
          routeParam(req, "projectId"),
        );
        res.json({ success: true, data: turns });
      } catch (error) {
        sendError(res, error);
      }
    }),
  );

  router.get(
    "/projects/:projectId/turns/:turnId",
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const userId = requireUserId(req, res);
      if (!userId) return;
      try {
        const turn = await studioService.getTurnWithFreshUrls(
          userId,
          routeParam(req, "projectId"),
          routeParam(req, "turnId"),
        );
        res.json({ success: true, data: turn });
      } catch (error) {
        sendError(res, error);
      }
    }),
  );

  return router;
}
