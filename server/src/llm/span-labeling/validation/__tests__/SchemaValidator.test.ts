import { describe, it, expect } from "vitest";
import { validateSchema } from "../SchemaValidator";

describe("validateSchema", () => {
  describe("error handling", () => {
    it("returns false for null data", () => {
      const result = validateSchema(null);
      expect(result).toBe(false);
    });

    it("returns false for array data", () => {
      const result = validateSchema([]);
      expect(result).toBe(false);
    });

    it("returns false when spans is missing", () => {
      const result = validateSchema({
        analysis_trace: "test",
        meta: { version: "v1", notes: "test" },
      });
      expect(result).toBe(false);
    });

    it("returns false when meta is missing", () => {
      const result = validateSchema({
        analysis_trace: "test",
        spans: [],
      });
      expect(result).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("returns false when span item is missing required fields", () => {
      const result = validateSchema({
        analysis_trace: "test",
        spans: [{ start: 0, end: 5 }], // missing text and role
        meta: { version: "v1", notes: "test" },
      });
      expect(result).toBe(false);
    });

    it("returns false when meta.version is missing", () => {
      const result = validateSchema({
        analysis_trace: "test",
        spans: [],
        meta: { notes: "test" },
      });
      expect(result).toBe(false);
    });

    it("returns false when meta.notes is missing", () => {
      const result = validateSchema({
        analysis_trace: "test",
        spans: [],
        meta: { version: "v1" },
      });
      expect(result).toBe(false);
    });

    it("returns false when start is negative", () => {
      const result = validateSchema({
        analysis_trace: "test",
        spans: [{ text: "hello", role: "subject", start: -1, end: 5 }],
        meta: { version: "v1", notes: "test" },
      });
      expect(result).toBe(false);
    });

    it("allows empty analysis_trace string", () => {
      const result = validateSchema({
        analysis_trace: "",
        spans: [],
        meta: { version: "v1", notes: "" },
      });
      expect(result).toBe(true);
    });
  });

  describe("core behavior", () => {
    it("returns true for valid response with optional start/end indices", () => {
      const result = validateSchema({
        analysis_trace: "test",
        spans: [
          { text: "cat", role: "subject", start: 0, end: 3, confidence: 0.95 },
        ],
        meta: { version: "v1", notes: "with indices" },
      });
      expect(result).toBe(true);
    });

    it("returns true when isAdversarial flag is present", () => {
      const result = validateSchema({
        analysis_trace: "test",
        spans: [],
        meta: { version: "v1", notes: "" },
        isAdversarial: true,
      });
      expect(result).toBe(true);
    });

    it("returns true when is_adversarial (snake_case) flag is present", () => {
      const result = validateSchema({
        analysis_trace: "test",
        spans: [],
        meta: { version: "v1", notes: "" },
        is_adversarial: false,
      });
      expect(result).toBe(true);
    });
  });
});
