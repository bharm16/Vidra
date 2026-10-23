import { describe, expect, it } from "vitest";
import { privateCacheKey } from "../privateCacheKey";

describe("private generation cache keys", () => {
  it("canonicalizes object keys while preserving full values and text case", () => {
    const first = privateCacheKey("enhancement", "owner", { a: "A", nested: { b: 2, c: 3 } });
    expect(privateCacheKey("enhancement", "owner", { nested: { c: 3, b: 2 }, a: "A" })).toBe(first);
    expect(privateCacheKey("enhancement", "owner", { a: "a", nested: { b: 2, c: 3 } })).not.toBe(first);
  });

  it.each([
    { fullPrompt: `${"a".repeat(6500)} ending one` },
    { originalUserPrompt: `${"z".repeat(600)} ending one` },
  ])("retains private prompt tails past former truncation points", (inputs) => {
    const first = privateCacheKey("enhancement", "owner", inputs);
    const changed = Object.fromEntries(Object.entries(inputs).map(([key, value]) => [key, `${value} changed`]));
    expect(privateCacheKey("enhancement", "owner", changed)).not.toBe(first);
  });

  it.each([undefined, "", " ", "anonymous"])("bypasses caching without an explicit owner: %s", (owner) => {
    expect(privateCacheKey("enhancement", owner, { private: "text" })).toBeNull();
  });
});
