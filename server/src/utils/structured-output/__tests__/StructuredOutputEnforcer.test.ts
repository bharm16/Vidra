import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  parseStructuredOutputMock,
  validateStructuredOutputMock,
  unwrapSuggestionsArrayMock,
  unwrapSuggestionsArrayWithSiblingsMock,
  enhancePromptForJSONMock,
  enhancePromptWithErrorFeedbackMock,
} = vi.hoisted(() => ({
  parseStructuredOutputMock: vi.fn(),
  validateStructuredOutputMock: vi.fn(),
  unwrapSuggestionsArrayMock: vi.fn((value: unknown) => ({
    unwrapped: false,
    value,
  })),
  unwrapSuggestionsArrayWithSiblingsMock: vi.fn((value: unknown) => ({
    unwrapped: false,
    value,
    siblings: {},
  })),
  enhancePromptForJSONMock: vi.fn((prompt: string) => `${prompt}\nJSON`),
  enhancePromptWithErrorFeedbackMock: vi.fn(
    (prompt: string, error: string) =>
      `${prompt}\nPrevious attempt failed: ${error}`,
  ),
}));

vi.mock("@infrastructure/Logger", () => ({
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../../provider/ProviderDetector", () => ({
  detectAndGetCapabilities: vi.fn(() => ({
    provider: "openai",
    capabilities: {
      strictJsonSchema: true,
      needsPromptFormatInstructions: false,
      developerRole: true,
      bookending: true,
    },
  })),
}));

vi.mock("../parse", () => ({
  parseStructuredOutput: parseStructuredOutputMock,
}));

vi.mock("../validate", () => ({
  validateStructuredOutput: validateStructuredOutputMock,
}));

vi.mock("../unwrapper", () => ({
  unwrapSuggestionsArray: unwrapSuggestionsArrayMock,
  unwrapSuggestionsArrayWithSiblings: unwrapSuggestionsArrayWithSiblingsMock,
}));

vi.mock("../promptEnhancers", () => ({
  enhancePromptForJSON: enhancePromptForJSONMock,
  enhancePromptWithErrorFeedback: enhancePromptWithErrorFeedbackMock,
}));

import { StructuredOutputEnforcer } from "../StructuredOutputEnforcer";

describe("StructuredOutputEnforcer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when operation is missing", async () => {
    await expect(
      StructuredOutputEnforcer.enforceJSON({ execute: vi.fn() }, "prompt", {
        schema: { type: "object" },
      } as never),
    ).rejects.toThrow('requires an "operation" option');
  });

  it("extracts and unwraps suggestions array payloads", async () => {
    parseStructuredOutputMock.mockReturnValueOnce({
      suggestions: [{ text: "option-1" }],
    });
    unwrapSuggestionsArrayMock.mockReturnValueOnce({
      unwrapped: true,
      value: [{ text: "option-1" }],
    });

    const execute = vi.fn().mockResolvedValue({
      text: '{"suggestions":[{"text":"option-1"}]}',
      metadata: {},
    });

    const result = await StructuredOutputEnforcer.enforceJSON<
      Array<{ text: string }>
    >({ execute }, "generate suggestions", {
      operation: "enhance_suggestions",
      isArray: true,
      schema: {
        type: "object",
        required: ["suggestions"],
        properties: {
          suggestions: { type: "array" },
        },
      },
    });

    expect(result).toEqual([{ text: "option-1" }]);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(validateStructuredOutputMock).toHaveBeenCalledTimes(1);
  });

  it("retries once on malformed JSON and applies retry feedback prompt", async () => {
    parseStructuredOutputMock
      .mockImplementationOnce(() => {
        throw new Error("Invalid JSON structure");
      })
      .mockReturnValueOnce({ ok: true });

    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        text: "not-json",
        metadata: {},
      })
      .mockResolvedValueOnce({
        text: '{"ok":true}',
        metadata: {},
      });

    const result = await StructuredOutputEnforcer.enforceJSON<{ ok: boolean }>(
      { execute },
      "parse this",
      {
        operation: "optimize_standard",
        maxRetries: 1,
        schema: {
          type: "object",
          required: ["ok"],
          properties: { ok: { type: "boolean" } },
        },
      },
    );

    expect(result).toEqual({ ok: true });
    expect(execute).toHaveBeenCalledTimes(2);
    expect(enhancePromptWithErrorFeedbackMock).toHaveBeenCalledTimes(1);

    const retryCallOptions = execute.mock.calls[1]?.[1] as {
      systemPrompt?: string;
    };
    expect(retryCallOptions.systemPrompt).toContain("Previous attempt failed");
  });

  it("returns { value, siblings } when captureSiblings is true and response has siblings", async () => {
    parseStructuredOutputMock.mockReturnValueOnce({
      scene_summary: "aerial drone — must be airborne",
      suggestions: [{ text: "drone glide", explanation: "stays aloft" }],
    });
    unwrapSuggestionsArrayWithSiblingsMock.mockReturnValueOnce({
      unwrapped: true,
      value: [{ text: "drone glide", explanation: "stays aloft" }],
      siblings: { scene_summary: "aerial drone — must be airborne" },
    });

    const execute = vi.fn().mockResolvedValue({
      text: JSON.stringify({
        scene_summary: "aerial drone — must be airborne",
        suggestions: [{ text: "drone glide", explanation: "stays aloft" }],
      }),
      metadata: {},
    });

    const result = await StructuredOutputEnforcer.enforceJSON<
      Array<{ text: string; explanation: string }>
    >({ execute }, "prompt", {
      operation: "enhance_suggestions",
      isArray: true,
      maxRetries: 0,
      captureSiblings: true,
    });

    expect(result).toMatchObject({
      value: [{ text: "drone glide", explanation: "stays aloft" }],
      siblings: { scene_summary: "aerial drone — must be airborne" },
    });
  });

  it("returns { value, siblings: {} } when captureSiblings is true but response has no siblings", async () => {
    parseStructuredOutputMock.mockReturnValueOnce({
      suggestions: [{ text: "x" }],
    });
    unwrapSuggestionsArrayWithSiblingsMock.mockReturnValueOnce({
      unwrapped: true,
      value: [{ text: "x" }],
      siblings: {},
    });

    const execute = vi.fn().mockResolvedValue({
      text: '{"suggestions":[{"text":"x"}]}',
      metadata: {},
    });

    const result = await StructuredOutputEnforcer.enforceJSON<
      Array<{ text: string }>
    >({ execute }, "prompt", {
      operation: "enhance_suggestions",
      isArray: true,
      maxRetries: 0,
      captureSiblings: true,
    });

    expect(result).toMatchObject({
      value: [{ text: "x" }],
      siblings: {},
    });
  });
});
