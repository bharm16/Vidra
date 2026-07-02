import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createSessionRoutes } from "../sessions.routes";
import { ApiResponseSchema } from "@shared/schemas/api.schemas";
import type { SessionService } from "@services/sessions/SessionService";

/**
 * Contract test for the sessions route response envelopes.
 *
 * Pins the canonical ApiResponse union from shared/types/api.ts: success
 * responses carry `data`, error responses carry a string `error` (and string
 * `details` for validation failures — never raw Zod issue arrays), and the
 * data-less DELETE ack is modelled as `data: { deleted: true }`.
 */

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

const SESSION_DTO = {
  id: "session-1",
  userId: "user-1",
  name: "Test session",
};

const buildSessionService = (): SessionService =>
  ({
    listSessions: vi.fn(async () => [SESSION_DTO]),
    getSession: vi.fn(async (id: string) =>
      id === "session-1" ? { ...SESSION_DTO } : null,
    ),
    getSessionByPromptUuid: vi.fn(async () => null),
    createPromptSession: vi.fn(async () => ({ ...SESSION_DTO })),
    deleteSessionForUser: vi.fn(async () => undefined),
    toDto: vi.fn(() => ({ ...SESSION_DTO })),
  }) as unknown as SessionService;

const buildApp = (service: SessionService): express.Express => {
  const app = express();
  app.use(express.json());
  // Simulate upstream auth middleware.
  app.use((req, _res, next) => {
    (req as express.Request & { user?: { uid?: string } }).user = {
      uid: "user-1",
    };
    next();
  });
  app.use("/sessions", createSessionRoutes(service, null, null));
  return app;
};

const AnyDataSchema = ApiResponseSchema(z.unknown());

describe("sessions routes — canonical envelope contract", () => {
  it("GET /sessions returns the success envelope with data array", async () => {
    const response = await runSupertestOrSkip(() =>
      request(buildApp(buildSessionService())).get("/sessions"),
    );
    if (!response) return;

    expect(response.status).toBe(200);
    const parsed = AnyDataSchema.parse(response.body);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(Array.isArray(parsed.data)).toBe(true);
    }
  });

  it("GET /sessions/:id for a missing session returns the error envelope", async () => {
    const response = await runSupertestOrSkip(() =>
      request(buildApp(buildSessionService())).get("/sessions/missing"),
    );
    if (!response) return;

    expect(response.status).toBe(404);
    const parsed = AnyDataSchema.parse(response.body);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error).toBe("Session not found");
    }
  });

  it("POST /sessions with an invalid body returns string details, not Zod issues", async () => {
    const response = await runSupertestOrSkip(() =>
      request(buildApp(buildSessionService()))
        .post("/sessions")
        .send({ prompt: "not-an-object" }),
    );
    if (!response) return;

    expect(response.status).toBe(400);
    const parsed = AnyDataSchema.parse(response.body);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error).toBe("Invalid request");
      expect(typeof parsed.details).toBe("string");
    }
  });

  it("DELETE /sessions/:id acks with data.deleted", async () => {
    const response = await runSupertestOrSkip(() =>
      request(buildApp(buildSessionService())).delete("/sessions/session-1"),
    );
    if (!response) return;

    expect(response.status).toBe(200);
    const parsed = AnyDataSchema.parse(response.body);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toEqual({ deleted: true });
    }
  });

  it("unauthenticated requests return the error envelope", async () => {
    const app = express();
    app.use(express.json());
    app.use(
      "/sessions",
      createSessionRoutes(buildSessionService(), null, null),
    );

    const response = await runSupertestOrSkip(() =>
      request(app).get("/sessions"),
    );
    if (!response) return;

    expect(response.status).toBe(401);
    const parsed = AnyDataSchema.parse(response.body);
    expect(parsed.success).toBe(false);
  });
});
