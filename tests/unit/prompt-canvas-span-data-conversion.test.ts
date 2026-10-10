import { describe, expect, it } from "vitest";

import { isValidSpan } from "@features/prompt-optimizer/PromptCanvas/utils/spanDataConversion";

describe("spanDataConversion", () => {
  it("validates spans with required fields", () => {
    expect(
      isValidSpan({ start: 0, end: 2, category: "style", confidence: 0.5 }),
    ).toBe(true);
    expect(isValidSpan({ start: 0, end: 2, category: "style" })).toBe(false);
  });
});
