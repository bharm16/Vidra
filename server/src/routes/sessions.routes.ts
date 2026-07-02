import express, { type Request, type Response, type Router } from "express";
import { z } from "zod";
import { asyncHandler } from "@middleware/asyncHandler";
import { requireRouteParam } from "@middleware/requireRouteParam";
import {
  SessionAccessDeniedError,
  SessionNotFoundError,
  type SessionService,
} from "@services/sessions/SessionService";
import type {
  SessionCreateRequest,
  SessionHighlightUpdate,
  SessionListOptions,
  SessionOutputUpdate,
  SessionPromptUpdate,
  SessionUpdateRequest,
  SessionVersionsUpdate,
} from "@services/sessions/types";
import type { ContinuitySessionService } from "@services/continuity/ContinuitySessionService";
import type { CreateSessionRequest as ContinuityCreateSessionRequest } from "@services/continuity/types";
import type { UserCreditService } from "@services/credits/UserCreditService";
import type { SessionDto } from "@shared/types/session";
import type { ApiResponse } from "@shared/types/api";
import { formatValidationDetails } from "@utils/apiResponseHelpers";
import { logger } from "@infrastructure/Logger";
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
import { handleGenerateShotStream } from "./continuity/handleGenerateShotStream";

const CreateSessionSchema = z
  .object({
    name: z.string().optional(),
    prompt: z.record(z.string(), z.unknown()).optional(),
  })
  .strip();

const CreateContinuitySessionSchema = ContinuitySessionInputSchema.extend({
  sessionId: z.string().optional(),
}).strip();

const UpdateSessionSchema = z
  .object({
    name: z.string().optional(),
    description: z.string().optional(),
    status: z.enum(["active", "completed", "archived"]).optional(),
    prompt: z.record(z.string(), z.unknown()).optional(),
  })
  .strip();

const UpdatePromptSchema = z
  .object({
    title: z.string().nullable().optional(),
    input: z.string().optional(),
    output: z.string().optional(),
    targetModel: z.string().nullable().optional(),
    generationParams: z.record(z.string(), z.unknown()).nullable().optional(),
    keyframes: z.array(z.record(z.string(), z.unknown())).nullable().optional(),
    mode: z.string().optional(),
  })
  .strip();

const UpdateHighlightsSchema = z
  .object({
    highlightCache: z.record(z.string(), z.unknown()).nullable().optional(),
    versionEntry: z.object({ timestamp: z.string().optional() }).optional(),
  })
  .strip();

const UpdateOutputSchema = z
  .object({
    output: z.string().optional(),
  })
  .strip();

const UpdateVersionsSchema = z
  .object({
    versions: z.array(z.record(z.string(), z.unknown())).optional(),
  })
  .strip();

function handleSessionMutationError(error: unknown, res: Response): boolean {
  if (error instanceof SessionAccessDeniedError) {
    res.status(403).json({
      success: false,
      error: "Access denied",
    } satisfies ApiResponse<never>);
    return true;
  }
  if (error instanceof SessionNotFoundError) {
    res.status(404).json({
      success: false,
      error: "Session not found",
    } satisfies ApiResponse<never>);
    return true;
  }
  return false;
}

/**
 * Canonical 400 for schema validation failures: `details` is the flattened
 * string the shared ApiResponse contract requires; the structured Zod issues
 * are logged server-side instead of leaking onto the wire.
 */
function respondInvalidRequest(res: Response, error: z.ZodError): void {
  logger.debug("Session request validation failed", {
    issues: error.issues,
  });
  res.status(400).json({
    success: false,
    error: "Invalid request",
    details: formatValidationDetails(error.issues),
  } satisfies ApiResponse<never>);
}

function toContinuityCreateSessionRequest(
  data: z.infer<typeof CreateContinuitySessionSchema>,
): ContinuityCreateSessionRequest {
  return {
    name: data.name,
    ...(typeof data.description === "string"
      ? { description: data.description }
      : {}),
    ...(typeof data.sourceVideoId === "string"
      ? { sourceVideoId: data.sourceVideoId }
      : {}),
    ...(typeof data.sourceImageUrl === "string"
      ? { sourceImageUrl: data.sourceImageUrl }
      : {}),
    ...(typeof data.initialPrompt === "string"
      ? { initialPrompt: data.initialPrompt }
      : {}),
    ...(data.settings ? { settings: data.settings } : {}),
    ...(typeof data.sessionId === "string"
      ? { sessionId: data.sessionId }
      : {}),
  };
}

