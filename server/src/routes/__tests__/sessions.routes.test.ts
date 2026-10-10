import {
  GenerationNotRemovableError,
  SessionAccessDeniedError,
  SessionService,
  TakeFactsConflictError,
} from "@services/sessions/SessionService";
import type { SessionRecord } from "@services/sessions/types";
import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSessionRoutes } from "../sessions.routes";

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
    appendGenerationToVersion: vi.fn(),
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
  app.use("/sessions", createSessionRoutes(sessionService as never));
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

    const response = await request(app)
      .get("/sessions?limit=5&includeContinuity=false&includePrompt=true")
      .set("x-user-id", "user-1");

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
    const denied = await request(app)
      .get("/sessions/session-1")
      .set("x-user-id", "user-1");
    expect(denied.status).toBe(403);

    process.env.ALLOW_DEV_CROSS_USER_SESSIONS = "true";
    sessionService.getSession.mockResolvedValueOnce({
      id: "session-1",
      userId: "other-user",
      status: "active",
    });
    const allowed = await request(app)
      .get("/sessions/session-1")
      .set("x-user-id", "user-1");
    expect(allowed.status).toBe(200);
  });

  it("returns 403 for unauthorized scoped session delete before unscoped delete", async () => {
    const { sessionService, continuityService } = buildServices();
    sessionService.deleteSessionForUser.mockRejectedValueOnce(
      new SessionAccessDeniedError("session-1", "user-1", "other-user"),
    );
    const app = createApp(sessionService, continuityService);

    const response = await request(app)
      .delete("/sessions/session-1")
      .set("x-user-id", "user-1");

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

    const response = await request(app)
      .post("/sessions/session-1/generations/pic-1/archive")
      .set("x-user-id", "user-1");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(sessionService.archiveGeneration).toHaveBeenCalledWith(
      "user-1",
      "session-1",
      "pic-1",
    );
  });

  it("returns 409 when an attachment retry conflicts with an established take", async () => {
    const { sessionService, continuityService } = buildServices();
    sessionService.appendGenerationToVersion.mockRejectedValueOnce(
      new TakeFactsConflictError("take-1", ["productionProvenance"]),
    );
    const app = createApp(sessionService, continuityService);

    const response = await request(app)
      .post("/sessions/session-1/versions/v-1/generations")
      .set("x-user-id", "user-1")
      .send({
        generation: {
          id: "take-1",
          origin: "generated",
          productionProvenance: { state: "known", instruction: "forged" },
        },
      });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      success: false,
      error: "This take is already saved with different details",
    });
  });

  it("attaches a take via the generations route on a faithful retry", async () => {
    const { sessionService, continuityService } = buildServices();
    sessionService.appendGenerationToVersion.mockResolvedValueOnce({
      id: "session-1",
      userId: "user-1",
      status: "active",
    });
    const app = createApp(sessionService, continuityService);

    const response = await request(app)
      .post("/sessions/session-1/versions/v-1/generations")
      .set("x-user-id", "user-1")
      .send({
        generation: {
          id: "take-1",
          origin: "upload",
          productionProvenance: { state: "unknown" },
        },
      });

    expect(response.status).toBe(200);
    expect(sessionService.appendGenerationToVersion).toHaveBeenCalledWith(
      "user-1",
      "session-1",
      "v-1",
      expect.objectContaining({ id: "take-1" }),
    );
  });

  it("returns 409 when removing a generation that still has a descendant", async () => {
    const { sessionService, continuityService } = buildServices();
    sessionService.archiveGeneration.mockRejectedValueOnce(
      new GenerationNotRemovableError("pic-1"),
    );
    const app = createApp(sessionService, continuityService);

    const response = await request(app)
      .post("/sessions/session-1/generations/pic-1/archive")
      .set("x-user-id", "user-1");

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
    app.use("/sessions", createSessionRoutes(sessionService));

    const response = await request(app)
      .patch(`/sessions/${created.id}`)
      .set("x-user-id", "request-user")
      .send({ name: "hijacked name" });

    expect(response.status).toBe(403);
    const unchanged = await sessionService.getSession(created.id);
    expect(unchanged?.name).toBe("Owner session");
    expect(unchanged?.prompt?.output).toBe("owner output");
  });

  it("returns validation errors for prompt/highlights/output/versions updates", async () => {
    const { sessionService, continuityService } = buildServices();
    const app = createApp(sessionService, continuityService);

    const prompt = await request(app)
      .patch("/sessions/session-1/prompt")
      .set("x-user-id", "user-1")
      .send({ output: 42 });
    expect(prompt.status).toBe(400);

    const highlights = await request(app)
      .patch("/sessions/session-1/highlights")
      .set("x-user-id", "user-1")
      .send({ highlightCache: "bad" });
    expect(highlights.status).toBe(400);

    const output = await request(app)
      .patch("/sessions/session-1/output")
      .set("x-user-id", "user-1")
      .send({ output: 99 });
    expect(output.status).toBe(400);

    const versions = await request(app)
      .patch("/sessions/session-1/versions")
      .set("x-user-id", "user-1")
      .send({ versions: "bad" });
    expect(versions.status).toBe(400);

    expect(sessionService.updatePromptForUser).not.toHaveBeenCalled();
    expect(sessionService.updateHighlightsForUser).not.toHaveBeenCalled();
    expect(sessionService.updateOutputForUser).not.toHaveBeenCalled();
    expect(sessionService.updateVersionsForUser).not.toHaveBeenCalled();
  });
});

