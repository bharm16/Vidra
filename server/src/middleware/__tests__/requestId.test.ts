import type { Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestIdMiddleware } from "../requestId";

// Mock uuid
vi.mock("uuid", () => ({
  v4: () => "generated-uuid-1234",
}));

// Mock requestContext
vi.mock("@infrastructure/requestContext", () => ({
  runWithRequestContext: vi.fn((ctx, fn) => fn()),
}));

type RequestWithId = {
  headers: Record<string, string | string[] | undefined>;
  id?: string;
};

function createMockRequest(
  headers: Record<string, string | string[] | undefined> = {},
): RequestWithId {
  return { headers } as RequestWithId;
}

function createMockResponse(): Response {
  return {
    setHeader: vi.fn(),
  } as unknown as Response;
}

describe("requestIdMiddleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("error handling", () => {
    it("handles missing x-request-id header by generating new ID", () => {
      const req = createMockRequest({});
      const res = createMockResponse();
      const next = vi.fn();

      requestIdMiddleware(req as never, res, next);

      expect(req.id).toBe("generated-uuid-1234");
    });
  });

  describe("edge cases", () => {
    it("uses first element when x-request-id is array", () => {
      const req = createMockRequest({
        "x-request-id": ["first-id", "second-id"],
      });
      const res = createMockResponse();
      const next = vi.fn();

      requestIdMiddleware(req as never, res, next);

      expect(req.id).toBe("first-id");
    });

    it("generates ID when array contains empty strings", () => {
      const req = createMockRequest({ "x-request-id": ["", "second-id"] });
      const res = createMockResponse();
      const next = vi.fn();

      requestIdMiddleware(req as never, res, next);

      expect(req.id).toBe("generated-uuid-1234");
    });
  });

  describe("core behavior", () => {
    it("uses provided x-request-id header value", () => {
      const req = createMockRequest({ "x-request-id": "custom-request-id" });
      const res = createMockResponse();
      const next = vi.fn();

      requestIdMiddleware(req as never, res, next);

      expect(req.id).toBe("custom-request-id");
    });

    it("sets X-Request-ID response header", () => {
      const req = createMockRequest({ "x-request-id": "test-id" });
      const res = createMockResponse();
      const next = vi.fn();

      requestIdMiddleware(req as never, res, next);

      expect(res.setHeader).toHaveBeenCalledWith("X-Request-ID", "test-id");
    });

    it("sets response header with generated ID when no header provided", () => {
      const req = createMockRequest({});
      const res = createMockResponse();
      const next = vi.fn();

      requestIdMiddleware(req as never, res, next);

      expect(res.setHeader).toHaveBeenCalledWith(
        "X-Request-ID",
        "generated-uuid-1234",
      );
    });
  });
});
