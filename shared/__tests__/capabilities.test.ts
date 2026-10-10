import { describe, it, expect } from "vitest";
import {
  isConditionMatch,
  areAllConditionsMet,
  resolveAllowedValues,
  resolveFieldState,
  getDefaultValue,
  type CapabilityCondition,
  type CapabilityField,
} from "../capabilities";

describe("isConditionMatch", () => {
  describe("error handling and edge cases", () => {
    it("returns false for eq when field is missing from values", () => {
      expect(isConditionMatch({ field: "missing", eq: "expected" }, {})).toBe(
        false,
      );
    });

    it("returns true for neq when field is missing (undefined !== value)", () => {
      expect(isConditionMatch({ field: "missing", neq: "something" }, {})).toBe(
        true,
      );
    });

    it("returns false when in array is empty", () => {
      expect(isConditionMatch({ field: "x", in: [] }, { x: "anything" })).toBe(
        false,
      );
    });
  });

  describe("combined conditions", () => {
    it("ANDs eq and neq together", () => {
      const c: CapabilityCondition = { field: "mode", eq: "fast", neq: "slow" };
      expect(isConditionMatch(c, { mode: "fast" })).toBe(true);
      expect(isConditionMatch(c, { mode: "slow" })).toBe(false);
    });

    it("ANDs in and not_in together", () => {
      const c: CapabilityCondition = {
        field: "r",
        in: ["720p", "1080p", "4k"],
        not_in: ["4k"],
      };
      expect(isConditionMatch(c, { r: "1080p" })).toBe(true);
      expect(isConditionMatch(c, { r: "4k" })).toBe(false);
      expect(isConditionMatch(c, { r: "480p" })).toBe(false);
    });
  });

  describe("core behavior", () => {
    it("matches eq with string", () => {
      expect(isConditionMatch({ field: "m", eq: "wan" }, { m: "wan" })).toBe(
        true,
      );
      expect(isConditionMatch({ field: "m", eq: "wan" }, { m: "kling" })).toBe(
        false,
      );
    });

    it("matches eq with number", () => {
      expect(isConditionMatch({ field: "s", eq: 30 }, { s: 30 })).toBe(true);
      expect(isConditionMatch({ field: "s", eq: 30 }, { s: 50 })).toBe(false);
    });
  });
});

describe("areAllConditionsMet", () => {
  describe("core behavior", () => {
    it("returns false when any condition fails", () => {
      expect(
        areAllConditionsMet(
          [
            { field: "model", eq: "wan" },
            { field: "mode", eq: "turbo" },
          ],
          { model: "wan", mode: "normal" },
        ),
      ).toBe(false);
    });
  });
});

describe("resolveAllowedValues", () => {
  describe("edge cases", () => {
    it("returns empty array when field has no values and no rules", () => {
      expect(resolveAllowedValues({ type: "enum" }, {})).toEqual([]);
    });
  });

  describe("core behavior", () => {
    it("returns first match when multiple rules match", () => {
      const field: CapabilityField = {
        type: "enum",
        values: ["base"],
        constraints: {
          available_values_if: [
            { if: { field: "m", eq: "a" }, values: ["first"] },
            { if: { field: "m", eq: "a" }, values: ["second"] },
          ],
        },
      };
      expect(resolveAllowedValues(field, { m: "a" })).toEqual(["first"]);
    });

    it("falls back to base values when no rule matches", () => {
      const field: CapabilityField = {
        type: "enum",
        values: ["a", "b"],
        constraints: {
          available_values_if: [
            { if: { field: "m", eq: "kling" }, values: ["x"] },
          ],
        },
      };
      expect(resolveAllowedValues(field, { m: "wan" })).toEqual(["a", "b"]);
    });
  });
});

describe("resolveFieldState", () => {
  describe("edge cases", () => {
    it("returns available=true, disabled=false when no constraints", () => {
      const state = resolveFieldState({ type: "string" }, {});
      expect(state.available).toBe(true);
      expect(state.disabled).toBe(false);
      expect(state.allowedValues).toBeUndefined();
    });
  });

  describe("core behavior", () => {
    it("resolves available=false when available_if fails", () => {
      const field: CapabilityField = {
        type: "string",
        constraints: { available_if: [{ field: "model", eq: "wan" }] },
      };
      expect(resolveFieldState(field, { model: "kling" }).available).toBe(
        false,
      );
    });

    it("resolves disabled=true when disabled_if matches", () => {
      const field: CapabilityField = {
        type: "string",
        constraints: { disabled_if: [{ field: "mode", eq: "locked" }] },
      };
      expect(resolveFieldState(field, { mode: "locked" }).disabled).toBe(true);
    });

    it("includes allowedValues for enum fields", () => {
      expect(
        resolveFieldState({ type: "enum", values: ["a", "b"] }, {})
          .allowedValues,
      ).toEqual(["a", "b"]);
    });
  });
});

describe("getDefaultValue", () => {
  describe("error handling and edge cases", () => {
    it("returns falsy default false", () => {
      expect(getDefaultValue({ type: "bool", default: false })).toBe(false);
    });

    it("returns falsy default 0", () => {
      expect(getDefaultValue({ type: "int", default: 0 })).toBe(0);
    });

    it("returns falsy default empty string", () => {
      expect(getDefaultValue({ type: "string", default: "" })).toBe("");
    });
  });

  describe("core behavior", () => {
    it("returns first value for enum without default", () => {
      expect(
        getDefaultValue({ type: "enum", values: ["first", "second"] }),
      ).toBe("first");
    });

    it("returns false for bool without default", () => {
      expect(getDefaultValue({ type: "bool" })).toBe(false);
    });

    it("returns min for int without default", () => {
      expect(getDefaultValue({ type: "int", constraints: { min: 10 } })).toBe(
        10,
      );
    });

    it("explicit default beats type fallback", () => {
      expect(getDefaultValue({ type: "bool", default: true })).toBe(true);
      expect(
        getDefaultValue({ type: "enum", values: ["a"], default: "b" }),
      ).toBe("b");
    });
  });
});
