import type { SessionService } from "@services/sessions/SessionService";
import { ApiResponseSchema } from "@shared/schemas/api.schemas";
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createSessionRoutes } from "../sessions.routes";

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
  app.use("/sessions", createSessionRoutes(service));
  return app;
};

const AnyDataSchema = ApiResponseSchema(z.unknown());

describe("sessions routes — canonical envelope contract", () => {
  it("GET /sessions returns the success envelope with data array", async () => {
    const response = await request(buildApp(buildSessionService())).get(
      "/sessions",
    );

    expect(response.status).toBe(200);
    const parsed = AnyDataSchema.parse(response.body);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(Array.isArray(parsed.data)).toBe(true);
    }
  });

  it("GET /sessions/:id for a missing session returns the error envelope", async () => {
    const response = await request(buildApp(buildSessionService())).get(
      "/sessions/missing",
    );

    expect(response.status).toBe(404);
    const parsed = AnyDataSchema.parse(response.body);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error).toBe("Session not found");
    }
  });

  it("POST /sessions with an invalid body returns string details, not Zod issues", async () => {
    const response = await request(buildApp(buildSessionService()))
      .post("/sessions")
      .send({ prompt: "not-an-object" });

    expect(response.status).toBe(400);
    const parsed = AnyDataSchema.parse(response.body);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error).toBe("Invalid request");
      expect(typeof parsed.details).toBe("string");
    }
  });

  it("DELETE /sessions/:id acks with data.deleted", async () => {
    const response = await request(buildApp(buildSessionService())).delete(
      "/sessions/session-1",
    );

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
    app.use("/sessions", createSessionRoutes(buildSessionService()));

    const response = await request(app).get("/sessions");

    expect(response.status).toBe(401);
    const parsed = AnyDataSchema.parse(response.body);
    expect(parsed.success).toBe(false);
  });
});
