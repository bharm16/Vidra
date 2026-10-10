import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fc from "fast-check";

import {
  loadGenerationParams,
  loadSelectedModel,
  persistGenerationParams,
  persistSelectedModel,
} from "@features/prompt-optimizer/context/promptStateStorage";

const UNSAFE_RECORD_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const safeCapabilityKeyArbitrary = fc
  .string({ minLength: 1 })
  .filter((key) => !UNSAFE_RECORD_KEYS.has(key));

describe("promptStateStorage", () => {
  const originalGetItem = localStorage.getItem;
  const originalSetItem = localStorage.setItem;

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.getItem = originalGetItem;
    localStorage.setItem = originalSetItem;
  });

  describe("error handling", () => {
    it("returns an empty model string when storage access fails", () => {
      localStorage.getItem = vi.fn(() => {
        throw new Error("Read failure");
      });

      expect(loadSelectedModel()).toBe("");
    });

    it("returns empty params when storage access fails", () => {
      localStorage.getItem = vi.fn(() => {
        throw new Error("Read failure");
      });

      expect(loadGenerationParams()).toEqual({});
    });

    it("returns empty params when JSON parsing fails", () => {
      localStorage.setItem("prompt-optimizer:generationParams", "{not-json");

      expect(loadGenerationParams()).toEqual({});
    });
  });

  describe("core behavior", () => {
    it("round-trips the selected model value", () => {
      persistSelectedModel("model-a");

      expect(loadSelectedModel()).toBe("model-a");
    });

    it("round-trips generation params with property-based coverage", () => {
      fc.assert(
        fc.property(
          fc.dictionary(
            safeCapabilityKeyArbitrary,
            fc.oneof(fc.string(), fc.integer(), fc.boolean()),
          ),
          (params) => {
            persistGenerationParams(params);
            expect(loadGenerationParams()).toEqual(params);
          },
        ),
      );
    });

    it("sanitizes unsafe object keys in generation params", () => {
      const params = JSON.parse('{"safe":"ok","__proto__":false}') as Record<
        string,
        string | number | boolean
      >;

      persistGenerationParams(params);

      expect(loadGenerationParams()).toEqual({ safe: "ok" });
    });
  });
});
