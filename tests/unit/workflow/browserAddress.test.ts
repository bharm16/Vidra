import { describe, expect, it } from "vitest";
import { parseBrowserAddress, reserveBrowserAddress } from "../../e2e/cross-mode/browserAddress";

describe("WP-02 isolated provider-free browser address", () => {
  it("allocates independent loopback addresses and rejects unrelated servers", async () => {
    const first = await reserveBrowserAddress();
    const second = await reserveBrowserAddress();
    try {
      expect(first.origin).not.toBe(second.origin);
      expect(parseBrowserAddress(first.origin)).toEqual({ origin: first.origin, port: Number(new URL(first.origin).port) });
      expect(() => parseBrowserAddress("https://example.com:58141")).toThrow("loopback");
      expect(() => parseBrowserAddress("http://127.0.0.1:58141/path")).toThrow("origin");
    } finally {
      await first.release();
      await second.release();
    }
  });
});
