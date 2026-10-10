import { describe, it, expect } from "vitest";

import {
  sanitizeHeaders,
  summarize,
  redactSensitiveFields,
  getEmailDomain,
  sanitizeUserData,
} from "@/utils/logging/sanitize";

describe("logging sanitize utilities", () => {
  describe("error handling", () => {
    it("redacts sensitive headers while preserving safe values", () => {
      const result = sanitizeHeaders({
        Authorization: "secret",
        "X-API-Key": "token",
        Accept: "application/json",
        "X-Trace": "trace-id",
      });

      expect(result.Authorization).toBe("[REDACTED]");
      expect(result["X-API-Key"]).toBe("[REDACTED]");
      expect(result.Accept).toBe("application/json");
      expect(result["X-Trace"]).toBe("trace-id");
    });

    it("returns null when an email is invalid", () => {
      expect(getEmailDomain("not-an-email")).toBeNull();
      expect(getEmailDomain("")).toBeNull();
    });
  });

  describe("edge cases", () => {
    it("summarizes long strings with a length suffix", () => {
      const text = "a".repeat(250);
      const result = summarize(text, 50) as string;

      expect(result.startsWith("a".repeat(50))).toBe(true);
      expect(result).toContain("(250 chars)");
    });
  });

  describe("core behavior", () => {
    it("redacts sensitive fields recursively", () => {
      const result = redactSensitiveFields({
        password: "secret",
        profile: {
          apiKey: "token",
          name: "Jamie",
        },
        notes: "safe",
      });

      expect(result.password).toBe("[REDACTED]");
      expect((result.profile as Record<string, unknown>).apiKey).toBe(
        "[REDACTED]",
      );
      expect((result.profile as Record<string, unknown>).name).toBe("Jamie");
      expect(result.notes).toBe("safe");
    });

    it("returns user metadata without exposing PII", () => {
      const result = sanitizeUserData({
        uid: "user-1",
        email: "user@example.com",
        plan: "pro",
        status: "active",
      });

      expect(result).toEqual({
        userId: "user-1",
        emailDomain: "example.com",
        plan: "pro",
        status: "active",
      });
    });
  });
});
