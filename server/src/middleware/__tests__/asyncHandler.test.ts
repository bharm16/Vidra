import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { asyncHandler } from "../asyncHandler";

function createMockRequest(): Request {
  return {} as Request;
}

function createMockResponse(): Response {
  return {} as Response;
}

describe("asyncHandler", () => {
  describe("error handling", () => {
    it("passes rejected promise error to next", async () => {
      const error = new Error("async failure");
      const handler = asyncHandler(async () => {
        throw error;
      });
      const next = vi.fn();

      await handler(createMockRequest(), createMockResponse(), next);

      expect(next).toHaveBeenCalledWith(error);
    });

    it("passes synchronous thrown errors to next", () => {
      const error = new Error("sync failure");
      const handler = asyncHandler(() => {
        throw error;
      });
      const next = vi.fn();

      expect(() =>
        handler(createMockRequest(), createMockResponse(), next),
      ).not.toThrow();
      expect(next).toHaveBeenCalledWith(error);
    });

    it("passes non-Error thrown value to next", async () => {
      const handler = asyncHandler(async () => {
        throw "string error";
      });
      const next = vi.fn();

      await handler(createMockRequest(), createMockResponse(), next);

      expect(next).toHaveBeenCalledWith("string error");
    });
  });

  describe("edge cases", () => {
    it("handles handler that calls next explicitly", async () => {
      const handler = asyncHandler(async (_req, _res, next) => {
        next();
      });
      const next = vi.fn();

      await handler(createMockRequest(), createMockResponse(), next);

      expect(next).toHaveBeenCalledWith();
    });
  });

  describe("core behavior", () => {
    it("allows handler to send response without calling next", async () => {
      const mockRes = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      } as unknown as Response;
      const handler = asyncHandler(async (_req, res) => {
        res.status(200).json({ success: true });
      });
      const next = vi.fn();

      await handler(createMockRequest(), mockRes, next);

      expect(mockRes.json).toHaveBeenCalledWith({ success: true });
      expect(next).not.toHaveBeenCalled();
    });
  });
});
