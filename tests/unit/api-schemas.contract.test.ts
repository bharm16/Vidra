import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  ApiErrorCodeSchema,
  ApiErrorResponseSchema,
  ApiSuccessResponseSchema,
  ApiResponseSchema,
} from "#shared/schemas/api.schemas";

describe("ApiErrorCode contract", () => {
  it("rejects unknown error codes", () => {
    expect(ApiErrorCodeSchema.safeParse("NOT_A_CODE").success).toBe(false);
    expect(ApiErrorCodeSchema.safeParse("").success).toBe(false);
  });
});

describe("ApiErrorResponse contract", () => {
  it("accepts a fully populated error response", () => {
    const result = ApiErrorResponseSchema.safeParse({
      error: "Insufficient credits",
      code: "INSUFFICIENT_CREDITS",
      details: "You need 5 more credits",
      requestId: "req-abc-123",
    });

    expect(result.success).toBe(true);
  });

  it("rejects error responses missing the error field", () => {
    expect(ApiErrorResponseSchema.safeParse({}).success).toBe(false);
    expect(
      ApiErrorResponseSchema.safeParse({ code: "AUTH_REQUIRED" }).success,
    ).toBe(false);
  });
});

describe("ApiSuccessResponse contract", () => {
  const DataSchema = z.object({ value: z.string() });

  it("accepts a valid success response", () => {
    const schema = ApiSuccessResponseSchema(DataSchema);
    const result = schema.safeParse({
      success: true,
      data: { value: "hello" },
    });

    expect(result.success).toBe(true);
  });

  it("rejects when success is not true", () => {
    const schema = ApiSuccessResponseSchema(DataSchema);
    expect(
      schema.safeParse({ success: false, data: { value: "x" } }).success,
    ).toBe(false);
  });

  it("rejects when data does not match inner schema", () => {
    const schema = ApiSuccessResponseSchema(DataSchema);
    expect(
      schema.safeParse({ success: true, data: { value: 123 } }).success,
    ).toBe(false);
  });
});

describe("ApiResponse discriminated union contract", () => {
  const DataSchema = z.object({ count: z.number() });

  it("accepts a failure variant", () => {
    const schema = ApiResponseSchema(DataSchema);
    const result = schema.safeParse({
      success: false,
      error: "Validation failed",
      code: "INVALID_REQUEST",
    });

    expect(result.success).toBe(true);
  });

  it("accepts a failure variant with only error (no code)", () => {
    const schema = ApiResponseSchema(DataSchema);
    const result = schema.safeParse({
      success: false,
      error: "Internal error",
    });

    expect(result.success).toBe(true);
  });

  it("rejects missing discriminant", () => {
    const schema = ApiResponseSchema(DataSchema);
    expect(schema.safeParse({ data: { count: 1 } }).success).toBe(false);
  });

  it("rejects failure variant missing error field", () => {
    const schema = ApiResponseSchema(DataSchema);
    expect(schema.safeParse({ success: false }).success).toBe(false);
  });
});
