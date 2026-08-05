import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { readActionMode, readOobCode, safeRedirect } from "../authParams";

/**
 * The post-auth destination rule. It lived as five byte-identical copies, one
 * per auth page, so it could only be exercised by mounting a page — and a
 * change to one copy reached none of the others.
 */
describe("safeRedirect", () => {
  it("returns a same-origin path", () => {
    expect(safeRedirect("?redirect=/studio")).toBe("/studio");
    expect(safeRedirect("?redirect=/studio/abc%20def")).toBe("/studio/abc def");
  });

  it("returns null when there is no destination", () => {
    expect(safeRedirect("")).toBeNull();
    expect(safeRedirect("?other=/studio")).toBeNull();
    expect(safeRedirect("?redirect=")).toBeNull();
  });

  it("rejects destinations that leave the origin", () => {
    expect(safeRedirect("?redirect=https://evil.example/x")).toBeNull();
    expect(safeRedirect("?redirect=//evil.example/x")).toBeNull();
    expect(safeRedirect("?redirect=studio")).toBeNull();
    expect(safeRedirect("?redirect=javascript:alert(1)")).toBeNull();
  });

  it("only ever yields a single-slash-rooted path", () => {
    fc.assert(
      fc.property(fc.string(), (raw) => {
        const out = safeRedirect(`?redirect=${encodeURIComponent(raw)}`);
        if (out === null) return;
        expect(out.startsWith("/")).toBe(true);
        expect(out.startsWith("//")).toBe(false);
      }),
    );
  });
});

describe("readOobCode / readActionMode", () => {
  it("reads and trims the emailed link's parameters", () => {
    expect(readOobCode("?oobCode=%20abc%20")).toBe("abc");
    expect(readActionMode("?mode=%20resetPassword%20")).toBe("resetPassword");
  });

  it("returns null when the parameter is absent", () => {
    expect(readOobCode("?mode=resetPassword")).toBeNull();
    expect(readActionMode("?oobCode=abc")).toBeNull();
  });
});
