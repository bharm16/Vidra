import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  enhancePromptForJSON,
  enhancePromptWithErrorFeedback,
} from "../promptEnhancers";
import type { StructuredOutputSchema } from "../types";

// Mock the logger
vi.mock("@infrastructure/Logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("enhancePromptForJSON", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("edge cases", () => {
    it("returns original prompt when strict schema and no format instructions needed", () => {
      const result = enhancePromptForJSON(
        "Base prompt",
        true,
        true,
        false,
        null,
      );

      expect(result).toBe("Base prompt");
    });
  });

  describe("core behavior", () => {
    it("adds array format instruction when isArray is true", () => {
      const result = enhancePromptForJSON(
        "Base prompt",
        true,
        false,
        true,
        null,
      );

      expect(result).toContain("Start with [");
    });

    it("adds object format instruction when schema type is object", () => {
      const schema: StructuredOutputSchema = { type: "object" };
      const result = enhancePromptForJSON(
        "Base prompt",
        true,
        false,
        true,
        schema,
      );

      expect(result).toContain("Start with {");
    });

    it("adds suggestions wrapper format when schema requires it", () => {
      const schema: StructuredOutputSchema = {
        type: "object",
        required: ["suggestions"],
      };
      const result = enhancePromptForJSON(
        "Base prompt",
        true,
        false,
        true,
        schema,
      );

      expect(result).toContain(
        '{"suggestions": [...your suggestions array here...]}',
      );
    });
  });
});

describe("enhancePromptWithErrorFeedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("edge cases", () => {
    it("adds suggestions wrapper retry instructions when schema requires it", () => {
      const schema: StructuredOutputSchema = {
        type: "object",
        required: ["suggestions"],
      };
      const result = enhancePromptWithErrorFeedback(
        "Base prompt",
        "Invalid JSON",
        true,
        true,
        schema,
      );

      expect(result).toContain("RETRY - USE THIS EXACT FORMAT");
      expect(result).toContain(
        '{"suggestions": [array of suggestion objects]}',
      );
      expect(result).toContain("Do NOT return a bare array");
    });

    it("includes retry instructions with object start for object schema", () => {
      const schema: StructuredOutputSchema = { type: "object" };
      const result = enhancePromptWithErrorFeedback(
        "Base prompt",
        "Parse error",
        true,
        true,
        schema,
      );

      expect(result).toContain("Start with {");
    });
  });

  describe("core behavior", () => {
    it("includes error message in retry prompt", () => {
      const errorMessage = "Unexpected token at position 42";
      const result = enhancePromptWithErrorFeedback(
        "Base prompt",
        errorMessage,
        true,
        true,
        null,
      );

      expect(result).toContain(errorMessage);
    });
  });
});
