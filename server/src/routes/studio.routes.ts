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
 * POST   /projects/:projectId/images/:imageId/use-in-session
 *                                     "Use this in the session" — a studio
 *                                     image returns as a picture take
 *                                     (ADR-0022 D4)
 */

import express, { type Request, type Response, type Router } from "express";
import { z } from "zod";
import { asyncHandler } from "@middleware/asyncHandler";
import { requireCreatorId, requireBody } from "@middleware/intake";
import type { StudioService } from "@services/studio/StudioService";
import type { SessionPictureLookup } from "@services/sessions/sessionPictureLookup";
import {
  returnStudioImage,
  type ReturnStudioImageSessionPort,
} from "@services/admission/returnStudioImage";
import type {
  AdmissionIdempotencyPort,
  AdmissionMediaStore,
} from "@services/admission/admitPictureTake";
import {
  StudioTurnSubmissionSchema,
  StudioUseInSessionRequestSchema,
  type StudioTurnSubmission,
} from "@shared/schemas/studio.schemas";
import type { OwnedPictureResolver } from "@services/owned-media";
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

const RunTurnSchema = z
  .object({
    message: z.string().min(1).max(4000),
    /** S-12: attachment ids sent with this message. */
    attachmentIds: z.array(z.string().min(1)).max(14).optional(),
  })
  // The submission identity and captured selection/pin (#115). All optional
  // here so a non-studio caller can still run a turn; the studio client always
  // sends them, and the service converges retries only when submissionId is
  // present.
  .merge(StudioTurnSubmissionSchema.partial());

/** Matched route segments are always non-empty strings; "" never occurs. */
function routeParam(req: Request, name: string): string {
  const value = (req.params as Record<string, unknown>)[name];
  return typeof value === "string" ? value : "";
}

/**
 * The session-side dependencies of "Use this in the session" (ADR-0022
 * decision 4). Injected at the route layer for the same reason the outbound
 * read is: the studio never learns what a session is.
 *
 * All three nullable together. Without them the return door is unavailable,
 * and saying so with a 503 beats an unmounted route's 404 — a creator who
 * pressed the button deserves the reason, not a missing page.
 */
export interface StudioReturnDeps {
  sessionService: ReturnStudioImageSessionPort | null | undefined;
  mediaStore: AdmissionMediaStore | null | undefined;
  idempotency: AdmissionIdempotencyPort | null | undefined;
  /**
   * Issue #125: re-mints a replayed return's `imageUrl` from its durable
   * handle. Independently optional — the return works without it, a replay
   * just keeps its stored (expiring) URL.
   */
  resolver?: OwnedPictureResolver | null | undefined;
}

export function createStudioRouter(
  studioService: StudioService,
  /**
   * The session-side read behind "Refine in the studio". Injected here rather
   * than into StudioService: the studio never reads a session, so the
   * cross-domain join lives at the route layer where it belongs.
   */
  sessionPictures: SessionPictureLookup,
  /** The return leg's session-side dependencies (ADR-0022 decision 4). */
  returnDeps: StudioReturnDeps,
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

      // The submission is assembled from the wire body only when it carries an
      // identity (#115). Absent it, the turn runs unconverged, as before.
      const { submissionId, selectedImageId, pinnedModel } = parsed.value;
      const submission: StudioTurnSubmission | undefined =
        submissionId !== undefined
          ? { submissionId, selectedImageId, pinnedModel }
          : undefined;

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
          submission,
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

  // "Use this in the session" (ADR-0022 decision 4). The creator names only
  // the project and the image; the destination is the project's own origin,
  // because the project already knows which session it came from and a
  // client-supplied one would be a second copy free to disagree.
  router.post(
    "/projects/:projectId/images/:imageId/use-in-session",
    asyncHandler(async (req: Request, res: Response) => {
      const userId = requireCreatorId(req, res);
      if (!userId) return;
      const parsed = requireBody(StudioUseInSessionRequestSchema, req, res);
      if (!parsed.ok) return;

      const { sessionService, mediaStore, idempotency, resolver } = returnDeps;
      if (!sessionService || !mediaStore || !idempotency) {
        res.status(503).json({
          success: false,
          error:
            "Couldn’t use this picture — sessions are unavailable right now. Nothing was saved.",
        });
        return;
      }

      const result = await returnStudioImage(
        {
          studio: studioService,
          sessionService,
          mediaStore,
          idempotency,
          ...(resolver ? { resolver } : {}),
        },
        {
          userId,
          projectId: routeParam(req, "projectId"),
          imageId: routeParam(req, "imageId"),
          ...(parsed.value.onMissingOriginSession
            ? { onMissingOriginSession: parsed.value.onMissingOriginSession }
            : {}),
          ...(parsed.value.confirmedWords
            ? { confirmedWords: parsed.value.confirmedWords }
            : {}),
        },
      );

      switch (result.state) {
        case "returned":
          res.status(201).json({ success: true, data: result.result });
          return;
        case "not-found":
          res
            .status(404)
            .json({ success: false, error: "That picture is not available." });
          return;
        case "refused":
          // Absence, like every other studio refusal: a session id must never
          // become an existence oracle.
          res
            .status(404)
            .json({ success: false, error: "That session is not available." });
          return;
        case "origin-session-missing":
          // `reason` is the discriminator, not the status code — the client
          // turns this one into the creator's choice rather than an error.
          res.status(409).json({
            success: false,
            reason: "origin-session-missing",
            sessionId: result.sessionId,
            error:
              "The session this project came from is gone. Start a new session with this picture instead?",
          });
          return;
        case "needs-confirmed-words":
          // Also a question, not an error (issue #131): a new session's words
          // are the creator's to confirm, never the edit instruction or
          // transform label. `reason` discriminates it from the other 409s;
          // `suggestion` is a from-scratch generate's prompt when one exists,
          // absent otherwise so the creator supplies their own words.
          res.status(409).json({
            success: false,
            reason: "needs-confirmed-words",
            ...(result.suggestion !== undefined
              ? { suggestion: result.suggestion }
              : {}),
            error:
              "Name the session this picture starts — the words it should restore. The instruction that produced it is kept separately.",
          });
          return;
        case "unusable-media":
          res.status(422).json({
            success: false,
            error: `Couldn’t use that image as a first frame — ${result.reason}. A first frame must be a PNG, JPEG or WebP picture.`,
          });
          return;
        case "unavailable":
          res.status(503).json({
            success: false,
            error: `Couldn’t use this picture — ${result.reason}. Nothing was saved.`,
          });
          return;
        case "in_progress":
          res.status(409).json({
            success: false,
            error: "This picture is already being added.",
          });
          return;
        case "conflict":
          res.status(409).json({
            success: false,
            error: "That picture was already returned somewhere else.",
          });
          return;
      }
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
