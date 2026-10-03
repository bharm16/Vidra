import { afterEach, describe, expect, it, vi } from "vitest";
import { ModelConfig } from "../../../server/src/config/modelConfig";
import { createGoldenSetAIService } from "../golden-set-ai-service";

const originalConfig = ModelConfig.span_labeling;

afterEach(() => {
  ModelConfig.span_labeling = originalConfig;
  vi.unstubAllGlobals();
});

describe("golden-set provider selection", () => {
  it("sends the selected Groq model to Groq despite an OpenAI operation snapshot", async () => {
    ModelConfig.span_labeling = {
      ...originalConfig,
      client: "openai",
      model: "gpt-4o-mini",
    };
    const received: { url: string; body: Record<string, unknown> }[] = [];
    vi.stubGlobal(
      "fetch",
      async (url: string, init: RequestInit): Promise<Response> => {
        received.push({
          url,
          body: JSON.parse(String(init.body)) as Record<string, unknown>,
        });
        return new Response(
          JSON.stringify({
            model: "openai/gpt-oss-20b",
            choices: [
              { message: { content: '{"spans":[]}' }, finish_reason: "stop" },
            ],
            usage: { prompt_tokens: 10, completion_tokens: 5 },
          }),
          { status: 200 },
        );
      },
    );
    const { service, provider, model } = createGoldenSetAIService("groq", {
      GROQ_API_KEY: "test-key",
      OPENAI_API_KEY: "another-test-key",
      GROQ_MODEL: "openai/gpt-oss-20b",
    });
    const result = await service.execute("span_labeling", {
      systemPrompt: "Return JSON spans",
      jsonMode: true,
    });
    expect(provider).toBe("groq");
    expect(model).toBe("openai/gpt-oss-20b");
    expect(received).toHaveLength(1);
    expect(received[0]?.url).toBe(
      "https://api.groq.com/openai/v1/chat/completions",
    );
    expect(received[0]?.body.model).toBe("openai/gpt-oss-20b");
    expect(result.executedBy).toMatchObject({
      provider: "groq",
      model: "openai/gpt-oss-20b",
    });
  });

  it("refuses an explicitly selected provider without its credential", () => {
    expect(() =>
      createGoldenSetAIService("groq", { OPENAI_API_KEY: "test-key" }),
    ).toThrow("Missing GROQ_API_KEY");
    expect(() =>
      createGoldenSetAIService("openai", { GROQ_API_KEY: "test-key" }),
    ).toThrow("Missing OPENAI_API_KEY");
  });

  it("does not measure another provider when the selected model is unavailable", async () => {
    const transport = vi.fn(
      async (): Promise<Response> =>
        new Response(
          JSON.stringify({
            error: { code: "model_not_found", message: "Unavailable model" },
          }),
          { status: 404 },
        ),
    );
    vi.stubGlobal("fetch", transport);
    const { service } = createGoldenSetAIService("groq", {
      GROQ_API_KEY: "test-key",
      OPENAI_API_KEY: "other-key",
      GROQ_MODEL: "unavailable-model",
    });
    await expect(
      service.execute("span_labeling", { systemPrompt: "Return JSON spans" }),
    ).rejects.toThrow("404");
    expect(transport).toHaveBeenCalledTimes(1);
  });
});
