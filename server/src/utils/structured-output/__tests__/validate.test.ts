import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StructuredOutputSchema } from "../types";
import { validateStructuredOutput } from "../validate";

// Mock the logger
vi.mock("@infrastructure/Logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("validateStructuredOutput", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("error handling", () => {
    it("throws when expecting array but receiving object", () => {
      const schema: StructuredOutputSchema = { type: "array" };
      const data = { key: "value" };

      expect(() => validateStructuredOutput(data, schema)).toThrow(
        "Expected array but got object",
      );
    });

    it("throws when expecting object but receiving array", () => {
      const schema: StructuredOutputSchema = { type: "object" };
      const data = ["item1", "item2"];

      expect(() => validateStructuredOutput(data, schema)).toThrow(
        "Expected object but got array",
      );
    });
  });

  describe("core behavior", () => {
    it("passes validation for array with all required fields", () => {
      const schema: StructuredOutputSchema = {
        type: "array",
        items: { required: ["id", "text"] },
      };
      const data = [
        { id: 1, text: "first" },
        { id: 2, text: "second" },
      ];

      expect(() => validateStructuredOutput(data, schema)).not.toThrow();
    });

    it("includes array index in error message for array items", () => {
      const schema: StructuredOutputSchema = {
        type: "array",
        items: { required: ["id"] },
      };
      const data = [{ id: 1 }, { missing: "field" }, { id: 3 }];

      expect(() => validateStructuredOutput(data, schema)).toThrow(
        "Missing required field 'id' in array item at index 1",
      );
    });
  });
});
