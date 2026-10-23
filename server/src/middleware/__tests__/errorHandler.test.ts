import type { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../errorHandler";

// Mock the logger
vi.mock("@infrastructure/Logger", () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock DomainError type guard
vi.mock("@server/errors/DomainError", () => ({
  isDomainError: vi.fn((err) => {
    return (
      err && typeof err === "object" && "code" in err && "getHttpStatus" in err
    );
  }),
}));

type RequestWithId = Request & { id?: string; body?: Record<string, unknown> };

function createMockRequest(
  options: {
    id?: string;
    method?: string;
    path?: string;
    body?: Record<string, unknown>;
  } = {},
): RequestWithId {
  return {
    id: options.id,
    method: options.method || "GET",
    path: options.path || "/test",
    body: options.body || {},
  } as RequestWithId;
}

function createMockResponse(): Response & {
  statusCode?: number;
  responseBody?: unknown;
  headers: Record<string, string>;
} {
  const res = {
    statusCode: undefined as number | undefined,
    responseBody: undefined as unknown,
    headers: {} as Record<string, string>,
    status: vi.fn().mockImplementation(function (this: Response, code: number) {
      (this as Response & { statusCode: number }).statusCode = code;
      return this;
    }),
    json: vi.fn().mockImplementation(function (this: Response, data: unknown) {
      (this as Response & { responseBody: unknown }).responseBody = data;
      return this;
    }),
    setHeader: vi.fn().mockImplementation(function (
      this: Response & { headers: Record<string, string> },
      name: string,
      value: string,
    ) {
      this.headers[name] = value;
      return this;
    }),
  };
  return res as unknown as Response & {
    statusCode?: number;
    responseBody?: unknown;
    headers: Record<string, string>;
  };
}

function createDomainError(
  code: string,
  httpStatus: number,
  userMessage: string,
  details?: unknown,
) {
  return {
    name: "TestDomainError",
    code,
    details,
    getHttpStatus: () => httpStatus,
    getUserMessage: () => userMessage,
  };
}

describe("errorHandler", () => {
  const mockNext: NextFunction = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("error handling", () => {
    it("handles null error gracefully", () => {
      const req = createMockRequest({ id: "req-123" });
      const res = createMockResponse();

      errorHandler(null, req, res, mockNext);

      expect(res.statusCode).toBe(500);
      expect(res.responseBody).toMatchObject({
        error: "Something went wrong on our side. Try again.",
        requestId: "req-123",
      });
    });

    it("handles string error", () => {
      const req = createMockRequest();
      const res = createMockResponse();

      errorHandler("Something went wrong", req, res, mockNext);

      expect(res.statusCode).toBe(500);
      expect(res.responseBody).toMatchObject({
        error: "Something went wrong on our side. Try again.",
      });
    });
  });

  describe("Error object handling", () => {
    it("uses statusCode from error object", () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const error = Object.assign(new Error("Bad request"), {
        statusCode: 400,
      });

      errorHandler(error, req, res, mockNext);

      expect(res.statusCode).toBe(400);
    });

    it("uses status from error object when statusCode missing", () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const error = Object.assign(new Error("Forbidden"), { status: 403 });

      errorHandler(error, req, res, mockNext);

      expect(res.statusCode).toBe(403);
    });

    it("includes details from error object", () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const error = Object.assign(new Error("Validation failed"), {
        statusCode: 400,
        details: { field: "email", issue: "invalid format" },
      });

      errorHandler(error, req, res, mockNext);

      const body = res.responseBody as { details?: string };
      const parsedDetails = body.details ? JSON.parse(body.details) : undefined;
      expect(parsedDetails).toEqual({
        field: "email",
        issue: "invalid format",
      });
    });

    it("includes code from error object when provided", () => {
      const req = createMockRequest({ id: "req-code-1" });
      const res = createMockResponse();
      const error = Object.assign(new Error("Credit error"), {
        statusCode: 402,
        code: "INSUFFICIENT_CREDITS",
      });

      errorHandler(error, req, res, mockNext);

      expect(res.statusCode).toBe(402);
      expect(res.responseBody).toMatchObject({
        error: "Credit error",
        code: "INSUFFICIENT_CREDITS",
        requestId: "req-code-1",
      });
    });
  });

  describe("DomainError handling", () => {
    it("maps DomainError to proper HTTP status", () => {
      const req = createMockRequest({ id: "conv-req" });
      const res = createMockResponse();
      const error = createDomainError(
        "SESSION_EXPIRED",
        410,
        "Session has expired",
      );

      errorHandler(error, req, res, mockNext);

      expect(res.statusCode).toBe(410);
      expect(res.responseBody).toMatchObject({
        error: "Session has expired",
        code: "SESSION_EXPIRED",
        requestId: "conv-req",
      });
    });

    it("includes details from DomainError", () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const error = createDomainError(
        "INSUFFICIENT_CREDITS",
        402,
        "Not enough credits",
        { required: 10, available: 5 },
      );

      errorHandler(error, req, res, mockNext);

      const body = res.responseBody as { details?: string };
      const parsedDetails = body.details ? JSON.parse(body.details) : undefined;
      expect(parsedDetails).toEqual({ required: 10, available: 5 });
    });
  });

  describe("sensitive data redaction", () => {
    it("omits sketch bytes and working words from failure logs", async () => {
      const { logger } = await import("@infrastructure/Logger");
      const body = { outputDataUri: "data:picture/private-output", drawingDataUri: "data:picture/private-drawing", prompt: "private short prompt", instructions: "private working words" };
      errorHandler(createDomainError("access_denied", 403, "Unavailable"), createMockRequest({ method: "POST", path: "/api/projects/project_x/sketch/captures", body }), createMockResponse(), mockNext);
      const logged = JSON.stringify(vi.mocked(logger.warn).mock.calls);
      for (const value of Object.values(body)) expect(logged).not.toContain(value);
      expect(logged).toContain("REDACTED");
    });

    it("handles body serialization errors gracefully", () => {
      const circularBody: Record<string, unknown> = { name: "test" };
      circularBody.self = circularBody;
      const req = createMockRequest({ body: circularBody });
      const res = createMockResponse();

      // Should not throw
      expect(() => {
        errorHandler(new Error("test"), req, res, mockNext);
      }).not.toThrow();

      expect(res.statusCode).toBe(500);
    });
  });

  describe("edge cases", () => {
    it("uses fallback message for errors without message", () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const error = Object.assign(new Error(), { message: "" });

      errorHandler(error, req, res, mockNext);

      expect(res.responseBody).toMatchObject({
        error: "Something went wrong on our side. Try again.",
      });
    });

    it("never sends an unexpected server failure's message or details to the client", () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const error = Object.assign(new Error("9 FAILED_PRECONDITION: The query requires an index. You can create it here: https://console.firebase.google.com/v1/r/project/flibberai/firestore/indexes"), { code: 9, details: "The query requires an index." });

      errorHandler(error, req, res, mockNext);

      expect(res.statusCode).toBe(500);
      const body = JSON.stringify(res.responseBody);
      expect(body).not.toContain("FAILED_PRECONDITION");
      expect(body).not.toContain("console.firebase.google.com");
      expect(res.responseBody).not.toHaveProperty("details");
    });

    it("keeps a provider's error body internal even when it carries a 4xx status", () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const error = Object.assign(new Error('openai API error: 429 - { "message": "You have no credits remaining." }'), { name: "APIError", statusCode: 429 });

      errorHandler(error, req, res, mockNext);

      expect(res.statusCode).toBe(429);
      expect(JSON.stringify(res.responseBody)).not.toContain("openai");
      expect(res.responseBody).toMatchObject({ error: "Something went wrong on our side. Try again." });
    });
  });
});
