import { describe, it, expect, vi } from "vitest";
import { buildSystemPrompt } from "../promptBuilder";

// Mock the logger to avoid side effects
vi.mock("@infrastructure/Logger", () => ({
  logger: {
    debug: vi.fn(),
  },
}));

describe("buildSystemPrompt", () => {
  describe("error handling", () => {
    it("handles unknown provider by defaulting to groq-style prompt", () => {
      const result = buildSystemPrompt("test", false, "unknown-provider");

      expect(result).toBe(buildSystemPrompt("test", false, "groq"));
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
  });
});
