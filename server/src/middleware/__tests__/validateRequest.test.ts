import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";
import { z } from "zod";
import { validateRequest } from "../validateRequest";

// Mock the logger
vi.mock("@infrastructure/Logger", () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

function createMockRequest(
  body: unknown = {},
  id?: string,
): Request & { id?: string } {
  return { body, path: "/test", id } as Request & { id?: string };
}

function createMockResponse(): Response & {
  statusCode?: number;
  body?: unknown;
} {
  const res = {
    statusCode: undefined as number | undefined,
    body: undefined as unknown,
    status: vi.fn().mockImplementation(function (this: Response, code: number) {
      (this as Response & { statusCode: number }).statusCode = code;
      return this;
    }),
    json: vi.fn().mockImplementation(function (this: Response, data: unknown) {
      (this as Response & { body: unknown }).body = data;
      return this;
    }),
  };
  return res as unknown as Response & { statusCode?: number; body?: unknown };
}

/**
 * These exercise real Zod schemas rather than hand-rolled `{ safeParse }`
 * stand-ins. The stand-ins produced issue objects with no `path`, which no
 * Zod version emits — they passed only because the old implementation read
 * `issues[0].message` and nothing else.
 *
 * The suite that asserted a 500 for a malformed schema is gone with the branch
 * it covered: `ValidationSchema` is `ZodSchema`, so "this isn't a schema" is a
 * compile error, and answering it at runtime with a 503-coded 500 turned a
 * developer's typo into a production-shaped incident.
 */
describe("validateRequest", () => {
  const UserSchema = z.object({
    email: z.string().email(),
    age: z.number().int(),
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Zod schema validation", () => {
    it("returns the canonical 400 when validation fails", () => {
      const middleware = validateRequest(UserSchema);
      const req = createMockRequest({ email: "invalid", age: 3 }, "req-123");
      const res = createMockResponse();
      const next = vi.fn();

      middleware(req, res, next);

      expect(res.statusCode).toBe(400);
      expect(res.body).toMatchObject({
        success: false,
        error: "Invalid request",
        code: "INVALID_REQUEST",
        requestId: "req-123",
      });
      expect(next).not.toHaveBeenCalled();
    });

    it("reports every invalid field, not just the first", () => {
      const middleware = validateRequest(UserSchema);
      const req = createMockRequest({ email: "invalid", age: "old" });
      const res = createMockResponse();
      const next = vi.fn();

      middleware(req, res, next);

      const details = (res.body as { details?: string }).details ?? "";
      expect(details).toContain("email");
      expect(details).toContain("age");
    });

    it("calls next and replaces body with validated data on success", () => {
      const middleware = validateRequest(
        z.object({ email: z.string(), keep: z.boolean().default(true) }),
      );
      const req = createMockRequest({ email: "valid@test.com", extra: "drop" });
      const res = createMockResponse();
      const next = vi.fn();

      middleware(req, res, next);

      // Zod strips unknown keys and applies defaults — the handler downstream
      // sees the parsed value, not the raw body.
      expect(req.body).toEqual({ email: "valid@test.com", keep: true });
      expect(next).toHaveBeenCalledTimes(1);
    });
  });

  describe("edge cases", () => {
    it("omits requestId entirely when the request carries no id", () => {
      const middleware = validateRequest(UserSchema);
      const req = createMockRequest({});
      const res = createMockResponse();
      const next = vi.fn();

      middleware(req, res, next);

      expect(res.body).not.toHaveProperty("requestId");
    });
  });
});
