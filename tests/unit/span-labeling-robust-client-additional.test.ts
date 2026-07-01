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

vi.mock("@utils/provider/ProviderDetector", () => ({
  detectAndGetCapabilities: vi.fn(() => ({
    provider: "openai",
    capabilities: {
      strictJsonSchema: false,
      developerRole: false,
    },
  })),
}));

vi.mock("@utils/provider/SchemaFactory", () => ({
  getSpanLabelingSchema: vi.fn(() => ({ type: "object" })),
}));

vi.mock("@server/llm/span-labeling/validation/SchemaValidator", () => ({
  validateSchemaOrThrow: vi.fn(() => undefined),
}));

import { RobustLlmClient } from "@server/llm/span-labeling/services/RobustLlmClient";
import { SubstringPositionCache } from "@server/llm/span-labeling/cache/SubstringPositionCache";
import type { LabelSpansResult } from "@server/llm/span-labeling/types";
import * as SpanValidator from "@server/llm/span-labeling/validation/SpanValidator";
import * as RepairModule from "@server/llm/span-labeling/services/robust-llm-client/repair";
import * as ModelInvocation from "@server/llm/span-labeling/services/robust-llm-client/modelInvocation";
import * as TwoPassModule from "@server/llm/span-labeling/services/robust-llm-client/twoPassExtraction";

class TestRobustClient extends RobustLlmClient {
  constructor(private name: string) {
    super();
  }

  protected override _getProviderName(): string {
    return this.name;
  }
}

const createParams = () => ({
  text: "A short scene",
  policy: {},
  options: { minConfidence: 0.6 },
  enableRepair: false,
  aiService: {} as never,
  cache: new SubstringPositionCache(),
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.SPAN_MODEL;
  delete process.env.SPAN_PROVIDER;
});

describe("RobustLlmClient (additional)", () => {
  describe("error handling", () => {
    it("throws when the response cannot be parsed as JSON", async () => {
      vi.spyOn(ModelInvocation, "callModel").mockResolvedValue({
        text: "not-json",
      });

      const client = new TestRobustClient("openai");

      await expect(client.getSpans(createParams())).rejects.toThrow(
        "Invalid JSON",
      );
    });

    it("falls back to lenient validation when repair is disabled", async () => {
      vi.spyOn(ModelInvocation, "callModel").mockResolvedValue({
        text: JSON.stringify({ spans: [], meta: { version: "v1", notes: "" } }),
      });

      const validateSpansSpy = vi.spyOn(SpanValidator, "validateSpans");
      validateSpansSpy
        .mockReturnValueOnce({
          ok: false,
          verdict: "retryable" as const,
          errors: ["bad"],
          result: { spans: [], meta: { version: "v1", notes: "" } },
        })
        .mockReturnValueOnce({
          ok: true,
          verdict: "pass" as const,
          errors: [],
          result: { spans: [], meta: { version: "v1", notes: "lenient" } },
        });

      const client = new TestRobustClient("openai");
      const result = await client.getSpans(createParams());

      expect(result.meta.notes).toBe("lenient");
    });
  });

  describe("edge cases", () => {
    it("applies gemini-specific minConfidence adjustments", async () => {
      vi.spyOn(ModelInvocation, "callModel").mockResolvedValue({
        text: JSON.stringify({ spans: [], meta: { version: "v1", notes: "" } }),
      });

      vi.spyOn(SpanValidator, "validateSpans").mockImplementation(
        ({ options }) => ({
          ok: true,
          verdict: "pass" as const,
          errors: [],
          result: {
            spans: [],
            meta: {
              version: "v1",
              notes: `minConfidence:${options.minConfidence}`,
            },
          },
        }),
      );

      const client = new TestRobustClient("gemini");
      const result = await client.getSpans(createParams());

      expect(result.meta.notes).toContain("minConfidence:0.2");
    });

    it("uses two-pass extraction for mini models", async () => {
      process.env.SPAN_MODEL = "gpt-4o-mini-2024-07-18";

      vi.spyOn(ModelInvocation, "callModel").mockResolvedValue({
        text: JSON.stringify({
          spans: [{ text: "single", role: "style" }],
          meta: { version: "v1", notes: "" },
        }),
      });
      vi.spyOn(TwoPassModule, "twoPassExtraction").mockResolvedValue({
        text: JSON.stringify({
          spans: [{ text: "two-pass", role: "style" }],
          meta: { version: "v1", notes: "" },
        }),
      });

      vi.spyOn(SpanValidator, "validateSpans").mockReturnValue({
        ok: true,
        verdict: "pass" as const,
        errors: [],
        result: {
          spans: [{ text: "two-pass", role: "style" }],
          meta: { version: "v1", notes: "" },
        },
      });

      const client = new TestRobustClient("openai");
      const result = await client.getSpans(createParams());

      expect(result.spans[0]?.text).toBe("two-pass");
    });
  });

  describe("core behavior", () => {
    it("returns repair results when repair succeeds", async () => {
      vi.spyOn(ModelInvocation, "callModel").mockResolvedValue({
        text: JSON.stringify({ spans: [], meta: { version: "v1", notes: "" } }),
      });

      vi.spyOn(SpanValidator, "validateSpans").mockReturnValue({
        ok: false,
        verdict: "retryable" as const,
        errors: ["bad"],
        result: { spans: [], meta: { version: "v1", notes: "" } },
      });

      vi.spyOn(RepairModule, "attemptRepair").mockResolvedValue({
        result: {
          spans: [],
          meta: { version: "v1", notes: "repaired" },
        } as LabelSpansResult,
      });

      const client = new TestRobustClient("openai");
      const result = await client.getSpans({
        ...createParams(),
        enableRepair: true,
      });

      expect(result.meta.notes).toBe("repaired");
    });

    it("skips the repair round-trip when all validation errors are terminal", async () => {
      const callModelSpy = vi
        .spyOn(ModelInvocation, "callModel")
        .mockResolvedValue({
          text: JSON.stringify({
            spans: [],
            meta: { version: "v1", notes: "" },
          }),
        });

      // Strict validation fails with terminal-only errors (e.g. word-limit
      // violations the repair prompt is forbidden from fixing); the lenient
      // pass drops the offending spans and succeeds.
      const validateSpansSpy = vi.spyOn(SpanValidator, "validateSpans");
      validateSpansSpy
        .mockReturnValueOnce({
          ok: false,
          verdict: "terminal" as const,
          errors: ["span[0] exceeds non-technical word limit (8 words)"],
          result: { spans: [], meta: { version: "v1", notes: "" } },
        })
        .mockReturnValueOnce({
          ok: true,
          verdict: "pass" as const,
          errors: [],
          result: { spans: [], meta: { version: "v1", notes: "lenient" } },
        });

      const repairSpy = vi.spyOn(RepairModule, "attemptRepair");

      const client = new TestRobustClient("openai");
      const result = await client.getSpans({
        ...createParams(),
        enableRepair: true,
      });

      expect(repairSpy).not.toHaveBeenCalled();
      expect(callModelSpy).toHaveBeenCalledTimes(1);
      expect(result.meta.notes).toBe("lenient");
      expect(validateSpansSpy).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ attempt: 2 }),
      );
    });
  });
});
