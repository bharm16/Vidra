import { afterEach, describe, expect, it, vi } from "vitest";

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

import SpanLabelingConfig from "@server/llm/span-labeling/config/SpanLabelingConfig";
import { injectDefensiveMeta } from "@server/llm/span-labeling/services/robust-llm-client/defensiveMeta";
import { callModel } from "@server/llm/span-labeling/services/robust-llm-client/modelInvocation";
import { attemptRepair } from "@server/llm/span-labeling/services/robust-llm-client/repair";
import { twoPassExtraction } from "@server/llm/span-labeling/services/robust-llm-client/twoPassExtraction";
import * as SpanValidator from "@server/llm/span-labeling/validation/SpanValidator";
import * as SchemaValidator from "@server/llm/span-labeling/validation/SchemaValidator";
import * as ProviderDetector from "@server/utils/provider/ProviderDetector";
import * as ModelInvocation from "@server/llm/span-labeling/services/robust-llm-client/modelInvocation";

type CallModelAiService = Parameters<typeof callModel>[0]["aiService"];

const setTrackMetrics = (value: boolean) => {
  (
    SpanLabelingConfig.NLP_FAST_PATH as { TRACK_METRICS: boolean }
  ).TRACK_METRICS = value;
};

const originalTrackMetrics = SpanLabelingConfig.NLP_FAST_PATH.TRACK_METRICS;

afterEach(() => {
  setTrackMetrics(originalTrackMetrics);
  vi.restoreAllMocks();
});

const makeAiService = (
  execute: CallModelAiService["execute"],
): CallModelAiService => ({ execute }) as unknown as CallModelAiService;

describe("defensiveMeta", () => {
  describe("error handling", () => {
    it("no-ops when value is falsy", () => {
      expect(() =>
        injectDefensiveMeta(null as unknown as Record<string, unknown>, {
          templateVersion: "v1",
        }),
      ).not.toThrow();
    });

    it("adds analysis_trace and meta when missing", () => {
      const value: Record<string, unknown> = { spans: [{ text: "Hero" }] };

      injectDefensiveMeta(value, { templateVersion: "v2" });

      expect(typeof value.analysis_trace).toBe("string");
      const meta = value.meta as Record<string, unknown>;
      expect(meta.version).toBe("v2");
      expect(typeof meta.notes).toBe("string");
    });
  });

  describe("edge cases", () => {
    it("fills missing meta fields without overwriting provided values", () => {
      const value: Record<string, unknown> = {
        spans: [],
        meta: { version: "custom", notes: 123 },
      };

      injectDefensiveMeta(value, { templateVersion: "v2" });

      const meta = value.meta as Record<string, unknown>;
      expect(meta.version).toBe("custom");
      expect(meta.notes).toBe("");
    });

    it("writes NLP metrics when tracking is enabled", () => {
      setTrackMetrics(true);
      const value: Record<string, unknown> = { spans: [] };

      injectDefensiveMeta(value, { templateVersion: "v1" }, 3);

      const meta = value.meta as Record<string, unknown>;
      expect(meta.nlpAttempted).toBe(true);
      expect(meta.nlpSpansFound).toBe(3);
    });
  });

  describe("core behavior", () => {
    it("preserves existing analysis_trace", () => {
      const value: Record<string, unknown> = {
        spans: [],
        analysis_trace: "existing",
        meta: { version: "v1", notes: "" },
      };

      injectDefensiveMeta(value, { templateVersion: "v2" });

      expect(value.analysis_trace).toBe("existing");
    });
  });
});

