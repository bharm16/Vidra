import { describe, it, expect } from "vitest";

import { isUrlSafe, assertUrlSafe } from "@server/shared/urlValidation";

describe("urlValidation", () => {
  describe("isUrlSafe", () => {
    it("accepts valid public HTTPS URLs", () => {
      expect(isUrlSafe("https://replicate.delivery/some-image.png")).toBe(true);
      expect(isUrlSafe("https://storage.googleapis.com/bucket/file.png")).toBe(
        true,
      );
      expect(isUrlSafe("https://example.com/path")).toBe(true);
    });

    it("accepts valid public HTTP URLs", () => {
      expect(isUrlSafe("http://example.com/path")).toBe(true);
    });

    it("rejects AWS metadata endpoint", () => {
      expect(isUrlSafe("http://169.254.169.254/latest/meta-data/")).toBe(false);
    });

    it("rejects ECS metadata endpoint", () => {
      expect(isUrlSafe("http://169.254.170.2/v2/credentials")).toBe(false);
    });

    it("rejects GCP metadata endpoint", () => {
      expect(
        isUrlSafe("http://metadata.google.internal/computeMetadata/v1/"),
      ).toBe(false);
    });

    it("rejects localhost", () => {
      expect(isUrlSafe("http://localhost:3001/health")).toBe(false);
      expect(isUrlSafe("http://127.0.0.1:3001/api")).toBe(false);
      expect(isUrlSafe("http://0.0.0.0/")).toBe(false);
    });

    it("rejects RFC1918 private IP ranges", () => {
      expect(isUrlSafe("http://10.0.0.1/internal")).toBe(false);
      expect(isUrlSafe("http://172.16.0.1/internal")).toBe(false);
      expect(isUrlSafe("http://192.168.1.1/internal")).toBe(false);
    });

    it("rejects IPv6 loopback", () => {
      expect(isUrlSafe("http://[::1]/")).toBe(false);
    });

    it("rejects non-http(s) schemes", () => {
      expect(isUrlSafe("ftp://example.com/file")).toBe(false);
      expect(isUrlSafe("file:///etc/passwd")).toBe(false);
      expect(isUrlSafe("javascript:alert(1)")).toBe(false);
    });

    it("rejects invalid URLs", () => {
      expect(isUrlSafe("")).toBe(false);
      expect(isUrlSafe("not-a-url")).toBe(false);
    });
  });

  describe("assertUrlSafe", () => {
    it("throws for unsafe URLs with descriptive message", () => {
      expect(() =>
        assertUrlSafe("http://169.254.169.254/latest/meta-data/", "sourceUrl"),
      ).toThrow("Invalid URL for sourceUrl");
    });
  });
});
