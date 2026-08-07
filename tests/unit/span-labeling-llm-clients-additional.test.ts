import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@infrastructure/Logger", () => ({
  logger: {
    child: () => mockLogger,
    debug: mockLogger.debug,
    info: mockLogger.info,
    warn: mockLogger.warn,
    error: mockLogger.error,
  },
}));

import { GeminiLlmClient } from "@server/llm/span-labeling/services/GeminiLlmClient";
import { GroqLlmClient } from "@server/llm/span-labeling/services/GroqLlmClient";
import { OpenAILlmClient } from "@server/llm/span-labeling/services/OpenAILlmClient";
import type { LabelSpansResult } from "@server/llm/span-labeling/types";

class TestGroqClient extends GroqLlmClient {
  setMetadata(meta: { averageConfidence?: number }) {
    this._lastResponseMetadata = meta;
  }

  post(result: LabelSpansResult) {
    return this._postProcessResult(result);
  }
}

class TestOpenAIClient extends OpenAILlmClient {
  post(result: LabelSpansResult) {
    return this._postProcessResult(result);
  }
}

describe("GroqLlmClient (additional)", () => {
  describe("error handling", () => {
    it("skips adjustment when logprobs metadata is missing", () => {
      const client = new TestGroqClient();
      client.setMetadata({});

      const result = client.post({
        spans: [{ text: "sky", role: "style", confidence: 0.9 }],
        meta: { version: "v1", notes: "" },
      });

      expect(result.spans[0]?.confidence).toBe(0.9);
      const providerOptimizations = (result.meta._providerOptimizations ??
        {}) as Record<string, unknown>;
      expect(providerOptimizations.logprobsAdjustment).toBe(false);
    });

    it("keeps result unchanged when no spans exist", () => {
      const client = new TestGroqClient();
      client.setMetadata({ averageConfidence: 0.2 });

      const result = client.post({
        spans: [],
        meta: { version: "v1", notes: "" },
      });

      expect(result.spans).toEqual([]);
      const providerOptimizations = (result.meta._providerOptimizations ??
        {}) as Record<string, unknown>;
      expect(providerOptimizations.logprobsAdjustment).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("caps confidence using logprobs average when lower", () => {
      const client = new TestGroqClient();
      client.setMetadata({ averageConfidence: 0.4 });

      const result = client.post({
        spans: [{ text: "sky", role: "style", confidence: 0.8 }],
        meta: { version: "v1", notes: "" },
      });

      expect(result.spans[0]?.confidence).toBe(0.4);
      const span = result.spans[0] as Record<string, unknown> | undefined;
      expect(span?._originalConfidence).toBe(0.8);
    });

    it("does not increase confidence above self-reported value", () => {
      const client = new TestGroqClient();
      client.setMetadata({ averageConfidence: 0.9 });

      const result = client.post({
        spans: [{ text: "sky", role: "style", confidence: 0.3 }],
        meta: { version: "v1", notes: "" },
      });

      expect(result.spans[0]?.confidence).toBe(0.3);
    });
  });

  describe("core behavior", () => {
    it("adds provider metadata for debugging", () => {
      const client = new TestGroqClient();
      client.setMetadata({ averageConfidence: 0.5 });

      const result = client.post({
        spans: [{ text: "sky", role: "style", confidence: 0.6 }],
        meta: { version: "v1", notes: "" },
      });

      expect(result.meta._clientType).toBe("GroqLlmClient");
      const providerOptimizations = (result.meta._providerOptimizations ??
        {}) as Record<string, unknown>;
      expect(providerOptimizations.provider).toBe("groq");
    });
  });
});

describe("OpenAILlmClient (additional)", () => {
  describe("error handling", () => {
    it("returns meta even when spans are empty", () => {
      const client = new TestOpenAIClient();

      const result = client.post({
        spans: [],
        meta: { version: "v1", notes: "" },
      });

      expect(result.meta._clientType).toBe("OpenAILlmClient");
    });

    it("preserves existing meta fields while appending provider info", () => {
      const client = new TestOpenAIClient();

      const result = client.post({
        spans: [{ text: "sky", role: "style", confidence: 0.8 }],
        meta: { version: "v1", notes: "keep" },
      });

      expect(result.meta.notes).toBe("keep");
      const providerOptimizations = (result.meta._providerOptimizations ??
        {}) as Record<string, unknown>;
      expect(providerOptimizations.provider).toBe("openai");
    });
  });

  describe("edge cases", () => {
    it("sets strictSchema metadata flag", () => {
      const client = new TestOpenAIClient();

      const result = client.post({
        spans: [{ text: "sky", role: "style", confidence: 0.8 }],
        meta: { version: "v1", notes: "" },
      });

      const providerOptimizations = (result.meta._providerOptimizations ??
        {}) as Record<string, unknown>;
      expect(providerOptimizations.strictSchema).toBe(true);
    });

    it("does not alter existing span data", () => {
      const client = new TestOpenAIClient();

      const result = client.post({
        spans: [{ text: "sky", role: "style", confidence: 0.8 }],
        meta: { version: "v1", notes: "" },
      });

      expect(result.spans[0]?.text).toBe("sky");
      expect(result.spans[0]?.confidence).toBe(0.8);
    });
  });

  describe("core behavior", () => {
    it("labels the optimization provider as openai", () => {
      const client = new TestOpenAIClient();

      const result = client.post({
        spans: [{ text: "sky", role: "style", confidence: 0.8 }],
        meta: { version: "v1", notes: "" },
      });

      const providerOptimizations = (result.meta._providerOptimizations ??
        {}) as Record<string, unknown>;
      expect(providerOptimizations.provider).toBe("openai");
      expect(providerOptimizations.logprobsAdjustment).toBe(false);
    });
  });
});

describe("GeminiLlmClient (additional)", () => {
  describe("error handling", () => {
    it("recovers spans from partially structured text", () => {
      const client = new GeminiLlmClient();
      const response = 'Here are spans: [ {"text":"Hero","role":"subject"} ]';

      const parsed = (
        client as unknown as {
          _parseResponseText: (text: string) => {
            ok: boolean;
            value?: unknown;
          };
        }
      )._parseResponseText(response);

      expect(parsed.ok).toBe(true);
      if (parsed.ok) {
        const value = parsed.value as unknown;
        const recoveredText = Array.isArray(value)
          ? (value[0] as { text?: string } | undefined)?.text
          : ((value as { spans?: Array<{ text: string }>; text?: string })
              ?.spans?.[0]?.text ?? (value as { text?: string })?.text);
        expect(recoveredText).toBe("Hero");
      }
    });

    it("normalizes category field into role", () => {
      const client = new GeminiLlmClient();
      const normalized = (
        client as unknown as {
          _normalizeParsedResponse: (
            value: Record<string, unknown>,
          ) => Record<string, unknown>;
        }
      )._normalizeParsedResponse({
        spans: [{ text: "Hero", category: "subject" }],
      });

      const span = (normalized.spans as Array<Record<string, unknown>>)[0];
      expect(span).toBeDefined();
      expect(span?.role).toBe("subject");
      expect(span ? "category" in span : false).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("streams NDJSON payloads while stripping array wrappers", async () => {
      const client = new GeminiLlmClient();
      const chunks = [
        "[\n",
        '{"text":"Hero","role":"subject"},\n',
        '{"text":"Sky","category":"style"}\n',
        "]\n",
      ];

      const aiService = {
        stream: vi
          .fn()
          .mockImplementation(
            async (
              _op: string,
              { onChunk }: { onChunk: (chunk: string) => void },
            ) => {
              chunks.forEach(onChunk);
            },
          ),
      } as never;

      const results: Array<Record<string, unknown>> = [];
      for await (const span of client.streamSpans({
        text: "Hero Sky",
        policy: {},
        options: {},
        enableRepair: false,
        aiService,
        cache: {} as never,
      })) {
        results.push(span);
      }

      expect(results).toHaveLength(2);
      expect(results[0]?.role).toBe("subject");
      expect(results[1]?.category).toBe("style");
    });

    it("adds category when role is present in streaming mode", async () => {
      const client = new GeminiLlmClient();
      const aiService = {
        stream: vi
          .fn()
          .mockImplementation(
            async (
              _op: string,
              { onChunk }: { onChunk: (chunk: string) => void },
            ) => {
              onChunk('{"text":"Hero","role":"subject"}\n');
            },
          ),
      } as never;

      const results: Array<Record<string, unknown>> = [];
      for await (const span of client.streamSpans({
        text: "Hero",
        policy: {},
        options: {},
        enableRepair: false,
        aiService,
        cache: {} as never,
      })) {
        results.push(span);
      }

      expect(results[0]?.category).toBe("subject");
    });
  });

  describe("core behavior", () => {
    it("parses valid JSON responses without recovery", () => {
      const client = new GeminiLlmClient();
      const response = JSON.stringify({
        spans: [{ text: "Hero", role: "subject" }],
      });

      const parsed = (
        client as unknown as {
          _parseResponseText: (text: string) => {
            ok: boolean;
            value?: unknown;
          };
        }
      )._parseResponseText(response);

      expect(parsed.ok).toBe(true);
      if (parsed.ok) {
        const value = parsed.value as { spans?: Array<{ role?: string }> };
        expect(value.spans?.[0]?.role).toBe("subject");
      }
    });
  });
});
