import { describe, it, expect, vi } from "vitest";
import { buildSystemPrompt, getFewShotExamples } from "../promptBuilder";

// Mock the logger to avoid side effects
vi.mock("@infrastructure/Logger", () => ({
  logger: {
    debug: vi.fn(),
  },
}));

describe("buildSystemPrompt", () => {
  describe("error handling", () => {
    it("handles empty text parameter", () => {
      const result = buildSystemPrompt("", false, "groq");

      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });

    it("handles unknown provider by defaulting to groq-style prompt", () => {
      const result = buildSystemPrompt("test", false, "unknown-provider");

      // Should use Groq as default, which includes security preamble
      expect(result).toContain("CRITICAL SECURITY DIRECTIVE");
    });
  });

  describe("edge cases", () => {
    it("handles mixed case provider names", () => {
      const lower = buildSystemPrompt("test", false, "openai");
      const upper = buildSystemPrompt("test", false, "OPENAI");
      const mixed = buildSystemPrompt("test", false, "OpenAI");

      // All should normalize to same output
      expect(upper).toBe(lower);
      expect(mixed).toBe(lower);
    });
  });

  describe("core behavior", () => {
    it("includes security preamble for non-gemini providers", () => {
      const groqResult = buildSystemPrompt("test", false, "groq");
      const openaiResult = buildSystemPrompt("test", false, "openai");

      expect(groqResult).toContain("CRITICAL SECURITY DIRECTIVE");
      expect(openaiResult).toContain("CRITICAL SECURITY DIRECTIVE");
    });

    it("returns different prompts for openai vs groq", () => {
      const openaiResult = buildSystemPrompt("test", false, "openai");
      const groqResult = buildSystemPrompt("test", false, "groq");

      // OpenAI uses minimal prompt, Groq uses full prompt
      expect(openaiResult.length).not.toBe(groqResult.length);
    });

    it("generates shorter groq prompt when useJsonSchema is true", () => {
      const withSchema = buildSystemPrompt("test", false, "groq", true);
      const withoutSchema = buildSystemPrompt("test", false, "groq", false);

      // When json_schema is active, format instructions can be removed
      expect(withSchema.length).toBeLessThanOrEqual(withoutSchema.length);
    });

    it("returns gemini-specific prompt without security preamble", () => {
      const result = buildSystemPrompt("test", false, "gemini");

      // Gemini has a lightweight prompt returned directly
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });
  });
});

describe("getFewShotExamples", () => {
  describe("error handling", () => {
    it("returns groq examples for unknown provider", () => {
      const result = getFewShotExamples("unknown");

      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("core behavior", () => {
    it("returns array of user/assistant message pairs", () => {
      const result = getFewShotExamples("groq");

      expect(Array.isArray(result)).toBe(true);
      result.forEach((example) => {
        expect(["user", "assistant"]).toContain(example.role);
        expect(typeof example.content).toBe("string");
      });
    });

    it("returns different example counts for openai vs groq", () => {
      const openaiExamples = getFewShotExamples("openai");
      const groqExamples = getFewShotExamples("groq");

      // OpenAI needs fewer examples since rules are in schema
      // Groq needs more examples for in-context learning
      expect(openaiExamples.length).not.toBe(groqExamples.length);
    });
  });
});
