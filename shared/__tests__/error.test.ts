import { describe, it, expect } from "vitest";
import { toErrorMessage, toError } from "../utils/error";

describe("toErrorMessage", () => {
  it("returns the message of an Error instance", () => {
    expect(toErrorMessage(new Error("boom"))).toBe("boom");
  });

  it("returns the string itself when given a string", () => {
    expect(toErrorMessage("oops")).toBe("oops");
    expect(toErrorMessage("")).toBe("");
  });

  it("stringifies non-Error non-string values", () => {
    expect(toErrorMessage(42)).toBe("42");
    expect(toErrorMessage(0)).toBe("0");
    expect(toErrorMessage(null)).toBe("null");
    expect(toErrorMessage(undefined)).toBe("undefined");
    expect(toErrorMessage(true)).toBe("true");
    expect(toErrorMessage({ code: "X" })).toBe("[object Object]");
  });

  it("returns 'Unknown error' fallback when stringification throws", () => {
    // Proxy whose every property access throws — String(proxy) calls
    // proxy[Symbol.toPrimitive] which throws, exercising the catch branch.
    const evil = new Proxy(
      {},
      {
        get() {
          throw new Error("forbidden");
        },
      },
    );
    expect(toErrorMessage(evil)).toBe("Unknown error");
  });
});

describe("toError", () => {
  it("preserves Error subclass identity", () => {
    class MyError extends Error {}
    const err = new MyError("specific");
    const out = toError(err);
    expect(out).toBeInstanceOf(MyError);
    expect(out).toBe(err);
  });

  it("wraps strings in Error with the string as the message", () => {
    const err = toError("oops");
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("oops");
  });
});
