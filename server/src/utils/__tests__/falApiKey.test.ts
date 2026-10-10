import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isFalKeyPlaceholder, resolveFalApiKey } from "../falApiKey";

describe("isFalKeyPlaceholder", () => {
  describe("core behavior - detects placeholders", () => {
    it('detects literal "undefined"', () => {
      expect(isFalKeyPlaceholder("undefined")).toBe(true);
    });

    it('detects literal "null"', () => {
      expect(isFalKeyPlaceholder("null")).toBe(true);
    });

    it("trims whitespace before checking", () => {
      expect(isFalKeyPlaceholder("  $FAL_KEY  ")).toBe(true);
      expect(isFalKeyPlaceholder("  undefined  ")).toBe(true);
    });
  });
});

describe("resolveFalApiKey", () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of [
      "FAL_KEY",
      "FAL_API_KEY",
      "FAL_KEY_ID",
      "FAL_KEY_SECRET",
    ]) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of [
      "FAL_KEY",
      "FAL_API_KEY",
      "FAL_KEY_ID",
      "FAL_KEY_SECRET",
    ]) {
      if (savedEnv[key] !== undefined) {
        process.env[key] = savedEnv[key];
      } else {
        delete process.env[key];
      }
    }
  });

  describe("error handling and edge cases", () => {
    it("returns null when no keys available", () => {
      expect(resolveFalApiKey()).toBeNull();
    });

    it("returns null when explicit key is a placeholder", () => {
      expect(resolveFalApiKey("${FAL_KEY}")).toBeNull();
    });

    it("returns null when only FAL_KEY_ID is set", () => {
      process.env.FAL_KEY_ID = "myid";
      expect(resolveFalApiKey()).toBeNull();
    });

    it("returns null when only FAL_KEY_SECRET is set", () => {
      process.env.FAL_KEY_SECRET = "mysecret";
      expect(resolveFalApiKey()).toBeNull();
    });
  });

  describe("core behavior - priority order", () => {
    it("returns explicit key first", () => {
      process.env.FAL_KEY = "env-key";
      expect(resolveFalApiKey("explicit-key")).toBe("explicit-key");
    });

    it("falls back to FAL_KEY_ID:FAL_KEY_SECRET composite", () => {
      process.env.FAL_KEY_ID = "myid";
      process.env.FAL_KEY_SECRET = "mysecret";
      expect(resolveFalApiKey()).toBe("myid:mysecret");
    });

    it("prefers FAL_KEY over FAL_API_KEY", () => {
      process.env.FAL_KEY = "fal-key-value";
      process.env.FAL_API_KEY = "fal-api-key-value";
      expect(resolveFalApiKey()).toBe("fal-key-value");
    });

    it("skips placeholder FAL_KEY and uses FAL_API_KEY", () => {
      process.env.FAL_KEY = "$FAL_KEY";
      process.env.FAL_API_KEY = "real-api-key";
      expect(resolveFalApiKey()).toBe("real-api-key");
    });

    it("skips placeholder explicit key and uses FAL_KEY", () => {
      process.env.FAL_KEY = "real-env-key";
      expect(resolveFalApiKey("$PLACEHOLDER")).toBe("real-env-key");
    });
  });
});
