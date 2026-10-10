import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { enforceVideoMode } from "../enforceVideoMode";

function createMockRequest(body: unknown = {}): Request {
  return { body } as Request;
}

function createMockResponse(): Response {
  return {} as Response;
}

describe("enforceVideoMode", () => {
  describe("error handling", () => {
    it("handles null body by creating object with video mode", () => {
      const req = createMockRequest(null);
      const next = vi.fn();

      enforceVideoMode(req, createMockResponse(), next);

      expect(req.body).toEqual({ mode: "video" });
    });

    it("handles string body by creating object with video mode", () => {
      const req = createMockRequest("invalid");
      const next = vi.fn();

      enforceVideoMode(req, createMockResponse(), next);

      expect(req.body).toEqual({ mode: "video" });
    });
  });

  describe("core behavior", () => {
    it("preserves other body properties", () => {
      const req = createMockRequest({
        mode: "image",
        prompt: "test prompt",
        options: { key: "value" },
      });
      const next = vi.fn();

      enforceVideoMode(req, createMockResponse(), next);

      expect(req.body).toEqual({
        mode: "video",
        prompt: "test prompt",
        options: { key: "value" },
      });
    });
  });
});
