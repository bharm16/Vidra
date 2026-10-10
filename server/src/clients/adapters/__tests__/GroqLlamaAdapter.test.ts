import { afterEach, describe, expect, it, vi } from "vitest";

const { loggerMock } = vi.hoisted(() => ({
  loggerMock: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("@infrastructure/Logger", () => ({
  logger: {
    child: () => loggerMock,
  },
}));

vi.mock("@clients/utils/abortController", () => ({
  createAbortController: (timeout: number, signal?: AbortSignal) => {
    const controller = new AbortController();
    if (signal) {
      signal.addEventListener("abort", () => controller.abort());
    }
    return {
      controller,
      timeoutId: setTimeout(() => undefined, timeout),
      abortedByTimeout: { value: false },
    };
  },
}));

vi.mock("@utils/sleep", () => ({
  sleep: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@utils/hash", () => ({
  hashString: vi.fn(() => 123456),
}));

import { GroqLlamaAdapter } from "../GroqLlamaAdapter";

describe("GroqLlamaAdapter", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("throws when API key is missing", () => {
    expect(() => new GroqLlamaAdapter({ apiKey: "" })).toThrow(
      "Groq API key required",
    );
  });

  it("injects JSON instruction for json_object mode", async () => {
    const adapter = new GroqLlamaAdapter({
      apiKey: "key",
      defaultModel: "openai/gpt-oss-20b",
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"ok":true}' } }],
        }),
        { status: 200 },
      ),
    );
    global.fetch = fetchMock as typeof fetch;

    await adapter.complete("System prompt", {
      jsonMode: true,
      responseFormat: { type: "json_object" },
      enableSandwich: false,
      enablePrefill: false,
    });

    const payload = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    const systemMessage = payload.messages[0]?.content as string;
    expect(systemMessage.startsWith("Respond with valid JSON.")).toBe(true);
    expect(payload.response_format).toEqual({ type: "json_object" });
  });

  it("enables logprobs only for supported models", async () => {
    const adapter = new GroqLlamaAdapter({
      apiKey: "key",
      defaultModel: "openai/gpt-oss-20b",
    });
    const fetchMock = vi
      .fn()
      .mockImplementation(
        async () =>
          new Response(
            JSON.stringify({ choices: [{ message: { content: "ok" } }] }),
            { status: 200 },
          ),
      );
    global.fetch = fetchMock as typeof fetch;

    await adapter.complete("System prompt", { logprobs: true });
    const firstPayload = JSON.parse(
      fetchMock.mock.calls[0]?.[1]?.body as string,
    );
    expect(firstPayload.logprobs).toBeUndefined();
    expect(firstPayload.top_logprobs).toBeUndefined();

    await adapter.complete("System prompt", {
      logprobs: true,
      topLogprobs: 2,
      model: "llama-3.3-70b-versatile",
    });
    const secondPayload = JSON.parse(
      fetchMock.mock.calls[1]?.[1]?.body as string,
    );
    expect(secondPayload.logprobs).toBe(true);
    expect(secondPayload.top_logprobs).toBe(2);
  });

  it("retries on validation failure and returns valid JSON response", async () => {
    const adapter = new GroqLlamaAdapter({
      apiKey: "key",
      defaultModel: "openai/gpt-oss-20b",
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ choices: [{ message: { content: "not-json" } }] }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ choices: [{ message: { content: '"ok":true}' } }] }),
          { status: 200 },
        ),
      );
    global.fetch = fetchMock as typeof fetch;

    const response = await adapter.complete("System prompt", {
      jsonMode: true,
      maxRetries: 1,
      retryOnValidationFailure: true,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(response.text).toBe('{"ok":true}');
    expect(response.metadata.validation?.isValid).toBe(true);
  });
});
