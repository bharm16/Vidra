import { describe, expect, it } from "vitest";

import {
  formatSchemaErrors,
  validateSchema,
  validateSchemaOrThrow,
} from "@llm/span-labeling/validation/SchemaValidator.js";
import {
  VALID_TAXONOMY_IDS,
  validateSpanResponse,
} from "@llm/span-labeling/schemas/SpanLabelingSchema.js";

describe("span labeling schema contracts", () => {
  it("rejects malformed payload shapes", () => {
    const malformed = {
      analysis_trace: "trace",
      spans: "not-an-array",
      meta: { version: "v1", notes: "x" },
    };

    const result = validateSchema(malformed);
    expect(result).toBe(false);
    expect(formatSchemaErrors()).toContain("spans should be array");
  });

  it("rejects payloads with missing required fields", () => {
    const missingFields = {
      spans: [],
      meta: { version: "v1", notes: "x" },
    };

    expect(validateSchema(missingFields)).toBe(false);
    expect(() => validateSchemaOrThrow(missingFields)).toThrow(
      /Schema validation failed/,
    );
  });

  it("applies current AJV additionalProperties behavior for extra fields", () => {
    const payload = {
      analysis_trace: "ok",
      spans: [
        {
          text: "camera pan",
          role: "camera.movement",
          confidence: 0.9,
          extraSpanField: "strip-me",
        },
      ],
      meta: {
        version: "v1",
        notes: "valid",
        extraMetaField: "strip-me",
      },
      isAdversarial: false,
      extraRootField: "strip-me",
    } as Record<string, unknown>;

    const valid = validateSchema(payload);

    expect(valid).toBe(true);
    expect(payload.extraRootField).toBeUndefined();
    expect(
      (payload.meta as Record<string, unknown>).extraMetaField,
    ).toBeUndefined();
    expect(
      (
        (payload.spans as Array<Record<string, unknown>>)[0] as Record<
          string,
          unknown
        >
      ).extraSpanField,
    ).toBeUndefined();
  });

  it("throws a formatted message from validateSchemaOrThrow for invalid input", () => {
    const invalid = {
      analysis_trace: "x",
      spans: [{ text: "cat", role: "subject.identity", confidence: 2 }],
      meta: { version: "v1", notes: "x" },
    };

    expect(() => validateSchemaOrThrow(invalid)).toThrow(
      /Schema validation failed:/,
    );
  });

  it("validates span responses with taxonomy and confidence constraints", () => {
    const validResponse = {
      analysis_trace: "reasoned output",
      spans: [
        {
          text: "cinematic pan",
          role: VALID_TAXONOMY_IDS[0],
          confidence: 0.8,
        },
      ],
      meta: { version: "v1", notes: "ok" },
      isAdversarial: false,
    };
    const invalidResponse = {
      analysis_trace: "reasoned output",
      spans: [
        {
          text: "cinematic pan",
          role: "invalid.role",
          confidence: 2,
        },
      ],
      meta: { version: "v1", notes: "ok" },
      isAdversarial: false,
    };

    expect(validateSpanResponse(validResponse)).toEqual({
      valid: true,
      errors: [],
    });
    const invalid = validateSpanResponse(invalidResponse);
    expect(invalid.valid).toBe(false);
    expect(invalid.errors.join(" | ")).toContain("not a valid taxonomy ID");
    expect(invalid.errors.join(" | ")).toContain("confidence must be 0-1");
  });
});
