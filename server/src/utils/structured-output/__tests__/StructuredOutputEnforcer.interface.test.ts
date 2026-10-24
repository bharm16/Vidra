import { z } from "zod";
import { describe, expect, it, vi } from "vitest";

// Silence structured logging only. Every collaborator under test —
// parsing, decoding and provider selection run for real.
vi.mock("@infrastructure/Logger", () => ({
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

import { createStructuredOutputCodec } from "../codec";
import { StructuredOutputEnforcer } from "../StructuredOutputEnforcer";

/** Real parsing and decoding with only the external execution port scripted. */
function inMemoryAdapter(...wireTexts: string[]): {
  execute: ReturnType<typeof vi.fn>;
} {
  const execute = vi.fn();
  for (const text of wireTexts) {
    execute.mockResolvedValueOnce({ text, metadata: {} });
  }
  return { execute };
}

describe("StructuredOutputEnforcer (interface)", () => {
  it("sends its codec schema and rejects invalid values before returning", async () => {
    const adapter = inMemoryAdapter('{"count":"wrong"}');
    const codec = createStructuredOutputCodec(z.strictObject({ count: z.number().int() }));
    await expect(StructuredOutputEnforcer.enforceJSON(adapter, "sys", { operation: "enhance_suggestions", codec, maxRetries: 0 })).rejects.toThrow();
    expect(adapter.execute.mock.calls[0]?.[1].schema).toMatchObject({ type: "object", properties: { count: { type: "integer" } } });
  });

  it.each(['[null,17]', '[{"text":7}]', '[{"text":"ok","mode":"bad"}]'])("rejects invalid nested output %s", async wire => {
    const adapter = inMemoryAdapter(wire);
    const codec = createStructuredOutputCodec(z.array(z.object({ text: z.string(), mode: z.enum(["keep"]).optional() })));
    await expect(StructuredOutputEnforcer.enforceJSON(adapter, "sys", { operation: "enhance_suggestions", codec, maxRetries: 0 })).rejects.toThrow();
  });

  it("validates the wrapped {suggestions:[...]} shape before unwrapping", async () => {
    const adapter = inMemoryAdapter(
      '{"suggestions":[{"text":"a"},{"text":"b"}]}',
    );

    // Schema describes the WRAPPED wire form. validate must run on the object
    // (passes), THEN unwrap to the array. If the order flipped, validate would
    // see an array and throw "Expected object but got array".
    const result = await StructuredOutputEnforcer.enforceJSON(adapter, "sys", {
      operation: "enhance_suggestions",
      codec: createStructuredOutputCodec(z.object({ suggestions: z.array(z.object({ text: z.string() })) }).transform(wire => wire.suggestions)),
    });

    expect(result).toEqual([{ text: "a" }, { text: "b" }]);
    expect(adapter.execute).toHaveBeenCalledTimes(1);
  });

  it("parses for real: retries malformed JSON, then resolves", async () => {
    const adapter = inMemoryAdapter("not json at all", '[{"text":"ok"}]');

    const result = await StructuredOutputEnforcer.enforceJSON(adapter, "sys", {
      operation: "enhance_suggestions",
      maxRetries: 1,
      codec: createStructuredOutputCodec(z.array(z.object({ text: z.string() }))),
    });

    expect(result).toEqual([{ text: "ok" }]);
    expect(adapter.execute).toHaveBeenCalledTimes(2);
  });

  it("captures siblings alongside the decoded array", async () => {
    const adapter = inMemoryAdapter(
      '{"suggestions":[{"text":"a"}],"meta":{"model":"x"}}',
    );

    const result = await StructuredOutputEnforcer.enforceJSON(adapter, "sys", {
      operation: "enhance_suggestions",
      codec: createStructuredOutputCodec(z.object({ suggestions: z.array(z.object({ text: z.string() })) }).passthrough().transform(({ suggestions, ...siblings }) => ({ value: suggestions, siblings }))),
    });

    expect(result.value).toEqual([{ text: "a" }]);
    expect(result.siblings).toEqual({ meta: { model: "x" } });
  });

  it("enforces required fields through the interface (validate runs)", async () => {
    // Wire parses fine but is missing a required field. validate must reject;
    // with no retries left, the rejection surfaces to the caller.
    const adapter = inMemoryAdapter('{"other":1}');

    await expect(
      StructuredOutputEnforcer.enforceJSON(adapter, "sys", {
        operation: "enhance_suggestions",
        maxRetries: 0,
        codec: createStructuredOutputCodec(z.object({ needed: z.string() })),
      }),
    ).rejects.toThrow(/needed/);
  });
});
