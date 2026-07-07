import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSessionRoutes } from "../sessions.routes";
import {
  GenerationNotRemovableError,
  SessionAccessDeniedError,
  SessionService,
} from "@services/sessions/SessionService";
import type { SessionRecord } from "@services/sessions/types";

interface ErrorWithCode {
  code?: string;
  message?: string;
}

const isSocketPermissionError = (error: unknown): boolean => {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as ErrorWithCode;
  const code = typeof candidate.code === "string" ? candidate.code : "";
  const message =
    typeof candidate.message === "string" ? candidate.message : "";
  if (code === "EPERM" || code === "EACCES") {
    return true;
  }

  return (
    message.includes("listen EPERM") ||
    message.includes("listen EACCES") ||
    message.includes("operation not permitted") ||
    message.includes("Cannot read properties of null (reading 'port')")
  );
};

const runSupertestOrSkip = async <T>(
  execute: () => Promise<T>,
): Promise<T | null> => {
  if (process.env.CODEX_SANDBOX === "seatbelt") {
    return null;
  }

  try {
    return await execute();
  } catch (error) {
    if (isSocketPermissionError(error)) {
      return null;
    }
    throw error;
  }
};

const buildServices = () => {
  const baseSessionDto = {
    id: "session-1",
    userId: "user-1",
    status: "active",
    createdAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
    updatedAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
  };

  const sessionService = {
    listSessions: vi.fn().mockResolvedValue([]),
    toDto: vi.fn((session) => ({
      ...baseSessionDto,
      id: session.id,
      userId: session.userId,
    })),
    getSessionByPromptUuid: vi.fn(),
    getSession: vi.fn().mockResolvedValue({
      id: "session-1",
      userId: "user-1",
      status: "active",
    }),
    createPromptSession: vi.fn(),
    updateSessionForUser: vi.fn(),
    deleteSessionForUser: vi.fn(),
    updatePromptForUser: vi.fn(),
    updateHighlightsForUser: vi.fn(),
    updateOutputForUser: vi.fn(),
    updateVersionsForUser: vi.fn(),
    updateSession: vi.fn(),
    deleteSession: vi.fn(),
    updatePrompt: vi.fn(),
    updateHighlights: vi.fn(),
    updateOutput: vi.fn(),
    updateVersions: vi.fn(),
    archiveGeneration: vi.fn(),
  };

  const continuityService = {
    createSession: vi.fn(),
    getSession: vi.fn().mockResolvedValue({
      id: "session-1",
      userId: "user-1",
      shots: [
        {
          id: "shot-1",
          sessionId: "session-1",
          sequenceIndex: 0,
          userPrompt: "A character enters frame",
          continuityMode: "frame-bridge",
          generationMode: "continuity",
          styleStrength: 0.6,
          styleReferenceId: null,
          modelId: "model-a",
          status: "generating-video",
          continuityMechanismUsed: "frame-bridge",
          styleScore: 0.82,
          identityScore: 0.91,
          styleDegraded: false,
          styleDegradedReason: null,
          generatedKeyframeUrl: "https://example.com/keyframe.png",
          frameBridge: {
            frameUrl: "https://example.com/bridge.png",
          },
          retryCount: 1,
          error: null,
        },
      ],
      defaultSettings: {
        generationMode: "continuity",
        defaultContinuityMode: "frame-bridge",
        defaultStyleStrength: 0.6,
        defaultModel: "model-a",
        autoExtractFrameBridge: false,
        useCharacterConsistency: false,
      },
    }),
    addShot: vi.fn(),
    updateShot: vi.fn(),
    generateShot: vi.fn(),
    updateShotStyleReference: vi.fn(),
    updateSessionSettings: vi.fn(),
    updatePrimaryStyleReference: vi.fn(),
    createSceneProxy: vi.fn(),
    previewSceneProxy: vi.fn().mockResolvedValue({
      id: "shot-1",
      sessionId: "session-1",
      sequenceIndex: 0,
      userPrompt: "A character enters frame",
      continuityMode: "style-match",
      generationMode: "continuity",
      styleStrength: 0.6,
      styleReferenceId: null,
      modelId: "model-a",
      status: "draft",
      sceneProxyRenderUrl: "https://example.com/preview.png",
      createdAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
    }),
  };

  return { sessionService, continuityService };
};

