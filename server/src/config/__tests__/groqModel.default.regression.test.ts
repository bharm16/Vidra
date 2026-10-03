import { afterEach, describe, expect, it, vi } from "vitest";
import { AIModelService } from "@services/ai-model/AIModelService";
import { GroqLlamaAdapter } from "@clients/adapters/GroqLlamaAdapter";
import { LLMClient } from "@clients/LLMClient";
import { DEFAULT_GROQ_MODEL } from "../llmModelDefaults";
import { calculateLLMCost } from "../llmCosts";

afterEach(() => {
  vi.unstubAllGlobals();
});

function service(): AIModelService {
  return new AIModelService({
    clients: {
      openai: null,
      groq: new LLMClient({
        providerName: "groq",
        adapter: new GroqLlamaAdapter({ apiKey: "fixture-key" }),
      }),
    },
  });
}

describe("verified Groq general default", () => {
  it("routes an unavailable primary to the real Groq default with bounded tokens and low reasoning", async () => {
    const received: { endpoint: string; body: Record<string, unknown> }[] = [];
    vi.stubGlobal(
      "fetch",
      async (
        input: string | URL | Request,
        init?: RequestInit,
      ): Promise<Response> => {
        const request = new Request(input, init);
        const body = (await request.json()) as Record<string, unknown>;
        received.push({ endpoint: request.url, body });
        return Response.json({
          model: DEFAULT_GROQ_MODEL,
          choices: [
            { message: { content: '{"ok":true}' }, finish_reason: "stop" },
          ],
        });
      },
    );
    const aiService = service();
    const result = await aiService.execute("span_labeling", {
      systemPrompt: "Respond in JSON",
      userMessage: "Connectivity fixture",
      maxTokens: 1024,
      maxRetries: 0,
      retryOnValidationFailure: false,
      enablePrefill: false,
      logprobs: true,
    });
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      endpoint: "https://api.groq.com/openai/v1/chat/completions",
      body: {
        model: "openai/gpt-oss-20b",
        max_tokens: 1024,
        reasoning_effort: "low",
      },
    });
    expect(received[0]?.body).not.toHaveProperty("logprobs");
    expect(result.executedBy).toMatchObject({
      client: "groq",
      provider: "groq",
      model: DEFAULT_GROQ_MODEL,
    });
    expect(result.text).toBe('{"ok":true}');
  });

  it("surfaces model_not_found without retry or disabling the real router for later requests", async () => {
    let requests = 0;
    vi.stubGlobal("fetch", async (): Promise<Response> => {
      requests += 1;
      return requests === 1
        ? Response.json(
            {
              error: {
                code: "model_not_found",
                message: "Selected model is unavailable for this account",
              },
            },
            { status: 404 },
          )
        : Response.json({
            model: DEFAULT_GROQ_MODEL,
            choices: [
              { message: { content: '{"ok":true}' }, finish_reason: "stop" },
            ],
          });
    });
    const aiService = service();
    const input = {
      systemPrompt: "Respond in JSON",
      userMessage: "Connectivity fixture",
      maxTokens: 1024,
      maxRetries: 0,
      retryOnValidationFailure: false,
      enablePrefill: false,
    };
    await expect(
      aiService.execute("span_labeling", input),
    ).rejects.toMatchObject({ statusCode: 404, isRetryable: false });
    expect(requests).toBe(1);
    expect(await aiService.execute("span_labeling", input)).toMatchObject({
      text: '{"ok":true}',
    });
    expect(requests).toBe(2);
  });

  it("uses the documented default rate instead of the unknown-model fallback", () => {
    expect(calculateLLMCost(DEFAULT_GROQ_MODEL, 1_000_000, 0)).toBeCloseTo(
      0.075,
    );
    expect(calculateLLMCost(DEFAULT_GROQ_MODEL, 0, 1_000_000)).toBeCloseTo(0.3);
  });
});
