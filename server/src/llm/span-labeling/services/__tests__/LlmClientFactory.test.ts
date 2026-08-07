import { describe, it, expect } from "vitest";
import { createLlmClient, spanClientProviderFor } from "../LlmClientFactory";
import { OpenAILlmClient } from "../OpenAILlmClient";
import { GroqLlmClient } from "../GroqLlmClient";
import { GeminiLlmClient } from "../GeminiLlmClient";
import { RobustLlmClient } from "../RobustLlmClient";

/**
 * The factory's whole job is now a mapping: executing provider -> the client
 * that shapes requests for it. Provider selection itself belongs to the
 * router (`aiService.resolveExecution`), so there is no env cascade to test
 * here — the tests that covered one died with it.
 */
describe("LlmClientFactory", () => {
  describe("provider -> client mapping", () => {
    it("routes each first-class provider to its own client", () => {
      expect(createLlmClient("openai")).toBeInstanceOf(OpenAILlmClient);
      expect(createLlmClient("groq")).toBeInstanceOf(GroqLlmClient);
      expect(createLlmClient("gemini")).toBeInstanceOf(GeminiLlmClient);
    });

    it("shapes qwen requests with the Groq client, since qwen is Groq-hosted", () => {
      expect(spanClientProviderFor("qwen")).toBe("groq");
      expect(createLlmClient("qwen")).toBeInstanceOf(GroqLlmClient);
    });

    it("falls back to the generic client rather than guessing", () => {
      expect(createLlmClient("anthropic")).toBeInstanceOf(RobustLlmClient);
      expect(createLlmClient("unknown")).toBeInstanceOf(RobustLlmClient);
    });
  });

  describe("isolation constraint", () => {
    it("gives Groq and OpenAI genuinely separate implementations", () => {
      // The factory exists so a Groq change cannot reach OpenAI behavior.
      expect(createLlmClient("groq")).not.toBeInstanceOf(OpenAILlmClient);
      expect(createLlmClient("openai")).not.toBeInstanceOf(GroqLlmClient);
    });
  });
});
