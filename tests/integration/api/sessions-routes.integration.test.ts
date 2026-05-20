import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiAuthMiddleware } from "@middleware/apiAuth";
import { createSessionRoutes } from "@routes/sessions.routes";
import { SessionAccessDeniedError } from "@services/sessions/SessionService";

const TEST_API_KEY = "integration-sessions-key";
const TEST_USER_ID = `api-key:${TEST_API_KEY}`;

function buildSession(id: string) {
  return {
    id,
    userId: TEST_USER_ID,
    name: "Session name",
    prompt: {
      uuid: `prompt-${id}`,
      input: "prompt input",
      output: "prompt output",
    },
  };
}

function buildContinuitySession() {
  return {
    id: "continuity-session-1",
    userId: TEST_USER_ID,
    name: "Continuity",
    shots: [],
    defaultSettings: {
      generationMode: "continuity",
      defaultContinuityMode: "style-match",
      defaultModel: "sora2",
      maxRetries: 1,
      useCharacterConsistency: false,
    },
  };
}

function createApp(options: { continuityEnabled?: boolean } = {}) {
  const baseSession = buildSession("session_123");
  const continuitySession = buildContinuitySession();

  const sessionService = {
    createPromptSession: vi.fn().mockResolvedValue(baseSession),
    toDto: vi
      .fn()
      .mockImplementation((session: Record<string, unknown>) => session),
    getSession: vi.fn().mockResolvedValue(baseSession),
    listSessions: vi.fn().mockResolvedValue([baseSession]),
    getSessionByPromptUuid: vi.fn().mockResolvedValue(baseSession),
    updateSessionForUser: vi.fn().mockResolvedValue(baseSession),
    deleteSessionForUser: vi.fn().mockResolvedValue(undefined),
    updatePromptForUser: vi.fn().mockResolvedValue(baseSession),
    updateHighlightsForUser: vi.fn().mockResolvedValue(baseSession),
    updateOutputForUser: vi.fn().mockResolvedValue(baseSession),
    updateVersionsForUser: vi.fn().mockResolvedValue(baseSession),
    updateSession: vi.fn().mockResolvedValue(baseSession),
    deleteSession: vi.fn().mockResolvedValue(undefined),
    updatePrompt: vi.fn().mockResolvedValue(baseSession),
    updateHighlights: vi.fn().mockResolvedValue(baseSession),
    updateOutput: vi.fn().mockResolvedValue(baseSession),
    updateVersions: vi.fn().mockResolvedValue(baseSession),
  };

  const continuityService = {
    getSession: vi.fn().mockResolvedValue(continuitySession),
    addShot: vi.fn().mockResolvedValue({ id: "shot-1" }),
    updateShot: vi.fn().mockResolvedValue({ id: "shot-1" }),
    generateShot: vi
      .fn()
      .mockResolvedValue({ status: "completed", retryCount: 0 }),
    updateShotStyleReference: vi.fn().mockResolvedValue({ id: "shot-1" }),
    updateSessionSettings: vi.fn().mockResolvedValue(continuitySession),
    updatePrimaryStyleReference: vi.fn().mockResolvedValue(continuitySession),
    createSceneProxy: vi.fn().mockResolvedValue(continuitySession),
    createSession: vi.fn().mockResolvedValue(continuitySession),
    getUserSessions: vi.fn().mockResolvedValue([continuitySession]),
  };

  const app = express();
  app.use(express.json());
  app.use(
    "/api/sessions",
    apiAuthMiddleware,
    createSessionRoutes(
      sessionService as never,
      options.continuityEnabled === false ? null : (continuityService as never),
      null,
    ),
  );

  return { app, sessionService };
}

