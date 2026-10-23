import { beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock("@anthropic-ai/sdk", () => {
  class FakeAPIError extends Error {
    constructor(
      readonly status: number,
      message: string,
    ) {
      super(message);
    }
  }
  class FakeAnthropic {
    static APIError = FakeAPIError;
    static APIUserAbortError = class extends Error {};
    static APIConnectionTimeoutError = class extends Error {};
    messages = { create: sdk.create };
  }
  return { default: FakeAnthropic };
});

import Anthropic from "@anthropic-ai/sdk";
import { AnthropicAdapter } from "../AnthropicAdapter";

const adapter = (): AnthropicAdapter =>
  new AnthropicAdapter({ apiKey: "test-key", defaultModel: "claude-haiku-5-5" });

function message(content: unknown[], stop_reason = "end_turn"): unknown {
  return { id: "msg_1", model: "claude-haiku-5-5", content, stop_reason, usage: { input_tokens: 1, output_tokens: 1 } };
}

describe("AnthropicAdapter", () => {
  beforeEach(() => sdk.create.mockReset());

  it("returns only the answer text, skipping thinking, and never sends temperature", async () => {
    sdk.create.mockResolvedValue(message([{ type: "thinking", thinking: "" }, { type: "text", text: "Better words." }]));

    const result = await adapter().complete("Rewrite.", { userMessage: "words", temperature: 0.7, maxTokens: 500, effort: "high" });

    expect(result.text).toBe("Better words.");
    expect(result.metadata.provider).toBe("anthropic");
    const [body] = sdk.create.mock.calls[0] as [Record<string, unknown>];
    expect(body).toMatchObject({
      model: "claude-haiku-5-5",
      max_tokens: 500,
      system: "Rewrite.",
      messages: [{ role: "user", content: "words" }],
      output_config: { effort: "high" },
    });
    expect(body).not.toHaveProperty("temperature");
  });

  it("uses the model the operation asks for, and the model's own effort when it names none", async () => {
    sdk.create.mockResolvedValue(message([{ type: "text", text: "ok" }]));
    await adapter().complete("Rewrite.", { userMessage: "words", model: "claude-sonnet-5-5" });
    expect(sdk.create.mock.calls[0]?.[0]).toMatchObject({ model: "claude-sonnet-5-5" });
    expect(sdk.create.mock.calls[0]?.[0]).not.toHaveProperty("output_config");
  });

  it("fails a refusal so the router can fall back", async () => {
    sdk.create.mockResolvedValue(message([], "refusal"));
    await expect(adapter().complete("Rewrite.", { userMessage: "words" })).rejects.toMatchObject({ name: "APIError", isRetryable: false });
  });

  it("maps rate limits to a retryable error and bad requests to a final one", async () => {
    sdk.create.mockRejectedValueOnce(new (Anthropic.APIError as unknown as new (status: number, message: string) => Error)(429, "slow down"));
    await expect(adapter().complete("Rewrite.", { userMessage: "words" })).rejects.toMatchObject({ statusCode: 429, isRetryable: true });
    sdk.create.mockRejectedValueOnce(new (Anthropic.APIError as unknown as new (status: number, message: string) => Error)(400, "bad"));
    await expect(adapter().complete("Rewrite.", { userMessage: "words" })).rejects.toMatchObject({ statusCode: 400, isRetryable: false });
  });

  it("refuses JSON operations instead of answering them as prose", async () => {
    await expect(adapter().complete("Classify.", { userMessage: "words", jsonMode: true })).rejects.toMatchObject({ name: "APIError", isRetryable: false });
    expect(sdk.create).not.toHaveBeenCalled();
  });
});
