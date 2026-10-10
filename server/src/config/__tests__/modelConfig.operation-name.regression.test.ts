import { describe, expect, it } from "vitest";
import {
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
 * The runtime guard accepts configured operations and refuses misspellings
 * and inherited Object keys before a caller looks up a model configuration.
 */
describe("OperationName is a real literal union", () => {
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
});
