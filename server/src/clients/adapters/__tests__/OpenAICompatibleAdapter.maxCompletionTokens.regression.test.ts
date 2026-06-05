/**
 * Regression: OpenAICompatibleAdapter should auto-retry once with
 * `max_completion_tokens` when the server rejects `max_tokens` and explicitly
 * names the replacement field in the error body. This is the OpenAI API
 * naming convention introduced with the o1/o3 reasoning models and inherited
 * by gpt-5; without the retry, gpt-5-mini fails 100% of requests.
 *
 * Discovered: 2026-05-24 while running the synthetic model-comparison eval
 * (variants.ts → openai-5-mini for span-labeling). 65/67 prompts errored
 * before the fix; the OpenAI 400 message was:
 *   "Unsupported parameter: 'max_tokens' is not supported with this model.
 *    Use 'max_completion_tokens' instead."
 *
 * The matcher is behavior-driven (looks at the error body) rather than
 * model-name-driven, so future models that adopt the same convention work
 * automatically without a code change.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    defaultModel: "gpt-5-mini",
  });

interface FetchInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

function parseBody(init: FetchInit): Record<string, unknown> {
  return JSON.parse(init.body ?? "{}") as Record<string, unknown>;
}

describe("OpenAICompatibleAdapter max_completion_tokens regression", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("retries with max_completion_tokens when 400 error names it as replacement", async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];

    global.fetch = vi.fn(async (url: string, init: FetchInit) => {
      const body = parseBody(init);
      calls.push({ url, body });

      // First call: max_tokens present → reject with replacement hint
      if (body.max_tokens !== undefined) {
        return {
          ok: false,
          status: 400,
          text: async () =>
            "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.",
        } as unknown as Response;
      }

      // Second call: max_completion_tokens present, max_tokens absent → success
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
          model: "gpt-5-mini",
        }),
      } as unknown as Response;
    }) as unknown as typeof fetch;

    const adapter = createAdapter();
    const result = await adapter.complete("test prompt", {
      maxTokens: 100,
      model: "gpt-5-mini",
    });

    expect(calls).toHaveLength(2);
    expect(calls[0]!.body.max_tokens).toBe(100);
    expect(calls[0]!.body.max_completion_tokens).toBeUndefined();
    expect(calls[1]!.body.max_completion_tokens).toBe(100);
    expect(calls[1]!.body.max_tokens).toBeUndefined();
    expect(result.text).toBe("ok");
  });

  it("does NOT retry when error body does not mention max_completion_tokens", async () => {
    // Guard against the matcher being too permissive: a generic 400 should
    // surface as-is without a parameter-rename retry attempt.
    let callCount = 0;
    global.fetch = vi.fn(async () => {
      callCount++;
      return {
        ok: false,
        status: 400,
        text: async () => "Generic bad request",
      } as unknown as Response;
    }) as unknown as typeof fetch;

    const adapter = createAdapter();
    await expect(
      adapter.complete("test prompt", {
        maxTokens: 100,
        model: "gpt-5-mini",
        maxRetries: 0,
      }),
    ).rejects.toThrow(/Generic bad request/);

    expect(callCount).toBe(1);
  });

  it("propagates the original error when the rename retry also fails", async () => {
    // If renaming the field still doesn't satisfy the server, the user should
    // see the original error rather than a misleading second-attempt one.
    global.fetch = vi.fn(async (_url: string, init: FetchInit) => {
      const body = parseBody(init);
      if (body.max_tokens !== undefined) {
        return {
          ok: false,
          status: 400,
          text: async () =>
            "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.",
        } as unknown as Response;
      }
      return {
        ok: false,
        status: 500,
        text: async () => "internal error on retry",
      } as unknown as Response;
    }) as unknown as typeof fetch;

    const adapter = createAdapter();
    await expect(
      adapter.complete("test prompt", {
        maxTokens: 100,
        model: "gpt-5-mini",
        maxRetries: 0,
      }),
    ).rejects.toThrow(/max_completion_tokens/);
  });
});
