import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";

const { verifyIdTokenMock, loggerMock } = vi.hoisted(() => ({
  verifyIdTokenMock: vi.fn(),
  loggerMock: {
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock("@infrastructure/firebaseAdmin", () => ({
  getAuth: () => ({
    verifyIdToken: verifyIdTokenMock,
  }),
}));

vi.mock("@infrastructure/Logger", () => ({
  logger: loggerMock,
}));

import { apiAuthMiddleware } from "../apiAuth";
import { apiKeyUid, isApiKeyUid } from "@utils/apiKeyUser";

type ApiAuthRequest = Request & {
  id?: string;
  apiKey?: string;
  user?: { uid: string };
  query: Request["query"] & { apiKey?: string };
};

function createRequest(
  overrides: Partial<ApiAuthRequest> = {},
): ApiAuthRequest {
  const req = {
    headers: {},
    ip: "127.0.0.1",
    path: "/api/test",
    method: "POST",
    id: "req-1",
    query: {},
    get: vi.fn((name: string) => {
      const key = name.toLowerCase();
      const headers = req.headers as Record<string, string | undefined>;
      return headers[key];
    }),
    ...overrides,
  } as unknown as ApiAuthRequest;
  return req;
}

function createResponse() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

describe("apiAuthMiddleware", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.ALLOWED_API_KEYS;
    delete process.env.API_KEY;
    delete process.env.NODE_ENV;
  });
  afterEach(() => { process.env = originalEnv; });

  it("returns 401 when no authentication is provided", async () => {
    const req = createRequest();
    const res = createResponse();
    const next = vi.fn() as NextFunction;

    await apiAuthMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: "Authentication required",
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 403 when invalid credentials are provided", async () => {
    process.env.ALLOWED_API_KEYS = "good-key";

    const req = createRequest({
      headers: { "x-api-key": "bad-key" } as Request["headers"],
    });
    const res = createResponse();
    const next = vi.fn() as NextFunction;

    await apiAuthMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: "Unauthorized",
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("authenticates with x-api-key header", async () => {
    process.env.ALLOWED_API_KEYS = "k1,k2";
    const req = createRequest({
      headers: { "x-api-key": "k2" } as Request["headers"],
    });
    const res = createResponse();
    const next = vi.fn() as NextFunction;

    await apiAuthMiddleware(req, res, next);

    expect(req.apiKey).toBeUndefined();
    expect(req.user).toEqual({ uid: apiKeyUid("k2") });
    expect(isApiKeyUid(req.user?.uid ?? "")).toBe(true);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("rejects API key passed via query parameter", async () => {
    process.env.API_KEY = "query-key";
    const req = createRequest({
      query: { apiKey: "query-key" },
    });
    const res = createResponse();
    const next = vi.fn() as NextFunction;

    await apiAuthMiddleware(req, res, next);

    expect(req.apiKey).toBeUndefined();
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("authenticates with bearer API key when Firebase token validation fails", async () => {
    process.env.ALLOWED_API_KEYS = "bearer-key";
    verifyIdTokenMock.mockRejectedValue(new Error("invalid token"));

    const req = createRequest({
      headers: { authorization: "Bearer bearer-key" } as Request["headers"],
    });
    const res = createResponse();
    const next = vi.fn() as NextFunction;

    await apiAuthMiddleware(req, res, next);

    expect(verifyIdTokenMock).toHaveBeenCalledWith("bearer-key");
    expect(req.apiKey).toBeUndefined();
    expect(req.user).toEqual({ uid: apiKeyUid("bearer-key") });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("authenticates with Firebase token", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "firebase-user" });
    const req = createRequest({
      headers: { "x-firebase-token": "firebase-token" } as Request["headers"],
    });
    const res = createResponse();
    const next = vi.fn() as NextFunction;

    await apiAuthMiddleware(req, res, next);

    expect(verifyIdTokenMock).toHaveBeenCalledWith("firebase-token");
    expect(req.user).toEqual({ uid: "firebase-user" });
    expect(req.apiKey).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("falls back to API key when Firebase verification fails", async () => {
    process.env.ALLOWED_API_KEYS = "fallback-key";
    verifyIdTokenMock.mockRejectedValue(new Error("bad firebase token"));
    const req = createRequest({
      headers: {
        "x-firebase-token": "bad-token",
        "x-api-key": "fallback-key",
      } as Request["headers"],
    });
    const res = createResponse();
    const next = vi.fn() as NextFunction;

    await apiAuthMiddleware(req, res, next);

    expect(req.user).toEqual({ uid: apiKeyUid("fallback-key") });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("does not allow the dev fallback key in production", async () => {
    process.env.NODE_ENV = "production";
    const req = createRequest({
      headers: { "x-api-key": "dev-key-12345" } as Request["headers"],
    });
    const res = createResponse();
    const next = vi.fn() as NextFunction;

    await apiAuthMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  // Regression: DEV_FALLBACK_KEY was removed — even without env-configured keys
  // and outside production, the literal "dev-key-12345" must not authenticate.
  it("rejects the legacy dev-key-12345 when no API keys are configured", async () => {
    // Neither ALLOWED_API_KEYS nor API_KEY set; NODE_ENV is "development"
    process.env.NODE_ENV = "development";
    const req = createRequest({
      headers: { "x-api-key": "dev-key-12345" } as Request["headers"],
    });
    const res = createResponse();
    const next = vi.fn() as NextFunction;

    await apiAuthMiddleware(req, res, next);

    expect([401, 403]).toContain(
      (res.status as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0],
    );
    expect(next).not.toHaveBeenCalled();
  });
  it("prefers verified Firebase identity when both credentials are valid", async () => {
    process.env.ALLOWED_API_KEYS = "configured-test-secret";
    verifyIdTokenMock.mockResolvedValueOnce({ uid: "firebase-owner" });
    const req = createRequest({ headers: { "x-api-key": "configured-test-secret", "x-firebase-token": "firebase-token" } });
    await apiAuthMiddleware(req, createResponse(), vi.fn());
    expect(req.user?.uid).toBe("firebase-owner");
    expect(req.apiKey).toBeUndefined();
  });

  it.each(["configured-test-secret", `v1:${"a".repeat(64)}`])("does not retain or log a bearer key, including verifier error text", async credential => {
    process.env.API_KEY = credential;
    verifyIdTokenMock.mockRejectedValueOnce(new Error(`Rejected ${credential}`));
    const req = createRequest({ apiKey: credential, headers: { authorization: `Bearer ${credential}` } });
    await apiAuthMiddleware(req, createResponse(), vi.fn());
    expect(req.user?.uid).toBe(apiKeyUid(credential));
    expect(req.apiKey).toBeUndefined();
    expect(JSON.stringify({ user: req.user, info: loggerMock.info.mock.calls, warn: loggerMock.warn.mock.calls })).not.toContain(credential);
  });

  it.each(["api-key:retired-test-secret", `api-key:v1:${"a".repeat(64)}`, "api-key-v1:not-a-principal"])("refuses a verified token carrying an unsafe API-key identity before logging it", async uid => {
    verifyIdTokenMock.mockResolvedValueOnce({ uid });
    const res = createResponse();
    const next = vi.fn();
    await apiAuthMiddleware(createRequest({ headers: { "x-firebase-token": "firebase-token" } }), res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
    expect(JSON.stringify([loggerMock.info.mock.calls, loggerMock.warn.mock.calls])).not.toContain(uid);
  });
});
