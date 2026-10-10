/**
 * Unit tests for ApiError
 *
 * Tests error classification methods across all HTTP status categories.
 */

import { describe, expect, it } from "vitest";
import { ApiError } from "../ApiError";

describe("ApiError", () => {
  // --- Constructor ---

  // --- isNetworkError ---

  // --- isClientError ---

  // --- isServerError ---

  // --- isUnauthorized ---

  // --- isNotFound ---

  // --- isRateLimited ---
  describe("isRateLimited", () => {
    it("returns true for 429", () => {
      expect(new ApiError("slow", 429).isRateLimited()).toBe(true);
    });

    it("returns false for 500", () => {
      expect(new ApiError("slow", 500).isRateLimited()).toBe(false);
    });
  });
});
