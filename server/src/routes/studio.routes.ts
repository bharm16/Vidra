/**
 * Studio routes (ADR-0019). Mounted at /api/studio behind apiAuthMiddleware.
 *
 * POST   /projects                    create a project
 * POST   /projects/from-session-picture
 *                                     "Refine in the studio" — a project born
 *                                     from a session picture (ADR-0022 D4)
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
import { requireCreatorId, requireBody } from "@middleware/intake";
import type { StudioService } from "@services/studio/StudioService";
import type { SessionPictureLookup } from "@services/sessions/sessionPictureLookup";
import { STUDIO_MODEL_SLUGS } from "@services/studio/types";

const CreateProjectSchema = z.object({
  title: z.string().max(120).optional(),
});

/**
 * ADR-0022 decision 4. The creator names the session and the take; the
 * words-version is read from the session, never accepted from the wire — the
 * session is the only thing that knows which version a take is filed under.
 */
const CreateFromSessionPictureSchema = z.object({
  sessionId: z.string().min(1).max(200),
  generationId: z.string().min(1).max(200),
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

const AddAttachmentSchema = z.object({
  storagePath: z.string().min(1).max(500),
  filename: z.string().min(1).max(200),
});

const RunTurnSchema = z.object({
  message: z.string().min(1).max(4000),
  /** S-12: attachment ids sent with this message. */
  attachmentIds: z.array(z.string().min(1)).max(14).optional(),
});

/** Matched route segments are always non-empty strings; "" never occurs. */
function routeParam(req: Request, name: string): string {
  const value = (req.params as Record<string, unknown>)[name];
  return typeof value === "string" ? value : "";
}

export function createStudioRouter(
  studioService: StudioService,
  /**
   * The session-side read behind "Refine in the studio". Injected here rather
   * than into StudioService: the studio never reads a session, so the
   * cross-domain join lives at the route layer where it belongs.
   */
  sessionPictures: SessionPictureLookup,
): Router {
  const router = express.Router();

  router.get(
    "/models",
    asyncHandler(async (req: Request, res: Response) => {
      const userId = requireCreatorId(req, res);
      if (!userId) return;
      res.json({ success: true, data: studioService.getModelRoster() });
    }),
  );

  router.post(
    "/projects",
    asyncHandler(async (req: Request, res: Response) => {
      const userId = requireCreatorId(req, res);
      if (!userId) return;
      const parsed = requireBody(CreateProjectSchema, req, res);
      if (!parsed.ok) return;
      const project = await studioService.createProject(
        userId,
        parsed.value.title,
      );
      res.status(201).json({ success: true, data: project });
    }),
  );

  // "Refine in the studio" (ADR-0022 decision 4). Declared before
  // /projects/:projectId so the literal segment is never read as an id.
  // Invoking twice for the same take returns the same project — the studio
  // service derives the project's identity from the take, so a double-click
  // and a retry after a lost response are the same request.
  router.post(
    "/projects/from-session-picture",
    asyncHandler(async (req: Request, res: Response) => {
      const userId = requireCreatorId(req, res);
      if (!userId) return;
      const parsed = requireBody(CreateFromSessionPictureSchema, req, res);
      if (!parsed.ok) return;

      const picture = await sessionPictures.findOwnedSessionPicture(
        userId,
        parsed.value.sessionId,
        parsed.value.generationId,
      );
      // A foreign session, a missing one, and a take this session does not
      // hold all read the same: absence. Matching the studio's own posture
      // keeps the endpoint from answering "whose is this?".
      if (!picture) {
        res
          .status(404)
          .json({ success: false, error: "Session picture not found" });
        return;
      }

      const project = await studioService.createProjectFromSessionPicture(
        userId,
        { sessionId: parsed.value.sessionId, ...picture },
      );
      res.status(201).json({
        success: true,
        data: await studioService.getProjectView(userId, project.id),
      });
    }),
  );

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

  router.patch(
    "/projects/:projectId",
    asyncHandler(async (req: Request, res: Response) => {
      const userId = requireCreatorId(req, res);
      if (!userId) return;
      const parsed = requireBody(PatchProjectSchema, req, res);
      if (!parsed.ok) return;
      const project = await studioService.updateProject(
        userId,
        routeParam(req, "projectId"),
        parsed.value,
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

  // S-12: register a user-uploaded reference image. The bytes are already
  // in GCS (client PUT via /api/storage/upload-url); this records it on the
  // project so the LLM can use it as an edit/reference source.
  router.post(
    "/projects/:projectId/attachments",
    asyncHandler(async (req: Request, res: Response) => {
      const userId = requireCreatorId(req, res);
      if (!userId) return;
      const parsed = requireBody(AddAttachmentSchema, req, res);
      if (!parsed.ok) return;
      const attachment = await studioService.addAttachment(
        userId,
        routeParam(req, "projectId"),
        parsed.value,
      );
      res.status(201).json({ success: true, data: attachment });
    }),
  );

  router.post(
    "/projects/:projectId/turns",
    asyncHandler(async (req: Request, res: Response) => {
      const userId = requireCreatorId(req, res);
      if (!userId) return;
      const parsed = requireBody(RunTurnSchema, req, res);
      if (!parsed.ok) return;

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
          parsed.value.message,
          {
            onThinkingStart: () => writeEvent({ type: "thinking-start" }),
            onThinkingDelta: (delta) => writeEvent({ type: "thinking", delta }),
          },
          parsed.value.attachmentIds,
        );
        writeEvent({ type: "accepted", turnId, decision });
        res.end();
      } catch (error) {
        // Nothing has been written yet — hand the throw back to asyncHandler
        // so errorHandler applies PII redaction, structured logging and the
        // canonical envelope. It already honours `statusCode` on the error.
        if (!streaming) {
          throw error;
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