function toSessionCreateRequest(
  data: z.infer<typeof CreateSessionSchema>,
): SessionCreateRequest {
  return {
    ...(typeof data.name === "string" ? { name: data.name } : {}),
    ...(data.prompt
      ? {
          prompt: data.prompt as unknown as NonNullable<
            SessionCreateRequest["prompt"]
          >,
        }
      : {}),
  };
}

function toSessionUpdateRequest(
  data: z.infer<typeof UpdateSessionSchema>,
): SessionUpdateRequest {
  return {
    ...(data.name !== undefined ? { name: data.name } : {}),
    ...(data.description !== undefined
      ? { description: data.description }
      : {}),
    ...(data.status !== undefined ? { status: data.status } : {}),
    ...(data.prompt !== undefined
      ? {
          prompt: data.prompt as unknown as NonNullable<
            SessionUpdateRequest["prompt"]
          >,
        }
      : {}),
  };
}

function toSessionPromptUpdate(
  data: z.infer<typeof UpdatePromptSchema>,
): SessionPromptUpdate {
  return {
    ...(data.title !== undefined ? { title: data.title } : {}),
    ...(data.input !== undefined ? { input: data.input } : {}),
    ...(data.output !== undefined ? { output: data.output } : {}),
    ...(data.targetModel !== undefined
      ? { targetModel: data.targetModel }
      : {}),
    ...(data.generationParams !== undefined
      ? { generationParams: data.generationParams }
      : {}),
    ...(data.keyframes !== undefined
      ? { keyframes: data.keyframes as SessionPromptUpdate["keyframes"] }
      : {}),
    ...(data.mode !== undefined ? { mode: data.mode } : {}),
  };
}

function toSessionHighlightUpdate(
  data: z.infer<typeof UpdateHighlightsSchema>,
): SessionHighlightUpdate {
  const versionEntry = data.versionEntry
    ? {
        ...(data.versionEntry.timestamp !== undefined
          ? { timestamp: data.versionEntry.timestamp }
          : {}),
      }
    : undefined;
  return {
    ...(data.highlightCache !== undefined
      ? { highlightCache: data.highlightCache }
      : {}),
    ...(versionEntry ? { versionEntry } : {}),
  };
}

function toSessionOutputUpdate(
  data: z.infer<typeof UpdateOutputSchema>,
): SessionOutputUpdate {
  return {
    ...(data.output !== undefined ? { output: data.output } : {}),
  };
}

function toSessionVersionsUpdate(
  data: z.infer<typeof UpdateVersionsSchema>,
): SessionVersionsUpdate {
  return {
    ...(data.versions !== undefined
      ? {
          versions: data.versions as unknown as NonNullable<
            SessionVersionsUpdate["versions"]
          >,
        }
      : {}),
  };
}

