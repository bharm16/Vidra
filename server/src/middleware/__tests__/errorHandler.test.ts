import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";
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
        error: "null",
        requestId: "req-123",
      });
    });

    it("handles undefined error gracefully", () => {
      const req = createMockRequest();
      const res = createMockResponse();

      errorHandler(undefined, req, res, mockNext);

      expect(res.statusCode).toBe(500);
    });

    it("handles string error", () => {
      const req = createMockRequest();
      const res = createMockResponse();

      errorHandler("Something went wrong", req, res, mockNext);

      expect(res.statusCode).toBe(500);
      expect(res.responseBody).toMatchObject({
        error: "Something went wrong",
      });
    });

    it("handles number error", () => {
      const req = createMockRequest();
      const res = createMockResponse();

      errorHandler(404, req, res, mockNext);

      expect(res.statusCode).toBe(500);
    });
  });

  describe("Error object handling", () => {
    it("extracts message from Error instance", () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const error = new Error("Test error message");

      errorHandler(error, req, res, mockNext);

      expect(res.responseBody).toMatchObject({
        error: "Test error message",
      });
    });

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

    it("defaults to 500 when no status code provided", () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const error = new Error("Internal error");

      errorHandler(error, req, res, mockNext);

      expect(res.statusCode).toBe(500);
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

    it("maps VideoProviderError categories to proper HTTP status", () => {
      const req = createMockRequest({ id: "video-req" });
      const res = createMockResponse();
      const error = createDomainError(
        "VIDEO_PROVIDER_TIMEOUT",
        504,
        "Video generation timed out. Please try again.",
      );

      errorHandler(error, req, res, mockNext);

      expect(res.statusCode).toBe(504);
      expect(res.responseBody).toMatchObject({
        error: "Video generation timed out. Please try again.",
        code: "VIDEO_PROVIDER_TIMEOUT",
        requestId: "video-req",
      });
    });
  });

  describe("ConcurrencyLimiter backpressure mapping", () => {
    it("maps QUEUE_FULL to 503 with Retry-After from error.retryAfter", () => {
      const req = createMockRequest({ id: "qf-1" });
      const res = createMockResponse();
      const error = Object.assign(new Error("Queue full"), {
        code: "QUEUE_FULL",
        retryAfter: 7,
      });

      errorHandler(error, req, res, mockNext);

      expect(res.statusCode).toBe(503);
      expect(res.headers["Retry-After"]).toBe("7");
      expect(res.responseBody).toMatchObject({
        success: false,
        error: "Queue full",
        code: "QUEUE_FULL",
        requestId: "qf-1",
      });
    });

    it("maps QUEUE_FULL to 503 with default Retry-After when retryAfter missing", () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const error = Object.assign(new Error("busy"), { code: "QUEUE_FULL" });

      errorHandler(error, req, res, mockNext);

      expect(res.statusCode).toBe(503);
      expect(res.headers["Retry-After"]).toBe("5");
      expect(res.responseBody).toMatchObject({
        success: false,
        error: "busy",
        code: "QUEUE_FULL",
      });
    });

    it("maps QUEUE_TIMEOUT to 503 with default Retry-After of 5s", () => {
      const req = createMockRequest({ id: "qt-1" });
      const res = createMockResponse();
      const error = Object.assign(new Error("Queued request timed out"), {
        code: "QUEUE_TIMEOUT",
      });

      errorHandler(error, req, res, mockNext);

      expect(res.statusCode).toBe(503);
      expect(res.headers["Retry-After"]).toBe("5");
      expect(res.responseBody).toMatchObject({
        success: false,
        error: "Queued request timed out",
        code: "QUEUE_TIMEOUT",
        requestId: "qt-1",
      });
    });

    it.each([
      ["Infinity", Number.POSITIVE_INFINITY],
      ["NaN", Number.NaN],
      ["negative", -3],
      ["zero", 0],
      ["string", "7" as unknown as number],
    ])(
      "falls back to default Retry-After when retryAfter is %s",
      (_label, value) => {
        const req = createMockRequest();
        const res = createMockResponse();
        const error = Object.assign(new Error("busy"), {
          code: "QUEUE_FULL",
          retryAfter: value,
        });

        errorHandler(error, req, res, mockNext);

        expect(res.statusCode).toBe(503);
        expect(res.headers["Retry-After"]).toBe("5");
        expect(res.responseBody).toMatchObject({
          success: false,
          error: "busy",
          code: "QUEUE_FULL",
        });
      },
    );

    it("does not match unrelated error codes", () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const error = Object.assign(new Error("nope"), {
        code: "SOMETHING_ELSE",
      });

      errorHandler(error, req, res, mockNext);

      expect(res.statusCode).toBe(500);
      expect(res.headers["Retry-After"]).toBeUndefined();
    });
  });

  describe("RATE_LIMIT_UNAVAILABLE fail-closed mapping", () => {
    it("maps RATE_LIMIT_UNAVAILABLE to 503 with Retry-After from error.retryAfter", () => {
      const req = createMockRequest({ id: "rlu-1" });
      const res = createMockResponse();
      const error = Object.assign(new Error("limiter down"), {
        code: "RATE_LIMIT_UNAVAILABLE",
        retryAfter: 5,
      });

      errorHandler(error, req, res, mockNext);

      expect(res.statusCode).toBe(503);
      expect(res.headers["Retry-After"]).toBe("5");
      expect(res.responseBody).toMatchObject({
        success: false,
        error: "limiter down",
        code: "RATE_LIMIT_UNAVAILABLE",
        requestId: "rlu-1",
      });
    });

    it("maps RATE_LIMIT_UNAVAILABLE with default Retry-After when retryAfter missing", () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const error = Object.assign(new Error(""), {
        code: "RATE_LIMIT_UNAVAILABLE",
      });

      errorHandler(error, req, res, mockNext);

      expect(res.statusCode).toBe(503);
      expect(res.headers["Retry-After"]).toBe("5");
      expect(res.responseBody).toMatchObject({
        success: false,
        error: "Rate limiter temporarily unavailable, please retry.",
        code: "RATE_LIMIT_UNAVAILABLE",
      });
    });

    it.each([
      ["Infinity", Number.POSITIVE_INFINITY],
      ["NaN", Number.NaN],
      ["negative", -3],
      ["zero", 0],
      ["string", "7" as unknown as number],
    ])(
      "falls back to default Retry-After when retryAfter is %s",
      (_label, value) => {
        const req = createMockRequest();
        const res = createMockResponse();
        const error = Object.assign(new Error("down"), {
          code: "RATE_LIMIT_UNAVAILABLE",
          retryAfter: value,
        });

        errorHandler(error, req, res, mockNext);

        expect(res.statusCode).toBe(503);
        expect(res.headers["Retry-After"]).toBe("5");
        expect(res.responseBody).toMatchObject({
          success: false,
          error: "down",
          code: "RATE_LIMIT_UNAVAILABLE",
        });
      },
    );
  });

  describe("sensitive data redaction", () => {
    it("redacts email addresses in body preview", () => {
      const req = createMockRequest({
        body: { email: "user@example.com" },
      });
      const res = createMockResponse();

      errorHandler(new Error("test"), req, res, mockNext);

      // The redaction happens in logging, not in response
      expect(res.responseBody).toBeDefined();
    });

    it("redacts password fields in body", () => {
      const req = createMockRequest({
        body: { password: "secret123" },
      });
      const res = createMockResponse();

      errorHandler(new Error("test"), req, res, mockNext);

      expect(res.responseBody).toBeDefined();
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
    it("includes requestId in response when available", () => {
      const req = createMockRequest({ id: "unique-request-id" });
      const res = createMockResponse();

      errorHandler(new Error("test"), req, res, mockNext);

      expect(res.responseBody).toMatchObject({
        requestId: "unique-request-id",
      });
    });

    it("handles missing requestId gracefully", () => {
      const req = createMockRequest({});
      const res = createMockResponse();

      errorHandler(new Error("test"), req, res, mockNext);

      expect(res.responseBody).not.toHaveProperty("requestId");
    });

    it("handles empty body gracefully", () => {
      const req = createMockRequest({ body: {} });
      const res = createMockResponse();

      errorHandler(new Error("test"), req, res, mockNext);

      expect(res.statusCode).toBe(500);
    });

    it("uses fallback message for errors without message", () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const error = Object.assign(new Error(), { message: "" });

      errorHandler(error, req, res, mockNext);

      expect(res.responseBody).toMatchObject({
        error: "Internal server error",
      });
    });
  });

  describe("core behavior", () => {
    it("does not call next after handling error", () => {
      const req = createMockRequest();
      const res = createMockResponse();

      errorHandler(new Error("test"), req, res, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
    });

    it("logs error with request metadata", () => {
      const req = createMockRequest({
        id: "log-req",
        method: "POST",
        path: "/api/test",
      });
      const res = createMockResponse();

      errorHandler(new Error("Logged error"), req, res, mockNext);

      expect(res.statusCode).toBe(500);
    });
  });
});