describe("modelInvocation.callModel", () => {
  describe("error handling", () => {
    it("throws when few-shot payload is not valid JSON", async () => {
      const aiService = makeAiService(vi.fn());

      await expect(
        callModel({
          systemPrompt: "SYSTEM",
          userPayload: "not-json",
          aiService,
          maxTokens: 100,
          providerOptions: {
            enableBookending: false,
            useFewShot: true,
            useSeedFromConfig: false,
            enableLogprobs: false,
          },
        }),
      ).rejects.toThrow();
    });

    it("returns empty text when response has no text or content", async () => {
      const aiService = makeAiService(
        vi.fn().mockResolvedValue({ metadata: {} }),
      );

      const result = await callModel({
        systemPrompt: "SYSTEM",
        userPayload: JSON.stringify({ text: "Hello" }),
        aiService,
        maxTokens: 50,
        providerOptions: {
          enableBookending: false,
          useFewShot: false,
          useSeedFromConfig: false,
          enableLogprobs: false,
        },
      });

      expect(result.text).toBe("");
    });
  });

  describe("edge cases", () => {
    it("includes schema and disables jsonMode when schema is provided", async () => {
      const execute = vi.fn().mockResolvedValue({ text: "ok", metadata: {} });
      const aiService = makeAiService(execute);

      await callModel({
        systemPrompt: "SYSTEM",
        userPayload: JSON.stringify({ text: "Hello" }),
        aiService,
        maxTokens: 50,
        providerOptions: {
          enableBookending: false,
          useFewShot: false,
          useSeedFromConfig: true,
          enableLogprobs: false,
        },
        schema: { type: "object" },
      });

      const params = execute.mock.calls[0]?.[1] as {
        jsonMode?: boolean;
        schema?: unknown;
      };
      expect(params.jsonMode).toBe(false);
      expect(params.schema).toEqual({ type: "object" });
    });

    it("builds message array when few-shot examples are enabled", async () => {
      const execute = vi.fn().mockResolvedValue({ text: "ok", metadata: {} });
      const aiService = makeAiService(execute);

      await callModel({
        systemPrompt: "SYSTEM",
        userPayload: JSON.stringify({
          text: "<user_input>\nHello\n</user_input>",
        }),
        aiService,
        maxTokens: 50,
        providerOptions: {
          enableBookending: false,
          useFewShot: true,
          useSeedFromConfig: true,
          enableLogprobs: false,
          providerName: "groq",
        },
      });

      const params = execute.mock.calls[0]?.[1] as {
        messages?: Array<{ role: string; content: string }>;
      };
      const messages = params.messages ?? [];
      expect(messages[0]?.role).toBe("system");
      expect(messages[messages.length - 1]?.role).toBe("user");
    });
  });

  describe("core behavior", () => {
    it("prefers response.text when available", async () => {
      const aiService = makeAiService(
        vi.fn().mockResolvedValue({ text: "primary", metadata: {} }),
      );

      const result = await callModel({
        systemPrompt: "SYSTEM",
        userPayload: JSON.stringify({ text: "Hello" }),
        aiService,
        maxTokens: 50,
        providerOptions: {
          enableBookending: false,
          useFewShot: false,
          useSeedFromConfig: true,
          enableLogprobs: false,
        },
      });

      expect(result.text).toBe("primary");
    });
  });
});

