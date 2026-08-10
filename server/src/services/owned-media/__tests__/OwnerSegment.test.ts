import { describe, expect, it } from "vitest";
import { ownerSegment } from "../OwnerSegment";

describe("ownerSegment", () => {
  it("passes through the uid shapes this codebase actually issues", () => {
    expect(ownerSegment("abc123XYZ")).toBe("abc123XYZ");
    expect(ownerSegment("api-key:ci-user")).toBe("api-key:ci-user");
    expect(ownerSegment("user@example.com")).toBe("user@example.com");
  });

  it("replaces path-significant characters so one owner cannot address another", () => {
    // A slash would otherwise let a uid climb into a sibling's namespace.
    expect(ownerSegment("user/with/slash")).toBe("user_with_slash");
    expect(ownerSegment("../escape")).toBe(".._escape");
  });

  it("is idempotent, so re-normalising an already-built segment is safe", () => {
    const once = ownerSegment("user/with/slash");
    expect(ownerSegment(once)).toBe(once);
  });

  it.each([
    ["an empty string", ""],
    ["whitespace only", "   "],
    ["undefined", undefined],
    ["null", null],
  ])(
    "refuses %s rather than filing under a shared namespace",
    (_label, value) => {
      expect(() => ownerSegment(value)).toThrow("Media owner is required");
    },
  );

  it("maps a uid of only disallowed characters to underscores, not to a refusal", () => {
    // Known and bounded: distinct all-disallowed uids collide on one segment.
    // Firebase uids and api-key ids are entirely within the allowed set, so no
    // real owner reaches this; changing it would rewrite every existing path.
    expect(ownerSegment("///")).toBe("___");
    expect(ownerSegment("\u0000")).toBe("_");
  });

  it("never yields the anonymous bucket the image stores used to fall back to", () => {
    expect(() => ownerSegment(undefined)).toThrow();
    expect(ownerSegment("anonymous")).toBe("anonymous");
  });
});
