import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { normalizeOptimizationRequest } from "../normalizeOptimizationRequest";

function createMockRequest(body: unknown = {}): Request {
  return { body } as Request;
}

function createMockResponse(): Response {
  return {} as Response;
}

describe("normalizeOptimizationRequest", () => {
  describe("error handling", () => {
    it("handles null body by creating empty object", () => {
      const req = createMockRequest(null);
      const next = vi.fn();

      normalizeOptimizationRequest(req, createMockResponse(), next);

      expect(req.body).toEqual({
        context: null,
        brainstormContext: null,
      });
    });

    it("handles non-object body by creating empty object", () => {
      const req = createMockRequest("invalid");
      const next = vi.fn();

      normalizeOptimizationRequest(req, createMockResponse(), next);

      expect(req.body).toEqual({
        context: null,
        brainstormContext: null,
      });
    });

    it("handles array body by creating empty object", () => {
      const req = createMockRequest([1, 2, 3]);
      const next = vi.fn();

      normalizeOptimizationRequest(req, createMockResponse(), next);

      expect(req.body).toEqual({
        context: null,
        brainstormContext: null,
      });
    });
  });

  describe("context normalization", () => {
    it("coerces valid JSON string context to object", () => {
      const req = createMockRequest({
        context: '{"key": "value"}',
      });
      const next = vi.fn();

      normalizeOptimizationRequest(req, createMockResponse(), next);

      expect(req.body.context).toEqual({ key: "value" });
    });

    it("sets context to null for invalid JSON string", () => {
      const req = createMockRequest({
        context: "not valid json",
      });
      const next = vi.fn();

      normalizeOptimizationRequest(req, createMockResponse(), next);

      expect(req.body.context).toBeNull();
    });

    it("sets context to null for JSON array string", () => {
      const req = createMockRequest({
        context: "[1, 2, 3]",
      });
      const next = vi.fn();

      normalizeOptimizationRequest(req, createMockResponse(), next);

      expect(req.body.context).toBeNull();
    });

    it("preserves valid object context", () => {
      const req = createMockRequest({
        context: { model: "sora", duration: 10 },
      });
      const next = vi.fn();

      normalizeOptimizationRequest(req, createMockResponse(), next);

      expect(req.body.context).toEqual({ model: "sora", duration: 10 });
    });
  });

  describe("brainstormContext normalization", () => {
    it("coerces valid JSON string brainstormContext to object", () => {
      const req = createMockRequest({
        brainstormContext: '{"theme": "nature"}',
      });
      const next = vi.fn();

      normalizeOptimizationRequest(req, createMockResponse(), next);

      expect(req.body.brainstormContext).toEqual({ theme: "nature" });
    });

    it("sets brainstormContext to null for primitive", () => {
      const req = createMockRequest({
        brainstormContext: 123,
      });
      const next = vi.fn();

      normalizeOptimizationRequest(req, createMockResponse(), next);

      expect(req.body.brainstormContext).toBeNull();
    });
  });

  describe("generationParams normalization", () => {
    it("removes non-object generationParams", () => {
      const req = createMockRequest({
        generationParams: "invalid",
      });
      const next = vi.fn();

      normalizeOptimizationRequest(req, createMockResponse(), next);

      expect(req.body.generationParams).toBeUndefined();
    });

    it("filters out non-primitive values from generationParams", () => {
      const req = createMockRequest({
        generationParams: {
          width: 1920,
          height: 1080,
          nested: { key: "value" },
          arr: [1, 2, 3],
        },
      });
      const next = vi.fn();

      normalizeOptimizationRequest(req, createMockResponse(), next);

      expect(req.body.generationParams).toEqual({
        width: 1920,
        height: 1080,
      });
    });

    it("preserves string, number, and boolean values", () => {
      const req = createMockRequest({
        generationParams: {
          model: "sora",
          duration: 5,
          loop: true,
        },
      });
      const next = vi.fn();

      normalizeOptimizationRequest(req, createMockResponse(), next);

      expect(req.body.generationParams).toEqual({
        model: "sora",
        duration: 5,
        loop: true,
      });
    });
  });

  describe("lockedSpans normalization", () => {
    it("removes non-array lockedSpans", () => {
      const req = createMockRequest({
        lockedSpans: "invalid",
      });
      const next = vi.fn();

      normalizeOptimizationRequest(req, createMockResponse(), next);

      expect(req.body.lockedSpans).toBeUndefined();
    });

    it("filters out non-object spans", () => {
      const req = createMockRequest({
        lockedSpans: [
          { text: "valid", id: "1" },
          null,
          "string",
          123,
          { text: "also valid", id: "2" },
        ],
      });
      const next = vi.fn();

      normalizeOptimizationRequest(req, createMockResponse(), next);

      expect(req.body.lockedSpans).toHaveLength(2);
    });

    it("filters out spans with empty text", () => {
      const req = createMockRequest({
        lockedSpans: [
          { text: "valid", id: "1" },
          { text: "", id: "2" },
          { text: "   ", id: "3" },
        ],
      });
      const next = vi.fn();

      normalizeOptimizationRequest(req, createMockResponse(), next);

      expect(req.body.lockedSpans).toHaveLength(1);
      expect(req.body.lockedSpans[0].text).toBe("valid");
    });

    it("preserves only valid span properties", () => {
      const req = createMockRequest({
        lockedSpans: [
          {
            id: "span-1",
            text: "locked text",
            leftCtx: "left",
            rightCtx: "right",
            category: "subject",
            source: "user",
            confidence: 0.9,
            invalidProp: "should be removed",
          },
        ],
      });
      const next = vi.fn();

      normalizeOptimizationRequest(req, createMockResponse(), next);

      const span = req.body.lockedSpans[0];
      expect(span).toEqual({
        id: "span-1",
        text: "locked text",
        leftCtx: "left",
        rightCtx: "right",
        category: "subject",
        source: "user",
        confidence: 0.9,
      });
    });

    it("filters invalid confidence values", () => {
      const req = createMockRequest({
        lockedSpans: [{ text: "test", confidence: Infinity }],
      });
      const next = vi.fn();

      normalizeOptimizationRequest(req, createMockResponse(), next);

      expect(req.body.lockedSpans[0].confidence).toBeUndefined();
    });

    it("allows null for optional string fields", () => {
      const req = createMockRequest({
        lockedSpans: [
          {
            text: "test",
            leftCtx: null,
            rightCtx: null,
            category: null,
            source: null,
          },
        ],
      });
      const next = vi.fn();

      normalizeOptimizationRequest(req, createMockResponse(), next);

      const span = req.body.lockedSpans[0];
      expect(span.leftCtx).toBeNull();
      expect(span.rightCtx).toBeNull();
      expect(span.category).toBeNull();
      expect(span.source).toBeNull();
    });
  });

  describe("core behavior", () => {
    it("preserves unrelated body properties", () => {
      const req = createMockRequest({
        prompt: "my prompt",
        mode: "video",
        customField: "preserved",
      });
      const next = vi.fn();

      normalizeOptimizationRequest(req, createMockResponse(), next);

      expect(req.body.prompt).toBe("my prompt");
      expect(req.body.mode).toBe("video");
      expect(req.body.customField).toBe("preserved");
    });
  });
});
