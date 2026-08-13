/**
 * The buffered and streaming paths used to build their payloads independently
 * — ~150 lines each, with comments reading "same logic as _executeRequest" to
 * mark the parts that had to be kept in step by hand. They now share one
 * builder, and these tests pin that they agree.
 */
import { describe, expect, it } from "vitest";
import {
  buildGroqPayload,
  takeUndeclaredGroqModels,
} from "../requestBuilder";
import { supportsLogprobs } from "../modelCapabilities";

const DEFAULT_MODEL = "llama-3.1-8b-instant";

const build = (
  options: Parameters<typeof buildGroqPayload>[0]["options"],
  stream = false,
): Record<string, unknown> =>
  buildGroqPayload({
    systemPrompt: "System prompt",
    messages: [{ role: "system", content: "System prompt" }],
    options,
    defaultModel: DEFAULT_MODEL,
    stream,
  }).payload;

describe("buildGroqPayload", () => {
  it("builds the same payload for both paths apart from the stream flag", () => {
    const options = { jsonMode: true, temperature: 0.4, seed: 7 };
    const { stream: _omitted, ...streamed } = build(options, true);
    expect(streamed).toEqual(build(options, false));
    expect(build(options, true).stream).toBe(true);
    expect(build(options, false).stream).toBeUndefined();
  });

  it("applies the structured-output settings on both paths", () => {
    for (const stream of [false, true]) {
      const payload = build({ jsonMode: true }, stream);
      expect(payload.temperature).toBe(0.1);
      expect(payload.top_p).toBe(0.95);
      expect(payload.frequency_penalty).toBe(0);
      expect(payload.presence_penalty).toBe(0);
      // Groq allows at most 4 stop sequences.
      expect(payload.stop).toEqual(["```", "\n\n\n", "Note:", "I hope"]);
    }
  });

  it("uses conversational defaults when no structure is requested", () => {
    const payload = build({});
    expect(payload.temperature).toBe(0.7);
    expect(payload.top_p).toBe(0.9);
    expect(payload.stop).toBeUndefined();
    expect(payload.seed).toBeUndefined();
  });

  it("seeds structured output deterministically from the system prompt", () => {
    expect(build({ jsonMode: true }).seed).toBe(build({ jsonMode: true }).seed);
    expect(build({ jsonMode: true, seed: 42 }).seed).toBe(42);
  });

  it("reports when json_object mode needs the JSON instruction injected", () => {
    // Groq rejects json_object mode unless 'json' appears in the messages.
    const messages = [{ role: "system", content: "Describe the shot" }];
    const withoutJson = buildGroqPayload({
      systemPrompt: "Describe the shot",
      messages,
      options: { jsonMode: true },
      defaultModel: DEFAULT_MODEL,
      stream: false,
    });
    expect(withoutJson.injectedJsonInstruction).toBe(true);
    // The builder mutates the messages it was handed — the caller keeps the
    // reference and sends them.
    expect(messages[0]?.content).toContain("Respond with valid JSON");

    const withJson = buildGroqPayload({
      systemPrompt: "Reply in json",
      messages: [{ role: "system", content: "Reply in json" }],
      options: { jsonMode: true },
      defaultModel: DEFAULT_MODEL,
      stream: false,
    });
    expect(withJson.injectedJsonInstruction).toBe(false);
  });

  it("uses json_schema mode when a schema is supplied", () => {
    const payload = build({
      schema: { name: "spans", schema: { type: "object" } },
    });
    expect(payload.response_format).toEqual({
      type: "json_schema",
      json_schema: { name: "spans", schema: { type: "object" } },
    });
  });

  it("asks for logprobs only on a model declared to support them", () => {
    expect(build({ logprobs: true }).logprobs).toBeUndefined();
    expect(
      build({
        logprobs: true,
        topLogprobs: 2,
        model: "llama-3.3-70b-versatile",
      }).logprobs,
    ).toBe(true);
    expect(
      build({
        logprobs: true,
        topLogprobs: 2,
        model: "llama-3.3-70b-versatile",
      }).top_logprobs,
    ).toBe(2);
  });

  it("never asks for logprobs on the streaming path", () => {
    const payload = build(
      { logprobs: true, model: "llama-3.3-70b-versatile" },
      true,
    );
    expect(payload.logprobs).toBeUndefined();
  });
});

describe("undeclared models are reported, not silently downgraded", () => {
  it("names a model it has no capability entry for", () => {
    takeUndeclaredGroqModels();
    build({ logprobs: true, model: "llama-9-brand-new" });
    expect(takeUndeclaredGroqModels()).toEqual(["llama-9-brand-new"]);
  });

  it("says nothing about a declared model that simply lacks the capability", () => {
    takeUndeclaredGroqModels();
    build({ logprobs: true, model: "llama-3.1-8b-instant" });
    expect(takeUndeclaredGroqModels()).toEqual([]);
  });
});

describe("supportsLogprobs", () => {
  it("answers from a declared table, not from the shape of the name", () => {
    expect(supportsLogprobs("llama-3.3-70b-versatile")).toBe(true);
    expect(supportsLogprobs("llama-3.1-8b-instant")).toBe(false);
  });

  it("declines for a model it has never heard of", () => {
    // Requesting an unsupported parameter is a 400 from Groq, so an unknown
    // model gets the conservative answer until it is declared.
    expect(supportsLogprobs("llama-9-something-versatile-70b")).toBe(false);
  });
});
