import { describe, expect, it } from "vitest";
import { getRequestContext, runWithRequestContext } from "../requestContext";

describe("requestContext", () => {
  describe("error handling", () => {
    it("does not leak context outside the run scope", () => {
      runWithRequestContext({ requestId: "scoped" }, () => {
        expect(getRequestContext()).toEqual({ requestId: "scoped" });
      });

      expect(getRequestContext()).toBeUndefined();
    });
  });

  describe("edge cases", () => {
    it("restores the previous context after nested runs", () => {
      runWithRequestContext({ requestId: "outer" }, () => {
        expect(getRequestContext()?.requestId).toBe("outer");

        runWithRequestContext({ requestId: "inner" }, () => {
          expect(getRequestContext()?.requestId).toBe("inner");
        });

        expect(getRequestContext()?.requestId).toBe("outer");
      });
    });
  });
});
