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

import { GroqQwenAdapter } from "../GroqQwenAdapter";

describe("GroqQwenAdapter", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("throws when API key is missing", () => {
    expect(() => new GroqQwenAdapter({ apiKey: "" })).toThrow(
      "Groq API key required",
    );
  });

  it("downgrades json_schema requests to json_object and injects json instruction", async () => {
    const adapter = new GroqQwenAdapter({ apiKey: "key" });
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
      schema: { type: "object" },
      jsonMode: true,
    });

    const payload = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    expect(payload.response_format).toEqual({ type: "json_object" });
    expect(payload.reasoning_effort).toBe("none");
    expect(
      (payload.messages[0]?.content as string).startsWith(
        "Respond with valid JSON.",
      ),
    ).toBe(true);
  });

  it("preserves explicit reasoningEffort override", async () => {
    const adapter = new GroqQwenAdapter({ apiKey: "key" });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "ok" } }],
        }),
        { status: 200 },
      ),
    );
    global.fetch = fetchMock as typeof fetch;

    await adapter.complete("System prompt", {
      reasoningEffort: "default",
    });

    const payload = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    expect(payload.reasoning_effort).toBe("default");
  });

  it("retries once when validation fails in json mode", async () => {
    const adapter = new GroqQwenAdapter({ apiKey: "key" });
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
          JSON.stringify({
            choices: [{ message: { content: '{"ok":true}' } }],
          }),
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