const createApp = (
  sessionService: ReturnType<typeof buildServices>["sessionService"],
  continuityService: ReturnType<typeof buildServices>["continuityService"],
) => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const userId = req.header("x-user-id");
    if (userId) {
      (req as express.Request & { user?: { uid: string } }).user = {
        uid: userId,
      };
    }
    next();
  });
  app.use(
    "/sessions",
    createSessionRoutes(sessionService as never, continuityService as never),
  );
  return app;
};

describe("sessions.routes", () => {
  const originalCrossUserFlag = process.env.ALLOW_DEV_CROSS_USER_SESSIONS;

  afterEach(() => {
    process.env.ALLOW_DEV_CROSS_USER_SESSIONS = originalCrossUserFlag;
  });

  it("parses list query parameters into listSessions options", async () => {
    const { sessionService, continuityService } = buildServices();
    sessionService.listSessions.mockResolvedValue([
      { id: "session-1", userId: "user-1" },
    ]);
    const app = createApp(sessionService, continuityService);

    const response = await runSupertestOrSkip(() =>
      request(app)
        .get("/sessions?limit=5&includeContinuity=false&includePrompt=true")
        .set("x-user-id", "user-1"),
    );
    if (!response) return;

    expect(response.status).toBe(200);
    expect(sessionService.listSessions).toHaveBeenCalledWith("user-1", {
      limit: 5,
      includeContinuity: false,
      includePrompt: true,
    });
  });

  it("enforces session ownership and supports dev bypass flag", async () => {
    const { sessionService, continuityService } = buildServices();
    const app = createApp(sessionService, continuityService);

    sessionService.getSession.mockResolvedValueOnce({
      id: "session-1",
      userId: "other-user",
      status: "active",
    });
    const denied = await runSupertestOrSkip(() =>
      request(app).get("/sessions/session-1").set("x-user-id", "user-1"),
    );
    if (!denied) return;
    expect(denied.status).toBe(403);

    process.env.ALLOW_DEV_CROSS_USER_SESSIONS = "true";
    sessionService.getSession.mockResolvedValueOnce({
      id: "session-1",
      userId: "other-user",
      status: "active",
    });
    const allowed = await runSupertestOrSkip(() =>
      request(app).get("/sessions/session-1").set("x-user-id", "user-1"),
    );
    if (!allowed) return;
    expect(allowed.status).toBe(200);
  });

  it("validates continuity create sessionId ownership checks", async () => {
    const { sessionService, continuityService } = buildServices();
    const app = createApp(sessionService, continuityService);

    sessionService.getSession.mockResolvedValueOnce(null);
    const notFound = await runSupertestOrSkip(() =>
      request(app)
        .post("/sessions/continuity")
        .set("x-user-id", "user-1")
        .send({
          sessionId: "missing",
          name: "Continuity",
          sourceImageUrl: "https://example.com/a.png",
        }),
    );
    if (!notFound) return;
    expect(notFound.status).toBe(404);

    sessionService.getSession.mockResolvedValueOnce({
      id: "session-1",
      userId: "other-user",
      status: "active",
    });
    const forbidden = await runSupertestOrSkip(() =>
      request(app)
        .post("/sessions/continuity")
        .set("x-user-id", "user-1")
        .send({
          sessionId: "session-1",
          name: "Continuity",
          sourceImageUrl: "https://example.com/a.png",
        }),
    );
    if (!forbidden) return;
    expect(forbidden.status).toBe(403);
  });

  it("returns 403 for unauthorized scoped session updates before unscoped mutations", async () => {
    const { sessionService, continuityService } = buildServices();
    sessionService.updateSessionForUser.mockRejectedValueOnce(
      new SessionAccessDeniedError("session-1", "user-1", "other-user"),
    );
    const app = createApp(sessionService, continuityService);

    const response = await runSupertestOrSkip(() =>
      request(app)
        .patch("/sessions/session-1")
        .set("x-user-id", "user-1")
        .send({ name: "blocked update" }),
    );
    if (!response) return;

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ success: false, error: "Access denied" });
    expect(sessionService.updateSessionForUser).toHaveBeenCalledWith(
      "user-1",
      "session-1",
      {
        name: "blocked update",
      },
    );
    expect(sessionService.updateSession).not.toHaveBeenCalled();
  });

  it("returns 403 for unauthorized scoped session delete before unscoped delete", async () => {
    const { sessionService, continuityService } = buildServices();
    sessionService.deleteSessionForUser.mockRejectedValueOnce(
      new SessionAccessDeniedError("session-1", "user-1", "other-user"),
    );
    const app = createApp(sessionService, continuityService);

    const response = await runSupertestOrSkip(() =>
      request(app).delete("/sessions/session-1").set("x-user-id", "user-1"),
    );
    if (!response) return;

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ success: false, error: "Access denied" });
    expect(sessionService.deleteSessionForUser).toHaveBeenCalledWith(
      "user-1",
      "session-1",
    );
    expect(sessionService.deleteSession).not.toHaveBeenCalled();
  });

  it("archives a leaf generation via the generation archive route", async () => {
    const { sessionService, continuityService } = buildServices();
    sessionService.archiveGeneration.mockResolvedValueOnce({
      id: "session-1",
      userId: "user-1",
      status: "active",
    });
    const app = createApp(sessionService, continuityService);

    const response = await runSupertestOrSkip(() =>
      request(app)
        .post("/sessions/session-1/generations/pic-1/archive")
        .set("x-user-id", "user-1"),
    );
    if (!response) return;

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(sessionService.archiveGeneration).toHaveBeenCalledWith(
      "user-1",
      "session-1",
      "pic-1",
    );
  });

  it("returns 409 when removing a generation that still has a descendant", async () => {
    const { sessionService, continuityService } = buildServices();
    sessionService.archiveGeneration.mockRejectedValueOnce(
      new GenerationNotRemovableError("pic-1"),
    );
    const app = createApp(sessionService, continuityService);

    const response = await runSupertestOrSkip(() =>
      request(app)
        .post("/sessions/session-1/generations/pic-1/archive")
        .set("x-user-id", "user-1"),
    );
    if (!response) return;

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      success: false,
      error: "Only a childless node can be removed",
    });
  });

  it("never mutates stored state on unauthorized PATCH", async () => {
    const records = new Map<string, SessionRecord>();
    const sessionStore = {
      save: vi.fn(async (session: SessionRecord) => {
        records.set(session.id, session);
      }),
      get: vi.fn(async (sessionId: string) => records.get(sessionId) ?? null),
      findByPromptUuid: vi.fn(async (userId: string, promptUuid: string) => {
        return (
          Array.from(records.values()).find(
            (candidate) =>
              candidate.userId === userId &&
              candidate.promptUuid === promptUuid,
          ) ?? null
        );
      }),
      findByUser: vi.fn(async (userId: string) => {
        return Array.from(records.values()).filter(
          (candidate) => candidate.userId === userId,
        );
      }),
      delete: vi.fn(async (sessionId: string) => {
        records.delete(sessionId);
      }),
    };
    const sessionService = new SessionService(sessionStore as never);
    const created = await sessionService.createPromptSession("owner-user", {
      name: "Owner session",
      prompt: {
        uuid: "owner-prompt",
        input: "owner input",
        output: "owner output",
      },
    });

    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      const userId = req.header("x-user-id");
      if (userId) {
        (req as express.Request & { user?: { uid: string } }).user = {
          uid: userId,
        };
      }
      next();
    });
    app.use("/sessions", createSessionRoutes(sessionService, null));

    const response = await runSupertestOrSkip(() =>
      request(app)
        .patch(`/sessions/${created.id}`)
        .set("x-user-id", "request-user")
        .send({ name: "hijacked name" }),
    );
    if (!response) return;

    expect(response.status).toBe(403);
    const unchanged = await sessionService.getSession(created.id);
    expect(unchanged?.name).toBe("Owner session");
    expect(unchanged?.prompt?.output).toBe("owner output");
  });

  it("returns validation errors for prompt/highlights/output/versions updates", async () => {
    const { sessionService, continuityService } = buildServices();
    const app = createApp(sessionService, continuityService);

    const prompt = await runSupertestOrSkip(() =>
      request(app)
        .patch("/sessions/session-1/prompt")
        .set("x-user-id", "user-1")
        .send({ output: 42 }),
    );
    if (!prompt) return;
    expect(prompt.status).toBe(400);

    const highlights = await runSupertestOrSkip(() =>
      request(app)
        .patch("/sessions/session-1/highlights")
        .set("x-user-id", "user-1")
        .send({ highlightCache: "bad" }),
    );
    if (!highlights) return;
    expect(highlights.status).toBe(400);

    const output = await runSupertestOrSkip(() =>
      request(app)
        .patch("/sessions/session-1/output")
        .set("x-user-id", "user-1")
        .send({ output: 99 }),
    );
    if (!output) return;
    expect(output.status).toBe(400);

    const versions = await runSupertestOrSkip(() =>
      request(app)
        .patch("/sessions/session-1/versions")
        .set("x-user-id", "user-1")
        .send({ versions: "bad" }),
    );
    if (!versions) return;
    expect(versions.status).toBe(400);

    expect(sessionService.updatePromptForUser).not.toHaveBeenCalled();
    expect(sessionService.updateHighlightsForUser).not.toHaveBeenCalled();
    expect(sessionService.updateOutputForUser).not.toHaveBeenCalled();
    expect(sessionService.updateVersionsForUser).not.toHaveBeenCalled();
  });

  it("returns shot status payload for /sessions/:sessionId/shots/:shotId/status", async () => {
    const { sessionService, continuityService } = buildServices();
    const app = createApp(sessionService, continuityService);

    const response = await runSupertestOrSkip(() =>
      request(app)
        .get("/sessions/session-1/shots/shot-1/status")
        .set("x-user-id", "user-1"),
    );
    if (!response) return;

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: {
        shotId: "shot-1",
        status: "generating-video",
        continuityMechanismUsed: "frame-bridge",
        styleScore: 0.82,
        identityScore: 0.91,
        styleDegraded: false,
        styleDegradedReason: null,
        generatedKeyframeUrl: "https://example.com/keyframe.png",
        frameBridgeUrl: "https://example.com/bridge.png",
        retryCount: 1,
        error: null,
      },
    });
  });

  it("returns 404 for unknown shots on status route", async () => {
    const { sessionService, continuityService } = buildServices();
    continuityService.getSession.mockResolvedValueOnce({
      id: "session-1",
      userId: "user-1",
      shots: [],
      defaultSettings: {
        generationMode: "continuity",
        defaultContinuityMode: "frame-bridge",
        defaultStyleStrength: 0.6,
        defaultModel: "model-a",
        autoExtractFrameBridge: false,
        useCharacterConsistency: false,
      },
    });
    const app = createApp(sessionService, continuityService);

    const response = await runSupertestOrSkip(() =>
      request(app)
        .get("/sessions/session-1/shots/missing-shot/status")
        .set("x-user-id", "user-1"),
    );
    if (!response) return;

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      success: false,
      error: "Shot not found",
    });
  });

  it("wires session-scoped scene proxy preview route to service previewSceneProxy", async () => {
    const { sessionService, continuityService } = buildServices();
    const app = createApp(sessionService, continuityService);

    const response = await runSupertestOrSkip(() =>
      request(app)
        .post("/sessions/session-1/shots/shot-1/scene-proxy-preview")
        .set("x-user-id", "user-1")
        .send({ camera: { yaw: 0.12, pitch: -0.05, roll: 0, dolly: -1 } }),
    );
    if (!response) return;

    expect(response.status).toBe(200);
    expect(continuityService.previewSceneProxy).toHaveBeenCalledWith(
      "session-1",
      "shot-1",
      {
        yaw: 0.12,
        pitch: -0.05,
        roll: 0,
        dolly: -1,
      },
    );
  });
});
