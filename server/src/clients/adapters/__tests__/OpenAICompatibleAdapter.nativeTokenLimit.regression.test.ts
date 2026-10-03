import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenAICompatibleAdapter } from "../OpenAICompatibleAdapter";

afterEach(() => vi.unstubAllGlobals());

describe("configured studio model native token limit", () => {
  it("submits gpt-5.6-luna once with max_completion_tokens on the initial request", async () => {
    const received: Record<string, unknown>[] = [];
    const fetchFn: typeof fetch = async (input, init): Promise<Response> => {
      const request = new Request(input, init);
      const body = (await request.json()) as Record<string, unknown>;
      received.push(body);
      if (body.max_tokens !== undefined)
        return Response.json(
          {
            error: {
              message: "Use max_completion_tokens instead of max_tokens",
            },
          },
          { status: 400 },
        );
      return Response.json({
        model: "gpt-5.6-luna",
        choices: [
          { message: { content: '{"ok":true}' }, finish_reason: "stop" },
        ],
      });
    };
    vi.stubGlobal("fetch", fetchFn);
    const adapter = new OpenAICompatibleAdapter({
      apiKey: "fixture-key",
      baseURL: "https://api.openai.com/v1",
      defaultModel: "gpt-5.6-luna",
    });
    const result = await adapter.complete("Return JSON", {
      userMessage: "Connectivity check",
      maxTokens: 1024,
      temperature: 1,
      maxRetries: 0,
      jsonMode: true,
      logprobs: false,
    });
    expect(result.text).toBe('{"ok":true}');
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      model: "gpt-5.6-luna",
      max_completion_tokens: 1024,
    });
    expect(received[0]).not.toHaveProperty("max_tokens");
  });

  it("preserves the legacy gpt-4o token field when overriding a Luna-default adapter", async () => {
    const received: Record<string, unknown>[] = [];
    vi.stubGlobal(
      "fetch",
      async (
        input: string | URL | Request,
        init?: RequestInit,
      ): Promise<Response> => {
        received.push(
          (await new Request(input, init).json()) as Record<string, unknown>,
        );
        return Response.json({
          model: "gpt-4o",
          choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
        });
      },
    );
    const adapter = new OpenAICompatibleAdapter({
      apiKey: "fixture-key",
      baseURL: "https://api.openai.com/v1",
      defaultModel: "gpt-5.6-luna",
    });
    await adapter.complete("Connectivity check", {
      model: "gpt-4o",
      maxTokens: 64,
      maxRetries: 0,
    });
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ model: "gpt-4o", max_tokens: 64 });
    expect(received[0]).not.toHaveProperty("max_completion_tokens");
  });
});