describe("Sessions Routes (integration)", () => {
  let previousAllowedApiKeys: string | undefined;

  beforeEach(() => {
    previousAllowedApiKeys = process.env.ALLOWED_API_KEYS;
    process.env.ALLOWED_API_KEYS = TEST_API_KEY;
  });

  afterEach(() => {
    if (previousAllowedApiKeys === undefined) {
      delete process.env.ALLOWED_API_KEYS;
      return;
    }
    process.env.ALLOWED_API_KEYS = previousAllowedApiKeys;
  });

  it("POST /api/sessions creates a session when payload is valid", async () => {
    const { app, sessionService } = createApp();

    const response = await request(app)
      .post("/api/sessions")
      .set("x-api-key", TEST_API_KEY)
      .send({
        name: "My prompt session",
        prompt: {
          input: "A cinematic skyline at dawn",
        },
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.id).toBe("session_123");
    expect(sessionService.createPromptSession).toHaveBeenCalledWith(
      TEST_USER_ID,
      expect.objectContaining({
        name: "My prompt session",
      }),
    );
  });

  it("GET /api/sessions returns session list and list options", async () => {
    const { app, sessionService } = createApp();

    const response = await request(app)
      .get("/api/sessions?limit=7&includePrompt=false&includeContinuity=false")
      .set("x-api-key", TEST_API_KEY);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(sessionService.listSessions).toHaveBeenCalledWith(TEST_USER_ID, {
      limit: 7,
      includePrompt: false,
      includeContinuity: false,
    });
  });

  it("keeps core /api/sessions routes available without continuity service", async () => {
    const { app, sessionService } = createApp({ continuityEnabled: false });

    const listResponse = await request(app)
      .get("/api/sessions")
      .set("x-api-key", TEST_API_KEY);

    expect(listResponse.status).toBe(200);
    expect(sessionService.listSessions).toHaveBeenCalledWith(TEST_USER_ID, {
      includePrompt: true,
      includeContinuity: true,
    });

    const continuitySubroute = await request(app)
      .get("/api/sessions/session_123/shots/shot-1/status")
      .set("x-api-key", TEST_API_KEY);

    expect(continuitySubroute.status).toBe(404);
  });

  it("GET /api/sessions/by-prompt/:uuid returns mapped session", async () => {
    const { app, sessionService } = createApp();

    const response = await request(app)
      .get("/api/sessions/by-prompt/prompt-session_123")
      .set("x-api-key", TEST_API_KEY);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(sessionService.getSessionByPromptUuid).toHaveBeenCalledWith(
      TEST_USER_ID,
      "prompt-session_123",
    );
  });

  it("GET /api/sessions/:sessionId blocks cross-user access", async () => {
    const { app, sessionService } = createApp();
    sessionService.getSession.mockResolvedValueOnce({
      ...buildSession("session_999"),
      userId: "api-key:someone-else",
    });

    const response = await request(app)
      .get("/api/sessions/session_999")
      .set("x-api-key", TEST_API_KEY);

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toBe("Access denied");
  });

  it("PATCH /api/sessions/:sessionId updates the session", async () => {
    const { app, sessionService } = createApp();

    const response = await request(app)
      .patch("/api/sessions/session_123")
      .set("x-api-key", TEST_API_KEY)
      .send({
        name: "Updated name",
        status: "active",
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(sessionService.updateSessionForUser).toHaveBeenCalledWith(
      TEST_USER_ID,
      "session_123",
      {
        name: "Updated name",
        status: "active",
      },
    );
    expect(sessionService.updateSession).not.toHaveBeenCalled();
  });

  it("DELETE /api/sessions/:sessionId deletes owned session", async () => {
    const { app, sessionService } = createApp();

    const response = await request(app)
      .delete("/api/sessions/session_123")
      .set("x-api-key", TEST_API_KEY);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(sessionService.deleteSessionForUser).toHaveBeenCalledWith(
      TEST_USER_ID,
      "session_123",
    );
    expect(sessionService.deleteSession).not.toHaveBeenCalled();
  });

  it("PATCH prompt/highlights/output/versions routes update each session payload section", async () => {
    const { app, sessionService } = createApp();

    const promptResponse = await request(app)
      .patch("/api/sessions/session_123/prompt")
      .set("x-api-key", TEST_API_KEY)
      .send({
        input: "new input",
        output: "new output",
      });
    expect(promptResponse.status).toBe(200);
    expect(sessionService.updatePromptForUser).toHaveBeenCalledWith(
      TEST_USER_ID,
      "session_123",
      {
        input: "new input",
        output: "new output",
      },
    );

    const highlightsResponse = await request(app)
      .patch("/api/sessions/session_123/highlights")
      .set("x-api-key", TEST_API_KEY)
      .send({
        highlightCache: { main: [] },
        versionEntry: { timestamp: "2026-01-01T00:00:00.000Z" },
      });
    expect(highlightsResponse.status).toBe(200);
    expect(sessionService.updateHighlightsForUser).toHaveBeenCalledWith(
      TEST_USER_ID,
      "session_123",
      {
        highlightCache: { main: [] },
        versionEntry: { timestamp: "2026-01-01T00:00:00.000Z" },
      },
    );

    const outputResponse = await request(app)
      .patch("/api/sessions/session_123/output")
      .set("x-api-key", TEST_API_KEY)
      .send({ output: "final output" });
    expect(outputResponse.status).toBe(200);
    expect(sessionService.updateOutputForUser).toHaveBeenCalledWith(
      TEST_USER_ID,
      "session_123",
      {
        output: "final output",
      },
    );

    const versionsResponse = await request(app)
      .patch("/api/sessions/session_123/versions")
      .set("x-api-key", TEST_API_KEY)
      .send({
        versions: [{ id: "v1", output: "v1 output" }],
      });
    expect(versionsResponse.status).toBe(200);
    expect(sessionService.updateVersionsForUser).toHaveBeenCalledWith(
      TEST_USER_ID,
      "session_123",
      {
        versions: [{ id: "v1", output: "v1 output" }],
      },
    );
  });

  it("returns 403 and does not invoke unscoped mutation path when session update is unauthorized", async () => {
    const { app, sessionService } = createApp();
    sessionService.updateSessionForUser.mockRejectedValueOnce(
      new SessionAccessDeniedError(
        "session_123",
        TEST_USER_ID,
        "api-key:other-owner",
      ),
    );

    const response = await request(app)
      .patch("/api/sessions/session_123")
      .set("x-api-key", TEST_API_KEY)
      .send({ name: "should not persist" });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ success: false, error: "Access denied" });
    expect(sessionService.updateSessionForUser).toHaveBeenCalledWith(
      TEST_USER_ID,
      "session_123",
      {
        name: "should not persist",
      },
    );
    expect(sessionService.updateSession).not.toHaveBeenCalled();
  });

  it("returns 403 and does not invoke unscoped mutation path when delete is unauthorized", async () => {
    const { app, sessionService } = createApp();
    sessionService.deleteSessionForUser.mockRejectedValueOnce(
      new SessionAccessDeniedError(
        "session_123",
        TEST_USER_ID,
        "api-key:other-owner",
      ),
    );

    const response = await request(app)
      .delete("/api/sessions/session_123")
      .set("x-api-key", TEST_API_KEY);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ success: false, error: "Access denied" });
    expect(sessionService.deleteSessionForUser).toHaveBeenCalledWith(
      TEST_USER_ID,
      "session_123",
    );
    expect(sessionService.deleteSession).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid request payloads and 401 for unauthenticated requests", async () => {
    const { app, sessionService } = createApp();

    const invalidResponse = await request(app)
      .post("/api/sessions")
      .set("x-api-key", TEST_API_KEY)
      .send({
        prompt: "invalid-prompt-shape",
      });

    expect(invalidResponse.status).toBe(400);
    expect(invalidResponse.body.success).toBe(false);
    expect(invalidResponse.body.error).toBe("Invalid request");
    expect(sessionService.createPromptSession).not.toHaveBeenCalled();
    expect(sessionService.updateSessionForUser).not.toHaveBeenCalled();
    expect(sessionService.deleteSessionForUser).not.toHaveBeenCalled();

    const unauthenticatedResponse = await request(app).get("/api/sessions");

    expect(unauthenticatedResponse.status).toBe(401);
    expect(unauthenticatedResponse.body.error).toBe("Authentication required");
  });
});
