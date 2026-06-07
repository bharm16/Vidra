import { describe, expect, it, vi } from "vitest";

// Silence structured logging only. Every collaborator under test —
// parse, validate, unwrapper, promptEnhancers, ProviderDetector — runs for real.
vi.mock("@infrastructure/Logger", () => ({
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

import { StructuredOutputEnforcer } from "../StructuredOutputEnforcer";

/**
 * Interface-level tests for StructuredOutputEnforcer.
 *
 * The sibling StructuredOutputEnforcer.test.ts mocks every collaborator, so it
 * can only prove control flow ("retry fires"). It cannot see the orchestration
 * invariant that actually breaks: schema validation runs on the WRAPPED wire
 * shape BEFORE auto-unwrapping (StructuredOutputEnforcer.ts:156-161). These
 * tests cross the real interface via an in-memory adapter so that calling order
 * is the thing under test.
 */
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
  it("validates the wrapped {suggestions:[...]} shape before unwrapping", async () => {
    const adapter = inMemoryAdapter(
      '{"suggestions":[{"text":"a"},{"text":"b"}]}',
    );

    // Schema describes the WRAPPED wire form. validate must run on the object
    // (passes), THEN unwrap to the array. If the order flipped, validate would
    // see an array and throw "Expected object but got array".
    const result = await StructuredOutputEnforcer.enforceJSON(adapter, "sys", {
      operation: "test_operation",
      isArray: true,
      schema: { type: "object", required: ["suggestions"] },
    });

    expect(result).toEqual([{ text: "a" }, { text: "b" }]);
    expect(adapter.execute).toHaveBeenCalledTimes(1);
  });

  it("parses for real: retries malformed JSON, then resolves", async () => {
    const adapter = inMemoryAdapter("not json at all", '[{"text":"ok"}]');

    const result = await StructuredOutputEnforcer.enforceJSON(adapter, "sys", {
      operation: "test_operation",
      isArray: true,
      maxRetries: 1,
      schema: { type: "array", items: { required: ["text"] } },
    });

    expect(result).toEqual([{ text: "ok" }]);
    expect(adapter.execute).toHaveBeenCalledTimes(2);
  });

  it("captures siblings alongside the unwrapped array (real unwrapper)", async () => {
    const adapter = inMemoryAdapter(
      '{"suggestions":[{"text":"a"}],"meta":{"model":"x"}}',
    );

    const result = await StructuredOutputEnforcer.enforceJSON<{
      value: unknown;
      siblings: Record<string, unknown>;
    }>(adapter, "sys", {
      operation: "test_operation",
      isArray: true,
      captureSiblings: true,
      schema: { type: "object", required: ["suggestions"] },
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
        operation: "test_operation",
        maxRetries: 0,
        schema: { type: "object", required: ["needed"] },
      }),
    ).rejects.toThrow(/needed/);
  });
});