describe("sessions.routes — the first-frame arm door (issue #136)", () => {
  /** Creates the app with an explicit arm binding, like registration does. */
  const createArmApp = (
    armFirstFrame:
      | ((input: {
          userId: string;
          sessionId: string;
          generationId: string;
        }) => Promise<
          | { ok: true; frame: Record<string, unknown> }
          | { ok: false; reason: string }
        >)
      | undefined,
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
      createSessionRoutes(
        { requireCreator: true } as never,
        undefined,
        armFirstFrame,
      ),
    );
    return app;
  };

  it("arms an attached take through the bound arm and answers the arming fact", async () => {
    const arm = vi.fn().mockResolvedValue({
      ok: true,
      frame: {
        id: "take-1",
        generationId: "take-1",
        url: "https://fresh.example.com/asset-1",
        storagePath: "image-previews/user-1/asset-1",
        assetId: "asset-1",
        source: "generation",
      },
    });
    const app = createArmApp(arm);

    const response = await request(app)
      .post("/sessions/session-1/first-frame/arm")
      .set("x-user-id", "user-1")
      .send({ generationId: "take-1" });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: { arming: { state: "armed", generationId: "take-1" } },
    });
    // The take rides by identity alone — nothing else travels, because
    // everything else is already persisted in the session.
    expect(arm).toHaveBeenCalledWith({
      userId: "user-1",
      sessionId: "session-1",
      generationId: "take-1",
    });
  });

  it("answers 409 when the take has not reached its session — the attachment retry owns that debt", async () => {
    const arm = vi.fn().mockResolvedValue({
      ok: false,
      reason: "that picture is not saved in this session yet",
    });
    const app = createArmApp(arm);

    const response = await request(app)
      .post("/sessions/session-1/first-frame/arm")
      .set("x-user-id", "user-1")
      .send({ generationId: "take-1" });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      success: false,
      error: "that picture is not saved in this session yet",
    });
  });

  it("answers 422 when the arm refuses the record — a frame without a durable handle is not a completed handoff", async () => {
    const arm = vi.fn().mockResolvedValue({
      ok: false,
      reason:
        "this picture has no durable media handle — a first frame armed with only an expiring URL is not a completed handoff",
    });
    const app = createArmApp(arm);

    const response = await request(app)
      .post("/sessions/session-1/first-frame/arm")
      .set("x-user-id", "user-1")
      .send({ generationId: "take-1" });

    expect(response.status).toBe(422);
    expect(response.body.success).toBe(false);
  });

  it("answers 503 when no arm is wired rather than pretending the route is missing", async () => {
    const app = createArmApp(undefined);

    const response = await request(app)
      .post("/sessions/session-1/first-frame/arm")
      .set("x-user-id", "user-1")
      .send({ generationId: "take-1" });

    expect(response.status).toBe(503);
  });

  it("rejects a body with no take identity", async () => {
    const arm = vi.fn();
    const app = createArmApp(arm);

    const response = await request(app)
      .post("/sessions/session-1/first-frame/arm")
      .set("x-user-id", "user-1")
      .send({});

    expect(response.status).toBe(400);
    expect(arm).not.toHaveBeenCalled();
  });
});
