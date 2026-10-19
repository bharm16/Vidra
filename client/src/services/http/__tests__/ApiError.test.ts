/**
 * Unit tests for ApiError
 *
 * Tests error classification methods across all HTTP status categories.
 */

import { describe, expect, it } from "vitest";
import { ApiError, getErrorCode } from "../ApiError";

describe("ApiError", () => {
  // --- Constructor ---
  it("keeps its message, status, response body and code", () => {
    const body = { error: "Denied" };
    const error = new ApiError("Denied", 403, body, "access_denied");
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({ name: "ApiError", message: "Denied", status: 403, response: body, code: "access_denied" });
  });

  // --- isNetworkError ---
  describe("isNetworkError", () => {
    it("is true only when no HTTP status was received", () => {
      expect(new ApiError("offline").isNetworkError()).toBe(true);
      expect(new ApiError("server", 500).isNetworkError()).toBe(false);
    });
  });

  // --- isClientError ---
  describe("isClientError", () => {
    it("covers 400 through 499 and excludes network and server failures", () => {
      expect(new ApiError("bad", 400).isClientError()).toBe(true);
      expect(new ApiError("bad", 499).isClientError()).toBe(true);
      expect(new ApiError("server", 500).isClientError()).toBe(false);
      expect(new ApiError("redirect", 399).isClientError()).toBe(false);
      expect(new ApiError("offline").isClientError()).toBe(false);
    });
  });

  // --- isServerError ---
  describe("isServerError", () => {
    it("covers 500 and above and excludes network and client failures", () => {
      expect(new ApiError("server", 500).isServerError()).toBe(true);
      expect(new ApiError("gateway", 503).isServerError()).toBe(true);
      expect(new ApiError("bad", 499).isServerError()).toBe(false);
      expect(new ApiError("offline").isServerError()).toBe(false);
    });
  });

  // --- isUnauthorized ---
  describe("isUnauthorized", () => {
    it("is true only for 401, not 403", () => {
      expect(new ApiError("sign in", 401).isUnauthorized()).toBe(true);
      expect(new ApiError("forbidden", 403).isUnauthorized()).toBe(false);
    });
  });

  // --- isNotFound ---
  describe("isNotFound", () => {
    it("is true only for 404", () => {
      expect(new ApiError("missing", 404).isNotFound()).toBe(true);
      expect(new ApiError("gone", 410).isNotFound()).toBe(false);
    });
  });

  // --- hasCode / getErrorCode ---
  describe("error codes", () => {
    it("matches the exact code and reads it only from ApiError instances", () => {
      const error = new ApiError("limited", 429, undefined, "RATE_LIMITED");
      expect(error.hasCode("RATE_LIMITED")).toBe(true);
      expect(error.hasCode("rate_limited")).toBe(false);
      expect(getErrorCode(error)).toBe("RATE_LIMITED");
      expect(getErrorCode(Object.assign(new Error("plain"), { code: "RATE_LIMITED" }))).toBeUndefined();
      expect(getErrorCode(new ApiError("no code", 500))).toBeUndefined();
    });
  });

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
