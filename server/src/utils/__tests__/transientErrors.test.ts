import { describe, expect, it } from "vitest";
import {
  hasTransientMessageHint,
  isTransientFirestoreError,
} from "../transientErrors";

describe("transientErrors", () => {
  describe("hasTransientMessageHint", () => {
    it.each([
      "Connection timed out",
      "ETIMEDOUT",
      "ECONNRESET",
      "ECONNREFUSED",
      "service unavailable",
      "temporarily unavailable",
      "resource exhausted",
      "rate limit exceeded",
      "Error 429: Too many requests",
      "deadline exceeded",
      "connection reset by peer",
      "socket hang up",
      "fetch failed",
    ])("returns true for transient message: %s", (message) => {
      expect(hasTransientMessageHint(new Error(message))).toBe(true);
    });

    it.each([
      "Not found",
      "Invalid argument",
      "Permission denied",
      "Unauthenticated",
      "Already exists",
    ])("returns false for non-transient message: %s", (message) => {
      expect(hasTransientMessageHint(new Error(message))).toBe(false);
    });

    it("handles non-Error values", () => {
      expect(hasTransientMessageHint("timed out")).toBe(true);
      expect(hasTransientMessageHint("Permission denied")).toBe(false);
      expect(hasTransientMessageHint(null)).toBe(false);
      expect(hasTransientMessageHint(undefined)).toBe(false);
    });
  });

  describe("isTransientFirestoreError", () => {
    it.each([
      "aborted",
      "cancelled",
      "deadline-exceeded",
      "internal",
      "resource-exhausted",
      "unavailable",
      "unknown",
    ])("returns true for Firestore code: %s", (code) => {
      const error = Object.assign(new Error("Firestore error"), { code });
      expect(isTransientFirestoreError(error)).toBe(true);
    });

    it.each([
      "not-found",
      "permission-denied",
      "unauthenticated",
      "already-exists",
      "invalid-argument",
      "failed-precondition",
    ])("returns false for non-transient Firestore code: %s", (code) => {
      const error = Object.assign(new Error("Firestore error"), { code });
      expect(isTransientFirestoreError(error)).toBe(false);
    });

    it("handles case-insensitive codes", () => {
      const error = Object.assign(new Error("test"), {
        code: "  UNAVAILABLE  ",
      });
      expect(isTransientFirestoreError(error)).toBe(true);
    });

    it("handles non-string codes", () => {
      const error = Object.assign(new Error("timed out"), { code: 14 });
      // Numeric code won't match, but message hint will
      expect(isTransientFirestoreError(error)).toBe(true);
    });
  });
});
