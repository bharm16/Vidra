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

import { GeminiAdapter } from "../GeminiAdapter";

describe("GeminiAdapter", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("throws when API key is missing", () => {
    expect(
      () => new GeminiAdapter({ apiKey: "", defaultModel: "gemini-2.5-flash" }),
    ).toThrow("API key required");
  });

  it("parses Gemini response text parts", async () => {
    const adapter = new GeminiAdapter({
      apiKey: "key",
      defaultModel: "gemini-2.5-flash",
    });
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            { content: { parts: [{ text: "Hello" }, { text: " world" }] } },
          ],
        }),
        { status: 200 },
      ),
    ) as typeof fetch;

    const response = await adapter.complete("System prompt", {});

    expect(response.text).toBe("Hello world");
  });

  it("throws APIError when Gemini HTTP response is not ok", async () => {
    const adapter = new GeminiAdapter({
      apiKey: "key",
      defaultModel: "gemini-2.5-flash",
    });
    global.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response("bad request", { status: 400 }),
      ) as typeof fetch;

    await expect(adapter.complete("System prompt", {})).rejects.toMatchObject({
      name: "APIError",
      statusCode: 400,
      isRetryable: false,
    });
  });

  it("handles malformed structured output by throwing parse error", async () => {
    const adapter = new GeminiAdapter({
      apiKey: "key",
      defaultModel: "gemini-2.5-flash",
    });
    vi.spyOn(adapter, "complete").mockResolvedValue({
      text: "{invalid",
      metadata: {},
    });

    await expect(
      adapter.generateStructuredOutput("Prompt", { type: "object" }),
    ).rejects.toThrow("Invalid JSON response from Gemini");
  });

  it("streams SSE chunks and raw JSON fallback chunks", async () => {
    const adapter = new GeminiAdapter({
      apiKey: "key",
      defaultModel: "gemini-2.5-flash",
    });
    const sse = [
      'data: {"candidates":[{"content":{"parts":[{"text":"Hi"}]}}]}',
      '{"candidates":[{"content":{"parts":[{"text":" there"}]}}]}',
      "data: [DONE]",
      "",
    ].join("\n");
    global.fetch = vi
      .fn()
      .mockResolvedValue(new Response(sse, { status: 200 })) as typeof fetch;

    const onChunk = vi.fn();
    const text = await adapter.streamComplete("System prompt", { onChunk });

    expect(text).toBe("Hi there");
    expect(onChunk).toHaveBeenCalledTimes(2);
  });
});
