import { describe, expect, it } from "vitest";
import type { AIExecutionPort } from "@services/ai-model/ports/AIExecutionPort";
import {
  ModelConfig,
  getModelConfig,
  isOperationName,
  shouldUseDeveloperMessage,
  shouldUseSeed,
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

  it("rejects an unconfigured operation at every lookup helper", () => {
    // The three directives are the assertion: an unconfigured operation used
    // to resolve to DEFAULT_CONFIG (gpt-4o-mini at temperature 0) instead of
    // failing. If any lookup widens back to `string`, its directive becomes
    // unused and `tsc` fails.
    // @ts-expect-error -- "not_an_operation" is not a configured operation
    const forGetModelConfig: Parameters<typeof getModelConfig>[0] =
      "not_an_operation";
    // @ts-expect-error -- "not_an_operation" is not a configured operation
    const forShouldUseSeed: Parameters<typeof shouldUseSeed>[0] =
      "not_an_operation";
    // @ts-expect-error -- "not_an_operation" is not a configured operation
    const forDeveloperMessage: Parameters<typeof shouldUseDeveloperMessage>[0] =
      "not_an_operation";

    for (const rejected of [
      forGetModelConfig,
      forShouldUseSeed,
      forDeveloperMessage,
    ]) {
      expect(isOperationName(rejected)).toBe(false);
    }
  });

  it("rejects an unconfigured operation at the aiService seam", () => {
    // Same lock one layer out: the port every service calls through.
    type ExecuteOperation = Parameters<AIExecutionPort["execute"]>[0];

    const configured: ExecuteOperation = "span_labeling";
    expect(isOperationName(configured)).toBe(true);

    // @ts-expect-error -- the seam accepts only configured operations
    const rejected: ExecuteOperation = "not_an_operation";
    expect(isOperationName(rejected)).toBe(false);
  });
});
