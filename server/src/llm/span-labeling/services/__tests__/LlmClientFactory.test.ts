import { describe, it, expect } from "vitest";
import { createLlmClient, spanProfileIdFor } from "../LlmClientFactory";
import { SpanLabelingClient } from "../SpanLabelingClient";
import { SPAN_PROVIDER_PROFILES } from "@llm/span-labeling/providers/registry";

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

    it("always builds a SpanLabelingClient carrying that profile", () => {
      const client = createLlmClient("groq");
      expect(client).toBeInstanceOf(SpanLabelingClient);
      expect((client as SpanLabelingClient).providerId).toBe("groq");
    });
  });

  describe("isolation constraint", () => {
    it("gives every provider a distinct profile object", () => {
      // ADR-0001 relied on class-per-provider to keep "changes to Groq must
      // not affect OpenAI"; ADR-0020 relies on this instead.
      const groq = SPAN_PROVIDER_PROFILES.groq;
      const openai = SPAN_PROVIDER_PROFILES.openai;

      expect(groq).not.toBe(openai);
      expect(groq.jsonSchema).not.toBe(openai.jsonSchema);
      expect(groq.requestOptions).not.toBe(openai.requestOptions);
      expect(groq.promptProviderName).not.toBe(openai.promptProviderName);
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
