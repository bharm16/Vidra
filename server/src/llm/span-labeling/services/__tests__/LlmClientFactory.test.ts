import { describe, it, expect } from "vitest";
import { createLlmClient, spanProfileIdFor } from "../LlmClientFactory";

/**
 * The factory's whole job is a mapping: executing provider -> the profile
 * that shapes requests for it. Provider selection itself belongs to the
 * router (`aiService.resolveExecution`), so there is no env cascade to test
 * here — the tests that covered one died with it.
 */
describe("LlmClientFactory", () => {
  describe("provider -> profile mapping", () => {
    it("routes each first-class provider to its own profile", () => {
      expect(spanProfileIdFor("openai")).toBe("openai");
      expect(spanProfileIdFor("groq")).toBe("groq");
      expect(spanProfileIdFor("gemini")).toBe("gemini");
    });

    it("shapes qwen requests with the Groq profile, since qwen is Groq-hosted", () => {
      expect(spanProfileIdFor("qwen")).toBe("groq");
    });

    it("falls back to the generic profile rather than guessing", () => {
      expect(spanProfileIdFor("anthropic")).toBe("generic");
      expect(spanProfileIdFor("unknown")).toBe("generic");
    });
  });

  describe("streaming capability", () => {
    it("exposes streamSpans only for providers that can stream", () => {
      // SpanLabelingService branches on `!llmClient.streamSpans` to fall back
      // to a buffered call; a method that always existed would disable that.
      expect(createLlmClient("gemini").streamSpans).toBeTypeOf("function");
      expect(createLlmClient("groq").streamSpans).toBeUndefined();
      expect(createLlmClient("openai").streamSpans).toBeUndefined();
      expect(createLlmClient("anthropic").streamSpans).toBeUndefined();
    });
  });
});
