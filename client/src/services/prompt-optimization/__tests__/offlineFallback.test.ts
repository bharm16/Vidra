import { describe, expect, it } from "vitest";

import { ApiError } from "../../ApiClient";
import { isAbortError, shouldUseOfflineFallback } from "../offlineFallback";

describe("shouldUseOfflineFallback", () => {
  it("returns true for auth failures", () => {
    expect(shouldUseOfflineFallback(new ApiError("Unauthorized", 401))).toBe(
      true,
    );
    expect(
      shouldUseOfflineFallback(
        Object.assign(new Error("Forbidden"), { status: 403 }),
      ),
    ).toBe(true);
  });

  it("returns false for non-auth failures", () => {
    expect(shouldUseOfflineFallback(new Error("Network timeout"))).toBe(false);
    expect(
      shouldUseOfflineFallback(
        Object.assign(new Error("Boom"), { status: 500 }),
      ),
    ).toBe(false);
  });
});

describe("isAbortError", () => {
  it("detects abort-like errors", () => {
    expect(isAbortError(new DOMException("Aborted", "AbortError"))).toBe(true);
    expect(isAbortError({ code: "ABORT_ERR" })).toBe(true);
    expect(isAbortError(new Error("timeout"))).toBe(false);
  });
});
