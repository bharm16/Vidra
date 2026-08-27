/**
 * Unit tests for Custom Suggestions schemas
 */

import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import { CustomSuggestionsResponseSchema } from "@features/prompt-optimizer/api/customSuggestionsSchema";

describe("CustomSuggestionsResponseSchema", () => {
  it("parses valid response", () => {
    const data = {
      suggestions: ["First", "Second"],
    };

    const result = CustomSuggestionsResponseSchema.parse(data);

    expect(result.suggestions).toEqual(["First", "Second"]);
  });

  it("accepts empty suggestions array", () => {
    const data = {
      suggestions: [],
    };

    const result = CustomSuggestionsResponseSchema.parse(data);

    expect(result.suggestions).toEqual([]);
  });

  it("rejects non-string suggestions", () => {
    const data = {
      suggestions: ["valid", 123],
    };

    expect(() => CustomSuggestionsResponseSchema.parse(data)).toThrow(ZodError);
  });
});
