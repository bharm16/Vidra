import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  sanitizePolicy,
  sanitizeOptions,
  buildTaskDescription,
} from "../policyUtils";
import {
  DEFAULT_POLICY,
  DEFAULT_OPTIONS,
  PERFORMANCE,
} from "../../config/SpanLabelingConfig";

describe("sanitizePolicy", () => {
  describe("error handling", () => {
    it("returns defaults when given null", () => {
      const result = sanitizePolicy(null);

      expect(result.nonTechnicalWordLimit).toBe(
        DEFAULT_POLICY.nonTechnicalWordLimit,
      );
      expect(result.allowOverlap).toBe(false);
    });

    it("replaces NaN word limit with default", () => {
      const result = sanitizePolicy({ nonTechnicalWordLimit: NaN });

      expect(result.nonTechnicalWordLimit).toBe(
        DEFAULT_POLICY.nonTechnicalWordLimit,
      );
    });

    it("replaces Infinity word limit with default", () => {
      const result = sanitizePolicy({ nonTechnicalWordLimit: Infinity });

      expect(result.nonTechnicalWordLimit).toBe(
        DEFAULT_POLICY.nonTechnicalWordLimit,
      );
    });
  });

  describe("edge cases", () => {
    it("coerces truthy non-boolean allowOverlap to false", () => {
      // @ts-expect-error Testing type coercion
      const result = sanitizePolicy({ allowOverlap: "yes" });

      expect(result.allowOverlap).toBe(false);
    });

    it("handles string number word limit by using default", () => {
      // @ts-expect-error Testing type coercion
      const result = sanitizePolicy({ nonTechnicalWordLimit: "15" });

      // Number('15') = 15, which is valid
      expect(result.nonTechnicalWordLimit).toBe(15);
    });
  });

  describe("core behavior", () => {
    it("preserves valid positive integer word limit", () => {
      const result = sanitizePolicy({ nonTechnicalWordLimit: 20 });

      expect(result.nonTechnicalWordLimit).toBe(20);
    });

    it("preserves explicit true allowOverlap", () => {
      const result = sanitizePolicy({ allowOverlap: true });

      expect(result.allowOverlap).toBe(true);
    });
  });
});

describe("sanitizeOptions", () => {
  describe("error handling", () => {
    it("returns defaults when given null", () => {
      const result = sanitizeOptions(null);

      expect(result.maxSpans).toBe(DEFAULT_OPTIONS.maxSpans);
      expect(result.minConfidence).toBe(DEFAULT_OPTIONS.minConfidence);
      expect(result.templateVersion).toBe(DEFAULT_OPTIONS.templateVersion);
    });

    it("replaces non-integer maxSpans with default", () => {
      const result = sanitizeOptions({ maxSpans: 10.5 });

      expect(result.maxSpans).toBe(DEFAULT_OPTIONS.maxSpans);
    });
  });

  describe("edge cases", () => {
    it("handles boundary minConfidence of 0", () => {
      const result = sanitizeOptions({ minConfidence: 0 });

      expect(result.minConfidence).toBe(0);
    });

    it("handles boundary minConfidence of 1", () => {
      const result = sanitizeOptions({ minConfidence: 1 });

      expect(result.minConfidence).toBe(1);
    });

    it("uses default for empty string templateVersion", () => {
      const result = sanitizeOptions({ templateVersion: "" });

      expect(result.templateVersion).toBe(DEFAULT_OPTIONS.templateVersion);
    });
  });

  describe("core behavior", () => {
    it("preserves valid integer maxSpans below limit", () => {
      const result = sanitizeOptions({ maxSpans: 25 });

      expect(result.maxSpans).toBe(25);
    });

    it("preserves valid minConfidence between 0 and 1", () => {
      const result = sanitizeOptions({ minConfidence: 0.75 });

      expect(result.minConfidence).toBe(0.75);
    });

    it("preserves non-empty templateVersion string", () => {
      const result = sanitizeOptions({ templateVersion: "v3.0" });

      expect(result.templateVersion).toBe("v3.0");
    });
  });

  describe("invariants", () => {
    it("maxSpans is always positive integer at or below absolute limit", () => {
      fc.assert(
        fc.property(fc.anything(), (input) => {
          const result = sanitizeOptions({ maxSpans: input as number });
          expect(Number.isInteger(result.maxSpans)).toBe(true);
          expect(result.maxSpans).toBeGreaterThan(0);
          expect(result.maxSpans).toBeLessThanOrEqual(
            PERFORMANCE.MAX_SPANS_ABSOLUTE_LIMIT,
          );
        }),
      );
    });

    it("minConfidence is always between 0 and 1 inclusive", () => {
      fc.assert(
        fc.property(fc.anything(), (input) => {
          const result = sanitizeOptions({ minConfidence: input as number });
          expect(result.minConfidence).toBeGreaterThanOrEqual(0);
          expect(result.minConfidence).toBeLessThanOrEqual(1);
        }),
      );
    });
  });
});

describe("buildTaskDescription", () => {
  describe("core behavior", () => {
    it("includes no overlap message when allowOverlap is false", () => {
      const result = buildTaskDescription(10, { allowOverlap: false });

      expect(result).toContain("Do not return overlapping spans");
      expect(result).not.toContain("Overlapping spans are permitted");
    });

    it("combines all policy constraints into a single description", () => {
      const result = buildTaskDescription(50, {
        allowOverlap: true,
        nonTechnicalWordLimit: 20,
      });

      expect(result).toContain("Identify up to 50 spans");
      expect(result).toContain("Overlapping spans are permitted");
      expect(result).toContain("Non-technical spans must be 20 words or fewer");
    });
  });
});
