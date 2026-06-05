/**
 * Regression: OpenAICompatibleAdapter should auto-retry once WITHOUT logprobs
 * when the server rejects the request because the model does not support
 * logprobs, naming "logprobs" in the error body. Without the retry, span
 * labeling against gpt-5-mini fails because that model rejects logprobs.
 *
 * Bug history: the rejection phrasing varies by model family —
 *   gpt-4o:    400 "logprobs are not supported for this model"
 *   gpt-5-mini: 403 "You are not allowed to request logprobs from this model"
 * The first contains "not supported"; the second "not allowed". The matcher
 * must accept both, and must NOT gate on status === 400 (gpt-5 returns 403).
 *
 * This quirk recovery previously lived one layer up in AIModelService (it
 * string-matched the wrapped error message). It was relocated here so provider
 * quirk recovery lives behind the adapter seam, alongside the sibling
 * max_tokens -> max_completion_tokens retry. The matcher is behavior-driven
 * (reads the API's own error body) — no model-name classification.
 *
 * Original discovery: 2026-05-24 via scripts/synthetic/variants.ts
 * (openai-5-mini span-labeling variant, 65/67 prompts errored before the fix).
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

describe("OpenAICompatibleAdapter logprobs-retry regression", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("retries without logprobs when gpt-5 rejects with 403 'not allowed' phrasing", async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];

    global.fetch = vi.fn(async (url: string, init: FetchInit) => {
      const body = parseBody(init);
      calls.push({ url, body });

      // First call carries logprobs → 403 rejection naming logprobs.
      if (body.logprobs !== undefined) {
        return {
          ok: false,
          status: 403,
          text: async () =>
            "You are not allowed to request logprobs from this model",
        } as unknown as Response;
      }

      // Retry without logprobs → success.
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
      logprobs: true,
      topLogprobs: 3,
    });

    expect(calls).toHaveLength(2);
    // First call carried the snake_case payload fields the API rejected.
    expect(calls[0]!.body.logprobs).toBe(true);
    expect(calls[0]!.body.top_logprobs).toBe(3);
    // Retry stripped BOTH snake_case fields from the payload.
    expect(calls[1]!.body.logprobs).toBeUndefined();
    expect(calls[1]!.body.top_logprobs).toBeUndefined();
    expect(result.text).toBe("ok");
  });

  it("still retries when gpt-4o uses 400 'not supported' phrasing", async () => {
    // Ensures the matcher covers the original phrasing AND a 400 status, not
    // just the gpt-5 403 case.
    const calls: Array<Record<string, unknown>> = [];

    global.fetch = vi.fn(async (_url: string, init: FetchInit) => {
      const body = parseBody(init);
      calls.push(body);

      if (body.logprobs !== undefined) {
        return {
          ok: false,
          status: 400,
          text: async () => "logprobs are not supported for this model",
        } as unknown as Response;
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            { message: { content: "ok-classic" }, finish_reason: "stop" },
          ],
          model: "gpt-4o",
        }),
      } as unknown as Response;
    }) as unknown as typeof fetch;

    const adapter = createAdapter();
    const result = await adapter.complete("test prompt", {
      maxTokens: 100,
      model: "gpt-4o",
      logprobs: true,
      topLogprobs: 3,
    });

    expect(calls).toHaveLength(2);
    expect(calls[1]!.logprobs).toBeUndefined();
    expect(calls[1]!.top_logprobs).toBeUndefined();
    expect(result.text).toBe("ok-classic");
  });

  it("does NOT retry when the error body does not mention logprobs", async () => {
    // Guard against an over-permissive matcher: a generic rejection — even with
    // logprobs requested — must surface as-is without a strip-and-retry.
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
        logprobs: true,
        topLogprobs: 3,
        maxRetries: 0,
      }),
    ).rejects.toThrow(/Generic bad request/);

    expect(callCount).toBe(1);
  });

  it("propagates the ORIGINAL logprobs error when the strip retry also fails", async () => {
    // If dropping logprobs still doesn't satisfy the server, the caller should
    // see the original rejection, not a misleading second-attempt error.
    global.fetch = vi.fn(async (_url: string, init: FetchInit) => {
      const body = parseBody(init);
      if (body.logprobs !== undefined) {
        return {
          ok: false,
          status: 403,
          text: async () =>
            "You are not allowed to request logprobs from this model",
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
        logprobs: true,
        topLogprobs: 3,
        maxRetries: 0,
      }),
    ).rejects.toThrow(/logprobs/);
  });
});
