import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { OpenAICompatibleAdapter } from "@clients/adapters/OpenAICompatibleAdapter";
import { GeminiAdapter } from "@clients/adapters/GeminiAdapter";
import { StructuredOutputEnforcer, createStructuredOutputCodec } from "@utils/StructuredOutputEnforcer";

const value = { name: "result", strict: "field value" };
afterEach(() => vi.unstubAllGlobals());
it.each(["openai", "gemini"] as const)("dispatches codec schemas through the %s adapter without dropping named properties", async provider => {
  const fetcher = vi.fn(async (_input: Parameters<typeof fetch>[0], _init?: Parameters<typeof fetch>[1]) => new Response(JSON.stringify(provider === "openai" ? { choices: [{ message: { content: JSON.stringify(value) } }] } : { candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }] }), { status: 200, headers: { "Content-Type": "application/json" } }));
  vi.stubGlobal("fetch", fetcher);
  const adapter = provider === "openai" ? new OpenAICompatibleAdapter({ apiKey: "test-only", baseURL: "https://test.invalid", defaultModel: "test-model" }) : new GeminiAdapter({ apiKey: "test-only", baseURL: "https://test.invalid", defaultModel: "test-model" });
  const codec = createStructuredOutputCodec(z.strictObject({ name: z.string(), strict: z.string() }));
  const result = await StructuredOutputEnforcer.enforceJSON({ execute: async (_operation, options) => adapter.complete(options.systemPrompt, options) }, "Return fields", { operation: "enhance_suggestions", codec, provider, maxRetries: 0 });
  expect(result).toEqual(value);
  const payload = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
  const wireSchema = provider === "openai" ? payload.response_format.json_schema.schema : payload.generationConfig.responseSchema;
  expect(wireSchema.properties).toEqual({ name: { type: "string" }, strict: { type: "string" } });
  expect(wireSchema.name).toBeUndefined(); expect(wireSchema.strict).toBeUndefined();
});
it("uses non-strict provider schema mode for a partial object but still decodes its fields", async () => {
  const fetcher = vi.fn(async (_input: Parameters<typeof fetch>[0], _init?: Parameters<typeof fetch>[1]) => new Response(JSON.stringify({ choices: [{ message: { content: '{"name":"result"}' } }] }), { status: 200 }));
  vi.stubGlobal("fetch", fetcher);
  const adapter = new OpenAICompatibleAdapter({ apiKey: "test-only", baseURL: "https://test.invalid", defaultModel: "test-model" });
  const codec = createStructuredOutputCodec(z.object({ name: z.string(), optional: z.string().optional() }));
  await expect(StructuredOutputEnforcer.enforceJSON({ execute: async (_operation, options) => adapter.complete(options.systemPrompt, options) }, "Return fields", { operation: "enhance_suggestions", codec, provider: "openai", maxRetries: 0 })).resolves.toEqual({ name: "result" });
  expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)).response_format.json_schema.strict).toBe(false);
});
