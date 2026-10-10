import { describe, expect, it } from "vitest";
import {
  unwrapSuggestionsArray,
  unwrapSuggestionsArrayWithSiblings,
} from "../unwrapper";

describe("unwrapSuggestionsArray", () => {
  describe("error handling", () => {
    it("handles null input", () => {
      const result = unwrapSuggestionsArray(null, true);

      expect(result).toEqual({ value: null, unwrapped: false });
    });
  });

  describe("edge cases", () => {
    it("returns original when isArray is false", () => {
      const wrapped = { suggestions: ["a", "b", "c"] };
      const result = unwrapSuggestionsArray(wrapped, false);

      expect(result.value).toEqual(wrapped);
      expect(result.unwrapped).toBe(false);
    });

    it("returns original when object has no suggestions property", () => {
      const obj = { items: ["a", "b", "c"] };
      const result = unwrapSuggestionsArray(obj, true);

      expect(result.value).toEqual(obj);
      expect(result.unwrapped).toBe(false);
    });

    it("returns original when suggestions property is not an array", () => {
      const obj = { suggestions: "not an array" };
      const result = unwrapSuggestionsArray(obj, true);

      expect(result.value).toEqual(obj);
      expect(result.unwrapped).toBe(false);
    });
  });
});

describe("unwrapSuggestionsArrayWithSiblings", () => {
  it("returns empty siblings and unwrapped=false when parent is not an object", () => {
    const parent = [{ text: "x" }];
    const result = unwrapSuggestionsArrayWithSiblings<typeof parent>(
      parent,
      true,
    );
    expect(result.unwrapped).toBe(false);
    expect(result.value).toEqual([{ text: "x" }]);
    expect(result.siblings).toEqual({});
  });
});