describe("repair.attemptRepair", () => {
  describe("error handling", () => {
    it("throws when response parsing fails", async () => {
      const callModelSpy = vi
        .spyOn(ModelInvocation, "callModel")
        .mockResolvedValue({ text: "bad" });
      vi.spyOn(SchemaValidator, "validateSchemaOrThrow").mockImplementation(
        () => undefined,
      );
      const validateSpansSpy = vi
        .spyOn(SpanValidator, "validateSpans")
        .mockReturnValue({
          ok: true,
          verdict: "pass" as const,
          errors: [],
          result: { spans: [], meta: { version: "v1", notes: "" } },
        });

      await expect(
        attemptRepair({
          basePayload: {
            task: "task",
            policy: {},
            text: "text",
            templateVersion: "v1",
          },
          validationErrors: ["bad"],
          originalResponse: {},
          text: "text",
          policy: {},
          options: {},
          aiService: {} as never,
          cache: {} as never,
          estimatedMaxTokens: 100,
          providerOptions: {
            enableBookending: false,
            useFewShot: false,
            useSeedFromConfig: true,
            enableLogprobs: false,
          },
          providerName: "openai",
          parseResponseText: () => ({
            ok: false,
            verdict: "retryable" as const,
            error: "parse-fail",
          }),
          normalizeParsedResponse: (value) => value,
          injectDefensiveMeta: () => undefined,
        }),
      ).rejects.toThrow("parse-fail");

      callModelSpy.mockRestore();
      validateSpansSpy.mockRestore();
    });

    it("throws when repaired spans fail validation", async () => {
      vi.spyOn(ModelInvocation, "callModel").mockResolvedValue({
        text: '{"spans":[]}',
      });
      vi.spyOn(SchemaValidator, "validateSchemaOrThrow").mockImplementation(
        () => undefined,
      );
      vi.spyOn(SpanValidator, "validateSpans").mockReturnValue({
        ok: false,
        verdict: "retryable" as const,
        errors: ["bad span"],
        result: { spans: [], meta: { version: "v1", notes: "" } },
      });

      await expect(
        attemptRepair({
          basePayload: {
            task: "task",
            policy: {},
            text: "text",
            templateVersion: "v1",
          },
          validationErrors: ["bad"],
          originalResponse: {},
          text: "text",
          policy: {},
          options: {},
          aiService: {} as never,
          cache: {} as never,
          estimatedMaxTokens: 100,
          providerOptions: {
            enableBookending: false,
            useFewShot: false,
            useSeedFromConfig: true,
            enableLogprobs: false,
          },
          providerName: "openai",
          parseResponseText: (text) => ({
            ok: true,
            verdict: "pass" as const,
            value: JSON.parse(text),
          }),
          normalizeParsedResponse: (value) => value,
          injectDefensiveMeta: () => undefined,
        }),
      ).rejects.toThrow("Repair attempt failed validation");
    });
  });

  describe("edge cases", () => {
    it("injects defensive meta for gemini responses before validation", async () => {
      vi.spyOn(ModelInvocation, "callModel").mockResolvedValue({
        text: '{"spans":[]}',
      });
      vi.spyOn(SchemaValidator, "validateSchemaOrThrow").mockImplementation(
        () => undefined,
      );

      let receivedMeta: Record<string, unknown> | null = null;
      vi.spyOn(SpanValidator, "validateSpans").mockImplementation(
        ({ meta }) => {
          receivedMeta = meta as Record<string, unknown>;
          return {
            ok: true,
            verdict: "pass" as const,
            errors: [],
            result: {
              spans: [],
              meta: meta as { version: string; notes: string },
            },
          };
        },
      );

      await attemptRepair({
        basePayload: {
          task: "task",
          policy: {},
          text: "text",
          templateVersion: "v1",
        },
        validationErrors: ["bad"],
        originalResponse: {},
        text: "text",
        policy: {},
        options: { templateVersion: "v9" },
        aiService: {} as never,
        cache: {} as never,
        estimatedMaxTokens: 100,
        providerOptions: {
          enableBookending: false,
          useFewShot: false,
          useSeedFromConfig: true,
          enableLogprobs: false,
        },
        providerName: "gemini",
        parseResponseText: (text) => ({
          ok: true,
          verdict: "pass" as const,
          value: JSON.parse(text),
        }),
        normalizeParsedResponse: (value) => value,
        injectDefensiveMeta: (value) => {
          value.meta = { version: "v9", notes: "" };
        },
      });

      expect(receivedMeta?.["version"]).toBe("v9");
    });

    it("passes normalized response into validation", async () => {
      vi.spyOn(ModelInvocation, "callModel").mockResolvedValue({
        text: '{"spans":[]}',
      });
      vi.spyOn(SchemaValidator, "validateSchemaOrThrow").mockImplementation(
        () => undefined,
      );

      let validationInput: Record<string, unknown> | null = null;
      vi.spyOn(SpanValidator, "validateSpans").mockImplementation(
        ({ meta }) => {
          validationInput = meta as Record<string, unknown>;
          return {
            ok: true,
            verdict: "pass" as const,
            errors: [],
            result: {
              spans: [],
              meta: meta as { version: string; notes: string },
            },
          };
        },
      );

      await attemptRepair({
        basePayload: {
          task: "task",
          policy: {},
          text: "text",
          templateVersion: "v1",
        },
        validationErrors: ["bad"],
        originalResponse: {},
        text: "text",
        policy: {},
        options: {},
        aiService: {} as never,
        cache: {} as never,
        estimatedMaxTokens: 100,
        providerOptions: {
          enableBookending: false,
          useFewShot: false,
          useSeedFromConfig: true,
          enableLogprobs: false,
        },
        providerName: "openai",
        parseResponseText: (text) => ({
          ok: true,
          verdict: "pass" as const,
          value: JSON.parse(text),
        }),
        normalizeParsedResponse: (value) => ({
          ...value,
          meta: { version: "v1", notes: "" },
        }),
        injectDefensiveMeta: () => undefined,
      });

      expect(validationInput?.["version"]).toBe("v1");
    });
  });

  describe("core behavior", () => {
    it("returns the validated repair result on success", async () => {
      vi.spyOn(ModelInvocation, "callModel").mockResolvedValue({
        text: '{"spans":[]}',
      });
      vi.spyOn(SchemaValidator, "validateSchemaOrThrow").mockImplementation(
        () => undefined,
      );
      vi.spyOn(SpanValidator, "validateSpans").mockReturnValue({
        ok: true,
        verdict: "pass" as const,
        errors: [],
        result: { spans: [], meta: { version: "v1", notes: "ok" } },
      });

      const result = await attemptRepair({
        basePayload: {
          task: "task",
          policy: {},
          text: "text",
          templateVersion: "v1",
        },
        validationErrors: ["bad"],
        originalResponse: {},
        text: "text",
        policy: {},
        options: {},
        aiService: {} as never,
        cache: {} as never,
        estimatedMaxTokens: 100,
        providerOptions: {
          enableBookending: false,
          useFewShot: false,
          useSeedFromConfig: true,
          enableLogprobs: false,
        },
        providerName: "openai",
        parseResponseText: (text) => ({
          ok: true,
          verdict: "pass" as const,
          value: JSON.parse(text),
        }),
        normalizeParsedResponse: (value) => value,
        injectDefensiveMeta: () => undefined,
      });

      expect(result.result.meta.notes).toBe("ok");
    });
  });
});

