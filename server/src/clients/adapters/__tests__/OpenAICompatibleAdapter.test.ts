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

import { OpenAICompatibleAdapter } from "../OpenAICompatibleAdapter";

const createAdapter = () =>
  new OpenAICompatibleAdapter({
    apiKey: "key",
    baseURL: "https://api.openai.com/v1",
    defaultModel: "gpt-4o",
  });

describe("OpenAICompatibleAdapter", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("throws when API key is missing", () => {
    expect(
      () =>
        new OpenAICompatibleAdapter({
          apiKey: "",
          baseURL: "https://api.openai.com/v1",
          defaultModel: "gpt-4o",
        }),
    ).toThrow("API key required");
  });

  it("throws APIError when HTTP response is not ok", async () => {
    const adapter = createAdapter();
    global.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response("bad request", { status: 400 }),
      ) as typeof fetch;

    await expect(
      adapter.complete("System", { userMessage: "hello" }),
    ).rejects.toMatchObject({
      name: "APIError",
      statusCode: 400,
      isRetryable: false,
    });
  });

  it("retries once when JSON validation fails and then succeeds", async () => {
    const adapter = createAdapter();
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "not-json" } }],
          }),
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
      ) as typeof fetch;

    const response = await adapter.complete("System", {
      jsonMode: true,
      maxRetries: 1,
      retryOnValidationFailure: true,
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(response.text).toBe('{"ok":true}');
    expect(response.metadata.validation?.isValid).toBe(true);
  });

  it("maps AbortError to ClientAbortError for non-timeout aborts", async () => {
    const adapter = createAdapter();
    const abortErr = Object.assign(new Error("aborted"), {
      name: "AbortError",
    });
    global.fetch = vi.fn().mockRejectedValue(abortErr) as typeof fetch;

    await expect(adapter.complete("System", {})).rejects.toMatchObject({
      name: "ClientAbortError",
    });
  });
});