export function createSessionRoutes(
  sessionService: SessionService,
  continuityService: ContinuitySessionService | null = null,
  userCreditService?: UserCreditService | null,
): Router {
  const router = express.Router();

  if (continuityService) {
    router.post(
      "/continuity",
      asyncHandler(async (req: Request, res: Response) => {
        const userId = requireUserId(req as RequestWithUser, res);
        if (!userId) return;
        const parsed = CreateContinuitySessionSchema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({
            success: false,
            error: "Invalid request",
            details: parsed.error.issues,
          });
          return;
        }
        if (parsed.data.sessionId) {
          const existing = await sessionService.getSession(
            parsed.data.sessionId,
          );
          if (!existing) {
            res
              .status(404)
              .json({ success: false, error: "Session not found" });
            return;
          }
          if (existing.userId !== userId) {
            res.status(403).json({ success: false, error: "Access denied" });
            return;
          }
        }
        const continuityRequest = toContinuityCreateSessionRequest(parsed.data);
        const continuitySession = await continuityService.createSession(
          userId,
          continuityRequest,
        );
        const session = await sessionService.getSession(continuitySession.id);
        if (!session) {
          res.status(500).json({
            success: false,
            error: "Session not available after creation",
          });
          return;
        }
        res.json({
          success: true,
          data: sessionService.toDto(session),
        } satisfies ApiResponse<SessionDto>);
      }),
    );
  }

  router.get(
    "/",
    asyncHandler(async (req: Request, res: Response) => {
      const userId = requireUserId(req as RequestWithUser, res);
      if (!userId) return;
      const parsedLimit =
        typeof req.query.limit === "string"
          ? Number(req.query.limit)
          : undefined;
      const limit = Number.isFinite(parsedLimit) ? parsedLimit : undefined;
      const includeContinuity = req.query.includeContinuity !== "false";
      const includePrompt = req.query.includePrompt !== "false";
      const listOptions: SessionListOptions = {
        includeContinuity,
        includePrompt,
        ...(limit !== undefined ? { limit } : {}),
      };
      const sessions = await sessionService.listSessions(userId, listOptions);
      res.json({
        success: true,
        data: sessions.map((session) => sessionService.toDto(session)),
      } satisfies ApiResponse<SessionDto[]>);
    }),
  );

  router.get(
    "/by-prompt/:uuid",
    asyncHandler(async (req: Request, res: Response) => {
      const userId = requireUserId(req as RequestWithUser, res);
      if (!userId) return;
      const uuid = requireRouteParam(req, res, "uuid");
      if (!uuid) return;
      const session = await sessionService.getSessionByPromptUuid(userId, uuid);
      if (!session) {
        res.status(404).json({ success: false, error: "Session not found" });
        return;
      }
      res.json({
        success: true,
        data: sessionService.toDto(session),
      } satisfies ApiResponse<SessionDto>);
    }),
  );

  router.get(
    "/:sessionId",
    asyncHandler(async (req: Request, res: Response) => {
      const userId = requireUserId(req as RequestWithUser, res);
      if (!userId) return;
      const sessionId = requireRouteParam(req, res, "sessionId");
      if (!sessionId) return;
      const session = await sessionService.getSession(sessionId);
      if (!session) {
        res.status(404).json({ success: false, error: "Session not found" });
        return;
      }
      if (session.userId !== userId) {
        const allowCrossUser =
          process.env.NODE_ENV !== "production" &&
          process.env.ALLOW_DEV_CROSS_USER_SESSIONS === "true";
        if (!allowCrossUser) {
          res.status(403).json({ success: false, error: "Access denied" });
          return;
        }
        logger.warn("Bypassing session ownership check in development", {
          sessionId: session.id,
          sessionUserId: session.userId,
          requestUserId: userId,
        });
      }
      res.json({
        success: true,
        data: sessionService.toDto(session),
      } satisfies ApiResponse<SessionDto>);
    }),
  );

  router.post(
    "/",
    asyncHandler(async (req: Request, res: Response) => {
      const userId = requireUserId(req as RequestWithUser, res);
      if (!userId) return;
      const parsed = CreateSessionSchema.safeParse(req.body);
      if (!parsed.success) {
        respondInvalidRequest(res, parsed.error);
        return;
      }
      const session = await sessionService.createPromptSession(
        userId,
        toSessionCreateRequest(parsed.data),
      );
      res.json({
        success: true,
        data: sessionService.toDto(session),
      } satisfies ApiResponse<SessionDto>);
    }),
  );

  router.patch(
    "/:sessionId",
    asyncHandler(async (req: Request, res: Response) => {
      const userId = requireUserId(req as RequestWithUser, res);
      if (!userId) return;
      const parsed = UpdateSessionSchema.safeParse(req.body);
      if (!parsed.success) {
        respondInvalidRequest(res, parsed.error);
        return;
      }
      const sessionId = requireRouteParam(req, res, "sessionId");
      if (!sessionId) return;
      try {
        const session = await sessionService.updateSessionForUser(
          userId,
          sessionId,
          toSessionUpdateRequest(parsed.data),
        );
        res.json({
          success: true,
          data: sessionService.toDto(session),
        } satisfies ApiResponse<SessionDto>);
      } catch (error) {
        if (handleSessionMutationError(error, res)) return;
        throw error;
      }
    }),
  );

  router.delete(
    "/:sessionId",
    asyncHandler(async (req: Request, res: Response) => {
      const userId = requireUserId(req as RequestWithUser, res);
      if (!userId) return;
      const sessionId = requireRouteParam(req, res, "sessionId");
      if (!sessionId) return;
      try {
        await sessionService.deleteSessionForUser(userId, sessionId);
        res.json({
          success: true,
          data: { deleted: true },
        } satisfies ApiResponse<{ deleted: true }>);
      } catch (error) {
        if (handleSessionMutationError(error, res)) return;
        throw error;
      }
    }),
  );

  router.patch(
    "/:sessionId/prompt",
    asyncHandler(async (req: Request, res: Response) => {
      const userId = requireUserId(req as RequestWithUser, res);
      if (!userId) return;
      const parsed = UpdatePromptSchema.safeParse(req.body);
      if (!parsed.success) {
        respondInvalidRequest(res, parsed.error);
        return;
      }
      const sessionId = requireRouteParam(req, res, "sessionId");
      if (!sessionId) return;
      try {
        const session = await sessionService.updatePromptForUser(
          userId,
          sessionId,
          toSessionPromptUpdate(parsed.data),
        );
        res.json({
          success: true,
          data: sessionService.toDto(session),
        } satisfies ApiResponse<SessionDto>);
      } catch (error) {
        if (handleSessionMutationError(error, res)) return;
        throw error;
      }
    }),
  );

  router.patch(
    "/:sessionId/highlights",
    asyncHandler(async (req: Request, res: Response) => {
      const userId = requireUserId(req as RequestWithUser, res);
      if (!userId) return;
      const parsed = UpdateHighlightsSchema.safeParse(req.body);
      if (!parsed.success) {
        respondInvalidRequest(res, parsed.error);
        return;
      }
      const sessionId = requireRouteParam(req, res, "sessionId");
      if (!sessionId) return;
      try {
        const session = await sessionService.updateHighlightsForUser(
          userId,
          sessionId,
          toSessionHighlightUpdate(parsed.data),
        );
        res.json({
          success: true,
          data: sessionService.toDto(session),
        } satisfies ApiResponse<SessionDto>);
      } catch (error) {
        if (handleSessionMutationError(error, res)) return;
        throw error;
      }
    }),
  );

  router.patch(
    "/:sessionId/output",
    asyncHandler(async (req: Request, res: Response) => {
      const userId = requireUserId(req as RequestWithUser, res);
      if (!userId) return;
      const parsed = UpdateOutputSchema.safeParse(req.body);
      if (!parsed.success) {
        respondInvalidRequest(res, parsed.error);
        return;
      }
      const sessionId = requireRouteParam(req, res, "sessionId");
      if (!sessionId) return;
      try {
        const session = await sessionService.updateOutputForUser(
          userId,
          sessionId,
          toSessionOutputUpdate(parsed.data),
        );
        res.json({
          success: true,
          data: sessionService.toDto(session),
        } satisfies ApiResponse<SessionDto>);
      } catch (error) {
        if (handleSessionMutationError(error, res)) return;
        throw error;
      }
    }),
  );

  router.patch(
    "/:sessionId/versions",
    asyncHandler(async (req: Request, res: Response) => {
      const userId = requireUserId(req as RequestWithUser, res);
      if (!userId) return;
      const parsed = UpdateVersionsSchema.safeParse(req.body);
      if (!parsed.success) {
        respondInvalidRequest(res, parsed.error);
        return;
      }
      const sessionId = requireRouteParam(req, res, "sessionId");
      if (!sessionId) return;
      try {
        const session = await sessionService.updateVersionsForUser(
          userId,
          sessionId,
          toSessionVersionsUpdate(parsed.data),
        );
        res.json({
          success: true,
          data: sessionService.toDto(session),
        } satisfies ApiResponse<SessionDto>);
      } catch (error) {
        if (handleSessionMutationError(error, res)) return;
        throw error;
      }
    }),
  );

  if (continuityService) {
    // Continuity operations (session-scoped)
    router.post(
      "/:sessionId/shots",
      asyncHandler(async (req: Request, res: Response) => {
        const session = await requireSessionForUser(
          continuityService,
          req,
          res,
        );
        if (!session) return;
        await handleCreateShot(continuityService, req, res, {
          sessionId: session.id,
          status: 200,
        });
      }),
    );

    router.patch(
      "/:sessionId/shots/:shotId",
      asyncHandler(async (req: Request, res: Response) => {
        const session = await requireSessionForUser(
          continuityService,
          req,
          res,
        );
        if (!session) return;
        const shotId = requireRouteParam(req, res, "shotId");
        if (!shotId) return;
        await handleUpdateShot(continuityService, req, res, {
          sessionId: session.id,
          shotId,
        });
      }),
    );

    router.post(
      "/:sessionId/shots/:shotId/generate",
      asyncHandler(async (req: Request, res: Response) => {
        const session = await requireSessionForUser(
          continuityService,
          req,
          res,
        );
        if (!session) return;
        await handleGenerateShot(
          continuityService,
          session,
          req,
          res,
          userCreditService,
        );
      }),
    );

    router.get(
      "/:sessionId/shots/:shotId/status",
      asyncHandler(async (req: Request, res: Response) => {
        const session = await requireSessionForUser(
          continuityService,
          req,
          res,
        );
        if (!session) return;
        const shotId = requireRouteParam(req, res, "shotId");
        if (!shotId) return;
        const shot = session.shots.find((candidate) => candidate.id === shotId);
        if (!shot) {
          res.status(404).json({ success: false, error: "Shot not found" });
          return;
        }

        // Status reads are eventually consistent with persisted generator checkpoints.
        res.json({
          success: true,
          data: {
            shotId: shot.id,
            status: shot.status,
            continuityMechanismUsed: shot.continuityMechanismUsed ?? null,
            styleScore: shot.styleScore ?? null,
            identityScore: shot.identityScore ?? null,
            styleDegraded: shot.styleDegraded ?? false,
            styleDegradedReason: shot.styleDegradedReason ?? null,
            generatedKeyframeUrl: shot.generatedKeyframeUrl ?? null,
            frameBridgeUrl: shot.frameBridge?.frameUrl ?? null,
            retryCount: shot.retryCount ?? 0,
            error: shot.error ?? null,
          },
        });
      }),
    );

    router.post(
      "/:sessionId/shots/:shotId/generate-stream",
      asyncHandler(async (req: Request, res: Response) => {
        const session = await requireSessionForUser(
          continuityService,
          req,
          res,
        );
        if (!session) return;
        await handleGenerateShotStream(
          continuityService,
          session,
          req,
          res,
          userCreditService,
        );
      }),
    );

    router.post(
      "/:sessionId/shots/:shotId/scene-proxy-preview",
      asyncHandler(async (req: Request, res: Response) => {
        const session = await requireSessionForUser(
          continuityService,
          req,
          res,
        );
        if (!session) return;
        const shotId = requireRouteParam(req, res, "shotId");
        if (!shotId) return;
        await handlePreviewSceneProxy(continuityService, req, res, {
          sessionId: session.id,
          shotId,
        });
      }),
    );

    router.put(
      "/:sessionId/shots/:shotId/style-reference",
      asyncHandler(async (req: Request, res: Response) => {
        const session = await requireSessionForUser(
          continuityService,
          req,
          res,
        );
        if (!session) return;
        const shotId = requireRouteParam(req, res, "shotId");
        if (!shotId) return;
        await handleUpdateStyleReference(continuityService, req, res, {
          sessionId: session.id,
          shotId,
        });
      }),
    );

    router.put(
      "/:sessionId/settings",
      asyncHandler(async (req: Request, res: Response) => {
        const session = await requireSessionForUser(
          continuityService,
          req,
          res,
        );
        if (!session) return;
        await handleUpdateSessionSettings(continuityService, req, res, {
          sessionId: session.id,
        });
      }),
    );

    router.put(
      "/:sessionId/style-reference",
      asyncHandler(async (req: Request, res: Response) => {
        const session = await requireSessionForUser(
          continuityService,
          req,
          res,
        );
        if (!session) return;
        await handleUpdatePrimaryStyleReference(continuityService, req, res, {
          sessionId: session.id,
        });
      }),
    );

    router.post(
      "/:sessionId/scene-proxy",
      asyncHandler(async (req: Request, res: Response) => {
        const session = await requireSessionForUser(
          continuityService,
          req,
          res,
        );
        if (!session) return;
        await handleCreateSceneProxy(continuityService, req, res, {
          sessionId: session.id,
          status: 200,
        });
      }),
    );
  }

  return router;
}
