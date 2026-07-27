import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONFIG,
  ModelConfig,
  getModelConfig,
  isOperationName,
  type OperationName,
} from "../modelConfig";

/**
 * Regression: `OperationName` was declared as `keyof typeof ModelConfig` while
 * ModelConfig was annotated `Record<string, ModelConfigEntry>`, which collapses
 * the union to `string`. The type was therefore both unused AND inert — it
 * accepted every misspelling, and lookups silently fell through to
 * DEFAULT_CONFIG (gpt-4o-mini at temperature 0) instead of failing.
 *
 * Invariant under test: OperationName is the literal union of configured
 * operations, and there is an explicit narrowing path from a runtime string.
 * The `@ts-expect-error` below is the load-bearing assertion — if the union
 * ever widens back to `string`, the directive becomes unused and `tsc` fails.
 */
describe("OperationName is a real literal union", () => {
  it("accepts a configured operation and rejects a misspelling at compile time", () => {
    const configured: OperationName = "span_labeling";
    expect(ModelConfig[configured]).toBeDefined();

    // @ts-expect-error -- "span_labelling" is not a configured operation
    const misspelled: OperationName = "span_labelling";
    // Runtime proof of the same fact the type system just rejected.
    expect(ModelConfig[misspelled]).toBeUndefined();
  });

  it("narrows a runtime string instead of forcing a cast", () => {
    const fromRuntime: string = "optimize_standard";

    expect(isOperationName(fromRuntime)).toBe(true);
    if (isOperationName(fromRuntime)) {
      const narrowed: OperationName = fromRuntime;
      expect(getModelConfig(narrowed).model).toBeDefined();
    }

    expect(isOperationName("optimize_standrad")).toBe(false);
    expect(isOperationName("toString")).toBe(false);
  });

  it("still falls back to DEFAULT_CONFIG for an unconfigured operation", () => {
    // The fallback is what the literal union exists to make visible — it is
    // deliberate behavior for genuinely dynamic operations, not a typo net.
    expect(getModelConfig("not_an_operation")).toBe(DEFAULT_CONFIG);
  });
});