describe("twoPassExtraction", () => {
  describe("error handling", () => {
    it("uses reasoning prompt on first pass", async () => {
      const callModelSpy = vi
        .spyOn(ModelInvocation, "callModel")
        .mockResolvedValueOnce({ text: "analysis" })
        .mockResolvedValueOnce({ text: "final" });
      vi.spyOn(ProviderDetector, "detectAndGetCapabilities").mockReturnValue({
        provider: "openai",
        capabilities: { developerRole: false },
      } as ReturnType<typeof ProviderDetector.detectAndGetCapabilities>);

      await twoPassExtraction({
        systemPrompt: "SYSTEM",
        userPayload: JSON.stringify({ text: "Hello" }),
        aiService: {} as never,
        maxTokens: 100,
        providerOptions: {
          enableBookending: false,
          useFewShot: false,
          useSeedFromConfig: true,
          enableLogprobs: false,
        },
        providerName: "openai",
      });

      const firstCall = callModelSpy.mock.calls[0]?.[0];
      expect(firstCall?.systemPrompt).toContain("Pass 1: REASONING");
    });

    it("injects developer message when supported", async () => {
      const callModelSpy = vi
        .spyOn(ModelInvocation, "callModel")
        .mockResolvedValueOnce({ text: "analysis" })
        .mockResolvedValueOnce({ text: "final" });
      vi.spyOn(ProviderDetector, "detectAndGetCapabilities").mockReturnValue({
        provider: "openai",
        capabilities: { developerRole: true },
      } as ReturnType<typeof ProviderDetector.detectAndGetCapabilities>);

      await twoPassExtraction({
        systemPrompt: "SYSTEM",
        userPayload: JSON.stringify({ text: "Hello" }),
        aiService: {} as never,
        maxTokens: 100,
        providerOptions: {
          enableBookending: false,
          useFewShot: false,
          useSeedFromConfig: true,
          enableLogprobs: false,
        },
        providerName: "openai",
      });

      const secondCall = callModelSpy.mock.calls[1]?.[0];
      expect(secondCall?.providerOptions.developerMessage).toContain(
        "STRUCTURING MODE",
      );
    });
  });

  describe("edge cases", () => {
    it("includes reasoning text in structuring prompt when no developer role", async () => {
      const callModelSpy = vi
        .spyOn(ModelInvocation, "callModel")
        .mockResolvedValueOnce({ text: "analysis text" })
        .mockResolvedValueOnce({ text: "final" });
      vi.spyOn(ProviderDetector, "detectAndGetCapabilities").mockReturnValue({
        provider: "groq",
        capabilities: { developerRole: false },
      } as ReturnType<typeof ProviderDetector.detectAndGetCapabilities>);

      await twoPassExtraction({
        systemPrompt: "SYSTEM",
        userPayload: JSON.stringify({ text: "Hello" }),
        aiService: {} as never,
        maxTokens: 100,
        providerOptions: {
          enableBookending: false,
          useFewShot: false,
          useSeedFromConfig: true,
          enableLogprobs: false,
        },
        providerName: "groq",
      });

      const secondCall = callModelSpy.mock.calls[1]?.[0];
      expect(secondCall?.systemPrompt).toContain("analysis text");
    });

    it("preserves system prompt when developer role is used", async () => {
      const callModelSpy = vi
        .spyOn(ModelInvocation, "callModel")
        .mockResolvedValueOnce({ text: "analysis text" })
        .mockResolvedValueOnce({ text: "final" });
      vi.spyOn(ProviderDetector, "detectAndGetCapabilities").mockReturnValue({
        provider: "openai",
        capabilities: { developerRole: true },
      } as ReturnType<typeof ProviderDetector.detectAndGetCapabilities>);

      await twoPassExtraction({
        systemPrompt: "SYSTEM",
        userPayload: JSON.stringify({ text: "Hello" }),
        aiService: {} as never,
        maxTokens: 100,
        providerOptions: {
          enableBookending: false,
          useFewShot: false,
          useSeedFromConfig: true,
          enableLogprobs: false,
        },
        providerName: "openai",
      });

      const secondCall = callModelSpy.mock.calls[1]?.[0];
      expect(secondCall?.systemPrompt).toBe("SYSTEM");
    });
  });

  describe("core behavior", () => {
    it("returns the structured response from pass two", async () => {
      const structured = { text: "final", metadata: { stage: "two" } };
      vi.spyOn(ModelInvocation, "callModel")
        .mockResolvedValueOnce({ text: "analysis" })
        .mockResolvedValueOnce(structured);
      vi.spyOn(ProviderDetector, "detectAndGetCapabilities").mockReturnValue({
        provider: "openai",
        capabilities: { developerRole: false },
      } as ReturnType<typeof ProviderDetector.detectAndGetCapabilities>);

      const result = await twoPassExtraction({
        systemPrompt: "SYSTEM",
        userPayload: JSON.stringify({ text: "Hello" }),
        aiService: {} as never,
        maxTokens: 100,
        providerOptions: {
          enableBookending: false,
          useFewShot: false,
          useSeedFromConfig: true,
          enableLogprobs: false,
        },
        providerName: "openai",
      });

      expect(result).toEqual(structured);
    });
  });
});
